-- Aether Migration: Harden campaign budget thresholds (90% soft / 100% hard close).
--
-- Builds on 20260603030000:
--   * Idempotent budget-exhaustion notifications (budget_exhaustion_notified_at).
--   * Shared SQL helpers aligned with lib/campaign-budget.ts (BUDGET_BLOCK_PCT = 0.9).
--   * 100% hard gate on clip submission (close + reject) before 90% soft gate.
--   * AFTER UPDATE trigger reconciles exhausted campaigns when rollups change.
--   * reconcile_exhausted_performance_campaigns() worker sweep (SKIP LOCKED).
--   * record_clip_earning alerts on exhausted-campaign accrual attempts.

-- ---------------------------------------------------------------------------
-- 1. Idempotent notification marker
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS budget_exhaustion_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.campaigns.budget_exhaustion_notified_at IS
    'When the brand was notified that the creator pool hit 100%. Set once; prevents duplicate notifications.';

-- ---------------------------------------------------------------------------
-- 2. Shared budget math (must match lib/campaign-budget.ts BUDGET_BLOCK_PCT = 0.9)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campaign_budget_used_pct(p_camp public.campaigns)
RETURNS numeric
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT CASE
        WHEN public.campaign_creator_pool(p_camp) <= 0 THEN 0::numeric
        ELSE LEAST(
            (COALESCE(p_camp.budget_reserved, 0) + COALESCE(p_camp.budget_paid, 0))
                / public.campaign_creator_pool(p_camp),
            1::numeric
        )
    END;
$$;

CREATE OR REPLACE FUNCTION public.campaign_blocks_clip_submission(p_camp public.campaigns)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
    SELECT p_camp.campaign_type = 'performance'
        AND (
            p_camp.status NOT IN ('open', 'in_progress')
            OR public.campaign_budget_remaining(p_camp) <= 0.005
            OR (
                public.campaign_creator_pool(p_camp) > 0
                AND public.campaign_budget_used_pct(p_camp) >= 0.9
            )
        );
$$;

COMMENT ON FUNCTION public.campaign_blocks_clip_submission(public.campaigns) IS
    'True when clip INSERT must be rejected (closed, 100% pool, or >= 90% used).';

-- ---------------------------------------------------------------------------
-- 3. close_performance_campaign_if_exhausted — notify exactly once
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
    v_rows   int;
    v_camp   public.campaigns%ROWTYPE;
    v_notify int;
BEGIN
    IF p_remaining > 0.005 THEN
        RETURN false;
    END IF;

    SELECT * INTO v_camp
        FROM public.campaigns
        WHERE id = p_campaign_id
        FOR UPDATE;

    IF NOT FOUND OR v_camp.campaign_type <> 'performance' THEN
        RETURN false;
    END IF;

    IF v_camp.status NOT IN ('open', 'in_progress') THEN
        RETURN false;
    END IF;

    UPDATE public.campaigns
        SET status = 'exhausted',
            budget_exhausted_at = COALESCE(budget_exhausted_at, now()),
            updated_at = now()
        WHERE id = p_campaign_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
        RETURN false;
    END IF;

    UPDATE public.campaigns
        SET budget_exhaustion_notified_at = now()
        WHERE id = p_campaign_id
          AND budget_exhaustion_notified_at IS NULL;

    GET DIAGNOSTICS v_notify = ROW_COUNT;

    SELECT * INTO v_camp FROM public.campaigns WHERE id = p_campaign_id;

    IF v_notify > 0 THEN
        INSERT INTO public.notifications (user_id, title, content, type)
        VALUES (
            v_camp.business_id,
            'Campaign budget exhausted',
            'Your performance campaign "' || COALESCE(v_camp.title, 'Untitled')
                || '" has used its full creator budget and is now closed to new earnings.',
            'budget'
        );
    END IF;

    RAISE LOG 'campaign.exhausted campaign=% notified=% trace=% remaining=%',
        p_campaign_id, (v_notify > 0), COALESCE(p_trace_id, '-'), p_remaining;
    RAISE WARNING '[ALERT] campaign.pool_exhausted campaign=% title=% trace=% notified=%',
        p_campaign_id, COALESCE(v_camp.title, '-'), COALESCE(p_trace_id, '-'), (v_notify > 0);

    RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Clip submission gates — 100% hard close then 90% soft (single campaign lock)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_clip_submission_gates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_camp      public.campaigns%ROWTYPE;
    v_pool      numeric;
    v_used      numeric;
    v_remaining numeric;
    v_pct       numeric;
    v_block     constant numeric := 0.9;
BEGIN
    SELECT * INTO v_camp
        FROM public.campaigns
        WHERE id = NEW.campaign_id
        FOR UPDATE;

    IF NOT FOUND OR v_camp.campaign_type <> 'performance' THEN
        RETURN NEW;
    END IF;

    IF v_camp.campaign_category IS NULL
        OR v_camp.campaign_category NOT IN ('ugc', 'clipping') THEN
        RAISE WARNING '[ALERT] clip.submit.missing_category campaign=%',
            v_camp.id;
        RAISE EXCEPTION 'campaign_category_unset'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This campaign is not configured for clip submissions.';
    END IF;

    IF v_camp.status NOT IN ('open', 'in_progress') THEN
        RAISE EXCEPTION 'campaign_not_accepting_clips'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This campaign is closed and is not accepting new clips.';
    END IF;

    IF COALESCE(array_length(v_camp.platforms, 1), 0) > 0
        AND NOT (NEW.platform = ANY (v_camp.platforms)) THEN
        RAISE WARNING '[ALERT] clip.submit.platform_rejected campaign=% platform=%',
            v_camp.id, NEW.platform;
        RAISE EXCEPTION 'clip_platform_not_allowed'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This clip platform is not allowed for this campaign.';
    END IF;

    v_pool      := public.campaign_creator_pool(v_camp);
    v_used      := COALESCE(v_camp.budget_reserved, 0) + COALESCE(v_camp.budget_paid, 0);
    v_remaining := public.campaign_budget_remaining(v_camp);
    v_pct       := public.campaign_budget_used_pct(v_camp);

    -- 100% hard gate: close idempotently, reject submission (race with earnings worker).
    IF v_remaining <= 0.005 THEN
        PERFORM public.close_performance_campaign_if_exhausted(
            v_camp.id, v_remaining, NULL);
        RAISE WARNING '[ALERT] clip.submit.blocked_100pct campaign=% used=% pool=%',
            v_camp.id, v_used, v_pool;
        RAISE EXCEPTION 'campaign_budget_exhausted'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This campaign has used its full budget and is closed to new clips.';
    END IF;

    -- 90% soft gate (submissions only; accrual continues until 100%).
    IF v_pool > 0 AND v_pct >= v_block THEN
        RAISE WARNING '[ALERT] clip.submit.blocked_90pct campaign=% used_pct=%',
            v_camp.id, round(v_pct::numeric, 4);
        RAISE EXCEPTION 'campaign_budget_nearly_full'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This campaign has used most of its budget and is no longer accepting new clips.';
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Reconcile close when budget rollups change (payout settlement, reversals)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.campaigns_reconcile_budget_threshold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_remaining numeric;
BEGIN
    IF NEW.campaign_type <> 'performance' THEN
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('open', 'in_progress') THEN
        RETURN NEW;
    END IF;

    v_remaining := public.campaign_budget_remaining(NEW);

    IF v_remaining <= 0.005 THEN
        PERFORM public.close_performance_campaign_if_exhausted(NEW.id, v_remaining, NULL);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaigns_budget_threshold_reconcile ON public.campaigns;
CREATE TRIGGER trg_campaigns_budget_threshold_reconcile
    AFTER UPDATE OF budget_reserved, budget_paid
    ON public.campaigns
    FOR EACH ROW
    WHEN (
        NEW.campaign_type = 'performance'
        AND NEW.status IN ('open', 'in_progress')
    )
    EXECUTE FUNCTION public.campaigns_reconcile_budget_threshold();

-- ---------------------------------------------------------------------------
-- 6. Worker / cron sweep — close any open performance campaign at 100% pool
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_exhausted_performance_campaigns(
    p_trace_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row   record;
    v_count int := 0;
BEGIN
    FOR v_row IN
        SELECT c.id, public.campaign_budget_remaining(c) AS remaining
        FROM public.campaigns c
        WHERE c.campaign_type = 'performance'
          AND c.status IN ('open', 'in_progress')
          AND public.campaign_budget_remaining(c) <= 0.005
        FOR UPDATE OF c SKIP LOCKED
    LOOP
        IF public.close_performance_campaign_if_exhausted(
            v_row.id, v_row.remaining, p_trace_id) THEN
            v_count := v_count + 1;
        END IF;
    END LOOP;

    IF v_count > 0 THEN
        RAISE LOG 'campaign.reconcile_exhausted count=% trace=%',
            v_count, COALESCE(p_trace_id, '-');
    END IF;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_exhausted_performance_campaigns(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Index — worker sweep + submission hot path
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campaigns_perf_open_budget
    ON public.campaigns (id)
    WHERE campaign_type = 'performance'
      AND status IN ('open', 'in_progress');

-- ---------------------------------------------------------------------------
-- 8. record_clip_earning — alert on accrual against exhausted campaigns
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
    SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_clip.status = 'tracking'
        AND v_clip.quality_status IS DISTINCT FROM 'approved' THEN
        RAISE WARNING '[ALERT] earnings.invariant_violation clip=% status=% quality=% trace=%',
            p_clip_id, v_clip.status, v_clip.quality_status, COALESCE(p_trace_id, '-');
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

    IF v_camp.status NOT IN ('open', 'in_progress') THEN
        IF v_camp.status = 'exhausted' THEN
            RAISE WARNING '[ALERT] earnings.attempt_on_exhausted_campaign clip=% campaign=% trace=%',
                p_clip_id, v_camp.id, COALESCE(p_trace_id, '-');
        END IF;
        RETURN 0;
    END IF;

    v_eff_cpm := COALESCE(v_camp.brand_cpm_rate, v_camp.cpm_rate);
    IF v_eff_cpm IS NULL OR v_eff_cpm <= 0 THEN
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
    v_used_pct       := public.campaign_budget_used_pct(v_camp);

    IF v_remaining_pool < 0 THEN
        RAISE WARNING '[ALERT] earnings.pool_negative campaign=% remaining=% pool=% trace=%',
            v_camp.id, v_remaining_pool, v_pool, COALESCE(p_trace_id, '-');
    END IF;

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

        PERFORM public.close_performance_campaign_if_exhausted(
            v_camp.id, v_remaining_pool, p_trace_id);
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

    RAISE LOG 'earnings.accrued clip=% campaign=% amount=% remaining_after=% trace=%',
        v_clip.id, v_camp.id, v_amount, v_remaining_after, COALESCE(p_trace_id, '-');

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
