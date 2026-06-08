-- Aether Migration: accrue performance earnings only in full 1,000-view blocks.
--
-- A campaign CPM/RPM is a price per 1,000 verified views. Partial blocks remain
-- visible in current_views but do not become money until the next full block.

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
    'Atomically converts verified clip views into earnings. Only complete 1,000-view blocks are paid; partial remainders remain in current_views until a later sync completes the block.';

COMMENT ON COLUMN public.clips.counted_views IS
    'High-water mark of views already converted to earnings. Advances only in paid 1,000-view blocks; current_views may exceed this by an unpaid remainder.';
