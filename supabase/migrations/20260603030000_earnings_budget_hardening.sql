-- Aether Migration: Harden record_clip_earning + budget thresholds (production scale).
--
-- Adds:
--   * Immutable budget rollups constraints (defense in depth; NOT VALID for legacy).
--   * campaign_creator_pool() / campaign_budget_remaining() helpers (single pool math).
--   * close_performance_campaign_if_exhausted() — idempotent 100% close + notify-once.
--   * BEFORE INSERT trigger on clips — DB-enforced 90% submission gate (not app-only).
--   * budget_exhausted_at timestamp for observability / idempotent close.
--   * View-sync index for tracking clips ordered by last_synced_at.
--   * record_clip_earning: optional p_trace_id, unified close path, 90% warning log.

-- ---------------------------------------------------------------------------
-- 1. Observability column + budget integrity constraints
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS budget_exhausted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.campaigns.budget_exhausted_at IS
    'When the performance pool first hit 100% and the campaign was auto-closed to exhausted.';

ALTER TABLE public.campaigns
    DROP CONSTRAINT IF EXISTS campaigns_budget_rollups_nonneg;
ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_budget_rollups_nonneg
        CHECK (budget_reserved >= 0 AND budget_paid >= 0)
        NOT VALID;

-- Post-fee pool is the hard ceiling for reserved+paid. NOT VALID so corrupt legacy
-- rows are not rejected on migration apply; new writes are still checked.
ALTER TABLE public.campaigns
    DROP CONSTRAINT IF EXISTS campaigns_budget_within_pool;
ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_budget_within_pool
        CHECK (
            campaign_type <> 'performance'
            OR (budget_reserved + budget_paid)
                <= COALESCE(available_pool, budget_pool, 0) + 0.01
        )
        NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Shared pool math (must match lib/campaign-budget.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campaign_creator_pool(p_camp public.campaigns)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT COALESCE(p_camp.available_pool, p_camp.budget_pool, 0);
$$;

COMMENT ON FUNCTION public.campaign_creator_pool(public.campaigns) IS
    'Creator-earnable pool after platform fee (available_pool) or legacy budget_pool.';

CREATE OR REPLACE FUNCTION public.campaign_budget_remaining(p_camp public.campaigns)
RETURNS numeric
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT public.campaign_creator_pool(p_camp)
           - COALESCE(p_camp.budget_reserved, 0)
           - COALESCE(p_camp.budget_paid, 0);
$$;

COMMENT ON FUNCTION public.campaign_budget_remaining(public.campaigns) IS
    'Remaining creator pool = creator_pool - reserved - paid.';

-- ---------------------------------------------------------------------------
-- 3. Idempotent 100% close + exactly-once brand notification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_performance_campaign_if_exhausted(
    p_campaign_id uuid,
    p_remaining numeric,
    p_trace_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rows int;
    v_camp public.campaigns%ROWTYPE;
BEGIN
    IF p_remaining > 0.005 THEN
        RETURN false;
    END IF;

    UPDATE public.campaigns
        SET status = 'exhausted',
            budget_exhausted_at = COALESCE(budget_exhausted_at, now()),
            updated_at = now()
        WHERE id = p_campaign_id
          AND campaign_type = 'performance'
          AND status IN ('open', 'in_progress');

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
        RETURN false;
    END IF;

    SELECT * INTO v_camp FROM public.campaigns WHERE id = p_campaign_id;

    INSERT INTO public.notifications (user_id, title, content, type)
    VALUES (
        v_camp.business_id,
        'Campaign budget exhausted',
        'Your performance campaign "' || COALESCE(v_camp.title, 'Untitled')
            || '" has used its full creator budget and is now closed to new earnings.',
        'budget'
    );

    RAISE LOG 'campaign.exhausted campaign=% trace=% remaining=%',
        p_campaign_id, COALESCE(p_trace_id, '-'), p_remaining;
    RAISE WARNING '[ALERT] campaign.pool_exhausted campaign=% title=% trace=%',
        p_campaign_id, COALESCE(v_camp.title, '-'), COALESCE(p_trace_id, '-');

    RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. DB-enforced 90% submission gate (soft) — aligns with BUDGET_BLOCK_PCT = 0.9
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_clip_submission_budget_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_camp public.campaigns%ROWTYPE;
    v_pool   numeric;
    v_used   numeric;
    v_pct    numeric;
    v_block  constant numeric := 0.9;
BEGIN
    SELECT * INTO v_camp
        FROM public.campaigns
        WHERE id = NEW.campaign_id
        FOR UPDATE;

    IF NOT FOUND OR v_camp.campaign_type <> 'performance' THEN
        RETURN NEW;
    END IF;

    IF v_camp.status NOT IN ('open', 'in_progress') THEN
        RAISE EXCEPTION 'campaign_not_accepting_clips'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This campaign is closed and is not accepting new clips.';
    END IF;

    v_pool := public.campaign_creator_pool(v_camp);
    v_used := COALESCE(v_camp.budget_reserved, 0) + COALESCE(v_camp.budget_paid, 0);
    IF v_pool > 0 THEN
        v_pct := v_used / v_pool;
        IF v_pct >= v_block THEN
            RAISE WARNING '[ALERT] clip.submit.blocked_90pct campaign=% used_pct=% trace=-',
                v_camp.id, round(v_pct::numeric, 4);
            RAISE EXCEPTION 'campaign_budget_nearly_full'
                USING ERRCODE = 'check_violation',
                      MESSAGE = 'This campaign has used most of its budget and is no longer accepting new clips.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clips_budget_submission_gate ON public.clips;
CREATE TRIGGER trg_clips_budget_submission_gate
    BEFORE INSERT ON public.clips
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_clip_submission_budget_gate();

-- ---------------------------------------------------------------------------
-- 5. View-sync index (tracking clips, oldest sync first)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clips_tracking_last_synced
    ON public.clips (last_synced_at ASC NULLS FIRST)
    WHERE status = 'tracking';

-- ---------------------------------------------------------------------------
-- 6. record_clip_earning — hardened (replaces 20260603010000 body)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_clip_earning(
    p_clip_id uuid,
    p_new_views bigint,
    p_trace_id text DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    v_clip            public.clips%ROWTYPE;
    v_camp            public.campaigns%ROWTYPE;
    v_part            public.participations%ROWTYPE;
    v_billable        bigint;
    v_eff_cpm         numeric;
    v_raw_amount      numeric;
    v_remaining_pool  numeric;
    v_remaining_cap   numeric;
    v_amount          numeric;
    v_pool            numeric;
    v_used            numeric;
    v_used_pct        numeric;
    v_remaining_after numeric;
    v_closed          boolean;
BEGIN
    -- Lock order (deadlock-safe): clip -> campaign -> participation.
    SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_clip.status <> 'tracking' THEN
        RETURN 0;
    END IF;

    IF v_clip.quality_status IS DISTINCT FROM 'approved' THEN
        RETURN 0;
    END IF;

    SELECT * INTO v_camp FROM public.campaigns WHERE id = v_clip.campaign_id FOR UPDATE;
    IF NOT FOUND OR v_camp.campaign_type <> 'performance' THEN
        RETURN 0;
    END IF;

    v_eff_cpm := COALESCE(v_camp.brand_cpm_rate, v_camp.cpm_rate);
    IF v_eff_cpm IS NULL OR v_eff_cpm <= 0 THEN
        RETURN 0;
    END IF;

    IF v_camp.status NOT IN ('open', 'in_progress') THEN
        RETURN 0;
    END IF;

    SELECT * INTO v_part FROM public.participations WHERE id = v_clip.participation_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    v_billable := GREATEST(p_new_views - v_clip.counted_views, 0);
    IF v_billable = 0 THEN
        RETURN 0;
    END IF;

    v_raw_amount := ROUND((v_billable::numeric / 1000.0) * v_eff_cpm, 2);
    v_amount     := v_raw_amount;

    IF v_camp.max_payout_per_creator IS NOT NULL THEN
        v_remaining_cap := v_camp.max_payout_per_creator - v_part.total_earned;
        v_amount := LEAST(v_amount, GREATEST(v_remaining_cap, 0));
    END IF;

    v_remaining_pool := public.campaign_budget_remaining(v_camp);
    v_pool           := public.campaign_creator_pool(v_camp);
    v_used           := COALESCE(v_camp.budget_reserved, 0) + COALESCE(v_camp.budget_paid, 0);
    v_used_pct       := CASE WHEN v_pool > 0 THEN v_used / v_pool ELSE 0 END;

    IF v_remaining_pool < 0 THEN
        RAISE WARNING '[ALERT] earnings.pool_negative campaign=% title=% remaining=% reserved=% paid=% pool=% trace=%',
            v_camp.id, COALESCE(v_camp.title, '-'), v_remaining_pool,
            v_camp.budget_reserved, v_camp.budget_paid, v_pool,
            COALESCE(p_trace_id, '-');
    END IF;

    -- Soft 90% gate observability (submissions blocked in trigger; accrual continues).
    IF v_used_pct >= 0.9 AND v_used_pct < 1.0 THEN
        RAISE LOG 'earnings.near_exhaustion clip=% campaign=% used_pct=% trace=%',
            v_clip.id, v_camp.id, round(v_used_pct::numeric, 4), COALESCE(p_trace_id, '-');
    END IF;

    v_amount := LEAST(v_amount, GREATEST(v_remaining_pool, 0));

    IF v_amount < v_raw_amount THEN
        RAISE LOG 'earnings.clamped clip=% campaign=% raw=% paid=% remaining_pool=% trace=%',
            v_clip.id, v_camp.id, v_raw_amount, v_amount, v_remaining_pool,
            COALESCE(p_trace_id, '-');
        IF v_remaining_pool <= 0.005 THEN
            RAISE WARNING '[ALERT] earnings.clamped_at_exhaustion clip=% campaign=% trace=%',
                v_clip.id, v_camp.id, COALESCE(p_trace_id, '-');
        END IF;
    END IF;

    v_remaining_after := v_remaining_pool - v_amount;

    IF v_amount <= 0 THEN
        UPDATE public.clips
            SET counted_views = p_new_views,
                current_views = GREATEST(current_views, p_new_views),
                last_synced_at = now(),
                updated_at = now()
            WHERE id = p_clip_id;

        v_closed := public.close_performance_campaign_if_exhausted(
            v_camp.id, v_remaining_pool, p_trace_id);
        IF v_closed THEN
            NULL; -- notification sent inside helper
        END IF;
        RETURN 0;
    END IF;

    INSERT INTO public.earnings (
        clip_id, participation_id, campaign_id, creator_id,
        billable_views, effective_cpm, amount, status
    ) VALUES (
        v_clip.id, v_clip.participation_id, v_camp.id, v_clip.creator_id,
        v_billable, v_eff_cpm, v_amount, 'accrued'
    );

    UPDATE public.clips
        SET counted_views = p_new_views,
            current_views = GREATEST(current_views, p_new_views),
            last_synced_at = now(),
            updated_at = now()
        WHERE id = p_clip_id;

    UPDATE public.campaigns
        SET budget_reserved = budget_reserved + v_amount
        WHERE id = v_camp.id;

    UPDATE public.participations
        SET total_views  = total_views + v_billable,
            total_earned = total_earned + v_amount
        WHERE id = v_part.id;

    RAISE LOG 'earnings.accrued clip=% campaign=% creator=% billable=% cpm=% amount=% remaining_after=% trace=%',
        v_clip.id, v_camp.id, v_clip.creator_id, v_billable, v_eff_cpm, v_amount,
        v_remaining_after, COALESCE(p_trace_id, '-');

    PERFORM public.close_performance_campaign_if_exhausted(
        v_camp.id, v_remaining_after, p_trace_id);

    RETURN v_amount;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[ALERT] earnings.exception clip=% sqlstate=% msg=% trace=%',
            p_clip_id, SQLSTATE, SQLERRM, COALESCE(p_trace_id, '-');
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.record_clip_earning(uuid, bigint, text) IS
    'Atomically accrue earnings for billable views. Optional p_trace_id correlates worker logs.';
