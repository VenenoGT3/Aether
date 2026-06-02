-- Aether Migration: creator-set CPM rate
--
-- Additive. A creator can propose their own pay-per-1000-views rate when joining
-- a performance campaign, stored on their participation. The earnings function
-- now uses that rate (falling back to the campaign's base CPM when unset), so a
-- creator's clips accrue at their chosen rate.
--
-- Safety: the join flow clamps creator_cpm_rate to <= the campaign's cpm_rate
-- (the brand's offered ceiling), and the per-creator cap + shared pool still
-- bound total spend — a creator can bid DOWN to be competitive, never above the
-- brand's offer. Backward compatible: NULL => use the campaign cpm_rate.

ALTER TABLE public.participations
    ADD COLUMN IF NOT EXISTS creator_cpm_rate NUMERIC(10,2)
        CHECK (creator_cpm_rate IS NULL OR creator_cpm_rate >= 0);

COMMENT ON COLUMN public.participations.creator_cpm_rate IS
    'Creator''s chosen $ per 1,000 views for this campaign. NULL => use campaigns.cpm_rate. Clamped to <= campaign cpm_rate at join time.';

-- ---------------------------------------------------------------------------
-- Re-create record_clip_earning to honor the creator's chosen CPM.
-- Identical to the Phase 1 version except v_eff_cpm now prefers the
-- participation's creator_cpm_rate (COALESCE to the campaign base rate).
-- ---------------------------------------------------------------------------
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
    -- Lock the clip first (serialize concurrent syncs of the same clip).
    SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Only actively tracked clips accrue earnings.
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

    -- Lock the participation (per-creator caps + rollups + chosen CPM).
    SELECT * INTO v_part FROM public.participations WHERE id = v_clip.participation_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Billable views = monotonic delta above the watermark, never negative.
    v_billable := GREATEST(p_new_views - v_clip.counted_views, 0);
    IF v_billable = 0 THEN
        RETURN 0;
    END IF;

    -- Effective CPM: the creator's chosen rate when set, else the campaign base.
    v_eff_cpm := COALESCE(v_part.creator_cpm_rate, v_camp.cpm_rate);
    v_amount  := ROUND((v_billable::numeric / 1000.0) * v_eff_cpm, 2);

    -- Apply per-creator cap (NULL = uncapped).
    IF v_camp.max_payout_per_creator IS NOT NULL THEN
        v_remaining_cap := v_camp.max_payout_per_creator - v_part.total_earned;
        v_amount := LEAST(v_amount, GREATEST(v_remaining_cap, 0));
    END IF;

    -- Apply remaining-pool cap (pool - reserved - paid).
    v_remaining_pool := COALESCE(v_camp.budget_pool, 0)
                        - v_camp.budget_reserved
                        - v_camp.budget_paid;
    v_amount := LEAST(v_amount, GREATEST(v_remaining_pool, 0));

    IF v_amount <= 0 THEN
        -- Cap or pool exhausted: advance the watermark so we don't recompute this
        -- delta forever, but accrue nothing.
        UPDATE public.clips
            SET counted_views = p_new_views,
                current_views = GREATEST(current_views, p_new_views),
                last_synced_at = now(),
                updated_at = now()
            WHERE id = p_clip_id;
        RETURN 0;
    END IF;

    -- 1) Append immutable earnings ledger row (effective_cpm records what paid).
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

    -- 4) Update per-creator rollups.
    UPDATE public.participations
        SET total_views  = total_views + v_billable,
            total_earned = total_earned + v_amount
        WHERE id = v_part.id;

    RETURN v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
