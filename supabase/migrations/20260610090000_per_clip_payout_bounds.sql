-- Aether Migration: per-clip payout bounds (Content Rewards parity).
--
-- Two new campaign knobs:
--   max_payout_per_clip — a single clip stops earning at this amount even if
--     its views keep growing (CR's per-video "maximum payout").
--   min_payout_per_clip — a clip earns nothing until its prospective earnings
--     reach this floor; once it qualifies it pays RETROACTIVELY in full
--     (CR semantics: a $6 floor at €3 CPM means videos under 2,000 views never
--     qualify, but a qualifying video is paid from view zero). Implemented by
--     not advancing counted_views below the floor, so pending blocks accumulate
--     and accrue in one batch at qualification.
--
-- Both bounds are locked after funding (guard trigger below), same as the
-- other money terms.

ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS max_payout_per_clip NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS min_payout_per_clip NUMERIC(12,2);

COMMENT ON COLUMN public.campaigns.max_payout_per_clip IS
    'Per-clip earnings ceiling. NULL = unlimited. Enforced atomically in record_clip_earning.';
COMMENT ON COLUMN public.campaigns.min_payout_per_clip IS
    'Per-clip qualification floor: a clip accrues nothing until its prospective earnings reach this amount, then pays retroactively in full. NULL = no floor.';

-- ---------------------------------------------------------------------------
-- record_clip_earning v3: block accrual + per-creator cap + pool clamp
-- (unchanged) + NEW per-clip floor gate and per-clip cap.
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
    v_view_block_size constant bigint := 1000;
    v_unpaid_views    bigint;
    v_billable        bigint;
    v_counted_after   bigint;
    v_eff_cpm         numeric;
    v_raw_amount      numeric;
    v_remaining_pool  numeric;
    v_remaining_cap   numeric;
    v_clip_earned     numeric := 0;
    v_remaining_clip_cap numeric;
    v_amount          numeric;
    v_pool            numeric;
    v_used            numeric;
    v_used_pct        numeric;
    v_remaining_after numeric;
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

    v_unpaid_views := GREATEST(p_new_views - v_clip.counted_views, 0);
    v_billable := (v_unpaid_views / v_view_block_size) * v_view_block_size;

    IF v_billable = 0 THEN
        UPDATE public.clips
            SET current_views = GREATEST(current_views, p_new_views),
                last_synced_at = now(),
                updated_at = now()
            WHERE id = p_clip_id;
        RETURN 0;
    END IF;

    v_counted_after := v_clip.counted_views + v_billable;
    v_raw_amount := ROUND((v_billable::numeric / v_view_block_size::numeric) * v_eff_cpm, 2);
    v_amount     := v_raw_amount;

    IF (v_camp.min_payout_per_clip IS NOT NULL AND v_camp.min_payout_per_clip > 0)
       OR (v_camp.max_payout_per_clip IS NOT NULL AND v_camp.max_payout_per_clip > 0)
    THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_clip_earned
        FROM public.earnings
        WHERE clip_id = p_clip_id AND status <> 'reversed';
    END IF;

    -- Qualification floor: below it, record visibility but do NOT advance
    -- counted_views — the pending blocks accumulate and pay retroactively in
    -- one accrual once the clip qualifies.
    IF v_camp.min_payout_per_clip IS NOT NULL
       AND v_camp.min_payout_per_clip > 0
       AND v_clip_earned = 0
       AND v_raw_amount < v_camp.min_payout_per_clip
    THEN
        UPDATE public.clips
            SET current_views = GREATEST(current_views, p_new_views),
                last_synced_at = now(),
                updated_at = now()
            WHERE id = p_clip_id;
        RAISE LOG 'earnings.below_clip_floor clip=% campaign=% prospective=% floor=% trace=%',
            v_clip.id, v_camp.id, v_raw_amount, v_camp.min_payout_per_clip,
            COALESCE(p_trace_id, '-');
        RETURN 0;
    END IF;

    IF v_camp.max_payout_per_creator IS NOT NULL THEN
        v_remaining_cap := v_camp.max_payout_per_creator - v_part.total_earned;
        v_amount := LEAST(v_amount, GREATEST(v_remaining_cap, 0));
    END IF;

    -- Per-clip ceiling: a single clip stops earning at the cap.
    IF v_camp.max_payout_per_clip IS NOT NULL AND v_camp.max_payout_per_clip > 0 THEN
        v_remaining_clip_cap := v_camp.max_payout_per_clip - v_clip_earned;
        v_amount := LEAST(v_amount, GREATEST(v_remaining_clip_cap, 0));
        IF v_remaining_clip_cap <= 0 THEN
            RAISE LOG 'earnings.clip_cap_reached clip=% campaign=% cap=% trace=%',
                v_clip.id, v_camp.id, v_camp.max_payout_per_clip, COALESCE(p_trace_id, '-');
        END IF;
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
        SET counted_views = v_counted_after,
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

    RAISE LOG 'earnings.accrued clip=% campaign=% billable_views=% amount=% remaining_after=% trace=%',
        v_clip.id, v_camp.id, v_billable, v_amount, v_remaining_after, COALESCE(p_trace_id, '-');

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
    'Atomically converts verified clip views into earnings. Full 1,000-view blocks only; per-clip floor (retroactive qualification) and per-clip cap enforced alongside the per-creator cap and pool clamp.';

-- ---------------------------------------------------------------------------
-- Lock the new bounds after funding, same as the other money terms.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_campaign_authoritative_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL
       OR public.aether_is_service_role()
       OR current_setting('aether.campaign_funding', true) = 'true'
    THEN
        RETURN NEW;
    END IF;

    IF COALESCE(OLD.campaign_type, 'fixed') <> 'performance'
       AND COALESCE(NEW.campaign_type, 'fixed') <> 'performance'
    THEN
        RETURN NEW;
    END IF;

    IF NEW.funded_at IS DISTINCT FROM OLD.funded_at
        OR NEW.funding_payment_intent_id IS DISTINCT FROM OLD.funding_payment_intent_id
        OR NEW.budget_reserved IS DISTINCT FROM OLD.budget_reserved
        OR NEW.budget_paid IS DISTINCT FROM OLD.budget_paid
        OR NEW.available_pool IS DISTINCT FROM OLD.available_pool
    THEN
        RAISE EXCEPTION 'campaign_funding_field_forbidden'
            USING ERRCODE = '42501',
                  MESSAGE = 'Campaign funding fields are updated only by Stripe-backed server flows.';
    END IF;

    IF OLD.funding_payment_intent_id IS NOT NULL
       AND (
            NEW.budget_total IS DISTINCT FROM OLD.budget_total
            OR NEW.budget_pool IS DISTINCT FROM OLD.budget_pool
            OR NEW.brand_cpm_rate IS DISTINCT FROM OLD.brand_cpm_rate
            OR NEW.cpm_rate IS DISTINCT FROM OLD.cpm_rate
            OR NEW.platform_fee_pct IS DISTINCT FROM OLD.platform_fee_pct
            OR NEW.max_payout_per_creator IS DISTINCT FROM OLD.max_payout_per_creator
            OR NEW.min_payout_threshold IS DISTINCT FROM OLD.min_payout_threshold
            OR NEW.max_payout_per_clip IS DISTINCT FROM OLD.max_payout_per_clip
            OR NEW.min_payout_per_clip IS DISTINCT FROM OLD.min_payout_per_clip
       )
    THEN
        RAISE EXCEPTION 'funded_campaign_money_terms_locked'
            USING ERRCODE = '42501',
                  MESSAGE = 'Money terms are locked after pool funding starts.';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
            OLD.status = 'draft'::public.campaign_status
            AND NEW.status = 'cancelled'::public.campaign_status
        ) THEN
            RAISE EXCEPTION 'campaign_status_transition_forbidden'
                USING ERRCODE = '42501',
                      MESSAGE = 'Use the Stripe funding or moderation server flow to change performance campaign status.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
