-- Aether Migration: budget thresholds (100% auto-close) in the earnings function.
--
-- Re-creates record_clip_earning (last set in 20260602070000) with two additions:
--   1. STATUS GUARD: only accrue on campaigns that are 'open' / 'in_progress'.
--      A closed / 'exhausted' / 'cancelled' campaign accrues nothing, so the
--      worker automatically respects closed campaigns.
--   2. 100% AUTO-CLOSE: after reserving funds, if the pool is fully consumed,
--      set the campaign to 'exhausted' and notify the brand — all inside the
--      campaign row's FOR UPDATE lock, so it is concurrency-safe (no overspend,
--      exactly-once close).
--
-- The 90% submission block is enforced at the API layer (clip submission); this
-- function is the hard money guarantee (the remaining-pool cap already prevents
-- overspend regardless of the soft 90% gate).

CREATE OR REPLACE FUNCTION public.record_clip_earning(
    p_clip_id uuid,
    p_new_views bigint
)
RETURNS numeric AS $$
DECLARE
    v_clip            public.clips%ROWTYPE;
    v_camp            public.campaigns%ROWTYPE;
    v_part            public.participations%ROWTYPE;
    v_billable        bigint;
    v_eff_cpm         numeric;
    v_remaining_pool  numeric;
    v_remaining_cap   numeric;
    v_amount          numeric;
BEGIN
    SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_clip.status <> 'tracking' THEN
        RETURN 0;
    END IF;

    -- Lock the campaign row so all clips serialize on the shared pool.
    SELECT * INTO v_camp FROM public.campaigns WHERE id = v_clip.campaign_id FOR UPDATE;
    IF NOT FOUND
        OR v_camp.campaign_type <> 'performance'
        OR v_camp.cpm_rate IS NULL THEN
        RETURN 0;
    END IF;

    -- Respect closed campaigns: only live campaigns accrue (exhausted / completed
    -- / cancelled / draft accrue nothing). This is what makes the worker honor a
    -- 100%-exhausted campaign.
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

    -- Effective CPM: the creator's chosen rate when set, else the campaign base.
    v_eff_cpm := COALESCE(v_part.creator_cpm_rate, v_camp.cpm_rate);
    v_amount  := ROUND((v_billable::numeric / 1000.0) * v_eff_cpm, 2);

    -- Per-creator cap (NULL = uncapped).
    IF v_camp.max_payout_per_creator IS NOT NULL THEN
        v_remaining_cap := v_camp.max_payout_per_creator - v_part.total_earned;
        v_amount := LEAST(v_amount, GREATEST(v_remaining_cap, 0));
    END IF;

    -- Remaining-pool cap (pool - reserved - paid) — the hard overspend guard.
    v_remaining_pool := COALESCE(v_camp.budget_pool, 0)
                        - v_camp.budget_reserved
                        - v_camp.budget_paid;
    v_amount := LEAST(v_amount, GREATEST(v_remaining_pool, 0));

    IF v_amount <= 0 THEN
        -- Cap or pool exhausted: advance the watermark, accrue nothing. If the
        -- pool is fully used, close the campaign here too (handles the case where
        -- nothing new was billable but the pool was already at 100%).
        UPDATE public.clips
            SET counted_views = p_new_views,
                current_views = GREATEST(current_views, p_new_views),
                last_synced_at = now(),
                updated_at = now()
            WHERE id = p_clip_id;

        IF v_remaining_pool <= 0.005 THEN
            UPDATE public.campaigns
                SET status = 'exhausted', updated_at = now()
                WHERE id = v_camp.id AND status IN ('open', 'in_progress');
        END IF;
        RETURN 0;
    END IF;

    -- 1) Append the immutable earnings ledger row.
    INSERT INTO public.earnings (
        clip_id, participation_id, campaign_id, creator_id,
        billable_views, effective_cpm, amount, status
    ) VALUES (
        v_clip.id, v_clip.participation_id, v_camp.id, v_clip.creator_id,
        v_billable, v_eff_cpm, v_amount, 'accrued'
    );

    -- 2) Advance the clip watermark.
    UPDATE public.clips
        SET counted_views = p_new_views,
            current_views = GREATEST(current_views, p_new_views),
            last_synced_at = now(),
            updated_at = now()
        WHERE id = p_clip_id;

    -- 3) Reserve the funds against the campaign pool.
    UPDATE public.campaigns
        SET budget_reserved = budget_reserved + v_amount
        WHERE id = v_camp.id;

    -- 3b) 100% threshold: if this reservation consumed the pool, auto-close the
    -- campaign and notify the brand. Inside the campaign FOR UPDATE lock => safe
    -- and exactly-once (a concurrent call re-reads 'exhausted' and bails above).
    IF (v_remaining_pool - v_amount) <= 0.005 THEN
        UPDATE public.campaigns
            SET status = 'exhausted', updated_at = now()
            WHERE id = v_camp.id AND status IN ('open', 'in_progress');

        INSERT INTO public.notifications (user_id, title, content, type)
        VALUES (
            v_camp.business_id,
            'Campaign budget exhausted',
            'Your performance campaign "' || COALESCE(v_camp.title, 'Untitled')
                || '" has used its full budget pool and is now closed to new earnings.',
            'budget'
        );
    END IF;

    -- 4) Update per-creator rollups.
    UPDATE public.participations
        SET total_views  = total_views + v_billable,
            total_earned = total_earned + v_amount
        WHERE id = v_part.id;

    RETURN v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
