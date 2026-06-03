-- Aether Migration: Brand-set CPM model + hardened earnings accrual.
--
-- WHAT CHANGES
--   The effective payout rate ($ per 1,000 paid views) moves from the creator's
--   chosen rate (participations.creator_cpm_rate) to a BRAND-defined rate that is
--   the single source of truth: campaigns.brand_cpm_rate.
--
-- WHY (financial integrity)
--   The creator-CPM ceiling was enforced only in application code (joinCampaign's
--   Math.min). The only DB invariant was `creator_cpm_rate >= 0`, so any other
--   write path could persist a rate above the brand's offer and overpay forever.
--   Making the brand rate the authoritative, DB-resident value removes that class
--   of bug entirely.
--
-- BACKWARD COMPATIBILITY
--   - brand_cpm_rate is backfilled from the legacy cpm_rate for existing
--     performance campaigns.
--   - cpm_rate is kept in sync (writers set both) so legacy read paths keep
--     working; record_clip_earning prefers brand_cpm_rate and falls back to
--     cpm_rate only during the transition.
--   - creator_cpm_rate is RETAINED (not dropped) for historical earnings rows,
--     but is no longer read by record_clip_earning and no longer written on join.
--
-- ISOLATION / CONCURRENCY (unchanged, restated for the record)
--   record_clip_earning runs under READ COMMITTED and serializes all conflicting
--   access with pessimistic row locks taken in a fixed order (clip -> campaign ->
--   participation). The campaign row is the single serialization point for the
--   shared pool, so the pool can never be overspent regardless of how many clips
--   accrue concurrently. SERIALIZABLE is intentionally NOT used: it would add
--   serialization-failure retries without changing the outcome the FOR UPDATE on
--   the campaign already guarantees. Idempotency is the clip's counted_views
--   high-water mark: re-delivered jobs bill GREATEST(new - counted, 0) = 0.

-- ---------------------------------------------------------------------------
-- 1. brand_cpm_rate: single source of truth for performance payouts.
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS brand_cpm_rate NUMERIC(10,2)
        CHECK (brand_cpm_rate IS NULL OR brand_cpm_rate >= 0);

COMMENT ON COLUMN public.campaigns.brand_cpm_rate IS
    'Brand-defined $ per 1,000 paid views. SINGLE SOURCE OF TRUTH for performance payouts. cpm_rate is kept in sync for legacy reads.';

-- 2. Backfill existing performance campaigns from the legacy cpm_rate.
UPDATE public.campaigns
    SET brand_cpm_rate = cpm_rate
    WHERE campaign_type = 'performance'
      AND brand_cpm_rate IS NULL
      AND cpm_rate IS NOT NULL;

-- 3. Require a brand rate for NEW/updated performance campaigns. NOT VALID so we
--    never reject legacy rows that predate the backfill; enforced on every future
--    insert/update (defense in depth alongside app-layer validation).
ALTER TABLE public.campaigns
    DROP CONSTRAINT IF EXISTS campaigns_perf_requires_brand_cpm;
ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_perf_requires_brand_cpm
        CHECK (campaign_type <> 'performance' OR brand_cpm_rate IS NOT NULL)
        NOT VALID;

-- 4. Deprecate creator_cpm_rate (retain for historical rows; ignored by earnings).
COMMENT ON COLUMN public.participations.creator_cpm_rate IS
    'DEPRECATED (brand-set CPM model). Retained for historical rows only; record_clip_earning ignores it and pays campaigns.brand_cpm_rate.';

-- 5. Indexes for high-read paths (not covered by existing indexes):
--    - performance-campaign discovery / join eligibility (campaign_type+status).
CREATE INDEX IF NOT EXISTS idx_campaigns_perf_status
    ON public.campaigns(status)
    WHERE campaign_type = 'performance';
--    - per-campaign clip reads by status (brand summary, moderation, fan-out).
CREATE INDEX IF NOT EXISTS idx_clips_campaign_status
    ON public.clips(campaign_id, status);
-- (participations(campaign_id, influencer_id) is already covered by the
--  unique_campaign_influencer constraint — no extra index needed.)

-- ---------------------------------------------------------------------------
-- 6. record_clip_earning: brand-set CPM + observability.
--    Re-creates 20260602120000 (quality guard + available_pool accounting),
--    changing ONLY the effective-CPM source (brand_cpm_rate, no creator rate)
--    and adding structured RAISE logging + an [ALERT] on the pool invariant.
--    Same (uuid, bigint) signature → callers (worker RPC) are unchanged.
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
    v_raw_amount      numeric;
    v_remaining_pool  numeric;
    v_remaining_cap   numeric;
    v_amount          numeric;
BEGIN
    -- Lock order (deadlock-safe, fixed everywhere): clip -> campaign -> participation.
    SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_clip.status <> 'tracking' THEN
        RETURN 0;
    END IF;

    -- Defensive: never pay a clip that isn't quality-approved.
    IF v_clip.quality_status IS DISTINCT FROM 'approved' THEN
        RETURN 0;
    END IF;

    -- Lock the campaign: the single serialization point for the shared pool.
    SELECT * INTO v_camp FROM public.campaigns WHERE id = v_clip.campaign_id FOR UPDATE;
    IF NOT FOUND OR v_camp.campaign_type <> 'performance' THEN
        RETURN 0;
    END IF;

    -- Brand-set CPM is the single source of truth (legacy cpm_rate only as a
    -- transition fallback). No effective rate => nothing can accrue.
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

    -- Billable views = monotonic delta above the watermark (idempotency key).
    v_billable := GREATEST(p_new_views - v_clip.counted_views, 0);
    IF v_billable = 0 THEN
        RETURN 0;
    END IF;

    v_raw_amount := ROUND((v_billable::numeric / 1000.0) * v_eff_cpm, 2);
    v_amount     := v_raw_amount;

    -- Per-creator cap (NULL = uncapped).
    IF v_camp.max_payout_per_creator IS NOT NULL THEN
        v_remaining_cap := v_camp.max_payout_per_creator - v_part.total_earned;
        v_amount := LEAST(v_amount, GREATEST(v_remaining_cap, 0));
    END IF;

    -- Remaining pool (creators earn from available_pool = post-fee 90%).
    v_remaining_pool := COALESCE(v_camp.available_pool, v_camp.budget_pool, 0)
                        - v_camp.budget_reserved
                        - v_camp.budget_paid;

    -- Invariant: with the campaign row locked, remaining pool can never be
    -- negative. If it is, the rollups are corrupt — alert loudly, pay nothing.
    IF v_remaining_pool < 0 THEN
        RAISE WARNING '[ALERT] earnings.pool_negative campaign=% title=% remaining=% reserved=% paid=% pool=%',
            v_camp.id, COALESCE(v_camp.title, '-'), v_remaining_pool,
            v_camp.budget_reserved, v_camp.budget_paid,
            COALESCE(v_camp.available_pool, v_camp.budget_pool, 0);
    END IF;

    v_amount := LEAST(v_amount, GREATEST(v_remaining_pool, 0));

    -- Observability: a clamp means we tried to accrue more than the pool/cap
    -- allowed. Expected near exhaustion, but worth a trace.
    IF v_amount < v_raw_amount THEN
        RAISE LOG 'earnings.clamped clip=% campaign=% raw=% paid=% remaining_pool=%',
            v_clip.id, v_camp.id, v_raw_amount, v_amount, v_remaining_pool;
    END IF;

    IF v_amount <= 0 THEN
        -- Cap/pool exhausted: advance the watermark so we don't recompute this
        -- delta every sync, but accrue nothing.
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

    -- All four writes happen in this one function = one transaction. Any error
    -- (incl. the EXCEPTION handler re-raise below) rolls back the whole set, so
    -- the ledger, the clip watermark, the pool, and the rollups never disagree.

    -- 1) Append the immutable earnings ledger row.
    INSERT INTO public.earnings (
        clip_id, participation_id, campaign_id, creator_id,
        billable_views, effective_cpm, amount, status
    ) VALUES (
        v_clip.id, v_clip.participation_id, v_camp.id, v_clip.creator_id,
        v_billable, v_eff_cpm, v_amount, 'accrued'
    );

    -- 2) Advance the clip watermark (idempotency).
    UPDATE public.clips
        SET counted_views = p_new_views,
            current_views = GREATEST(current_views, p_new_views),
            last_synced_at = now(),
            updated_at = now()
        WHERE id = p_clip_id;

    -- 3) Reserve against the pool.
    UPDATE public.campaigns
        SET budget_reserved = budget_reserved + v_amount
        WHERE id = v_camp.id;

    -- 4) Per-creator rollups.
    UPDATE public.participations
        SET total_views  = total_views + v_billable,
            total_earned = total_earned + v_amount
        WHERE id = v_part.id;

    RAISE LOG 'earnings.accrued clip=% campaign=% creator=% billable=% cpm=% amount=% remaining_after=%',
        v_clip.id, v_camp.id, v_clip.creator_id, v_billable, v_eff_cpm, v_amount,
        (v_remaining_pool - v_amount);

    -- Close the campaign when the pool is fully reserved/paid, and notify the brand.
    IF (v_remaining_pool - v_amount) <= 0.005 THEN
        UPDATE public.campaigns
            SET status = 'exhausted', updated_at = now()
            WHERE id = v_camp.id AND status IN ('open', 'in_progress');

        INSERT INTO public.notifications (user_id, title, content, type)
        VALUES (
            v_camp.business_id,
            'Campaign budget exhausted',
            'Your performance campaign "' || COALESCE(v_camp.title, 'Untitled')
                || '" has used its full creator budget and is now closed to new earnings.',
            'budget'
        );
    END IF;

    RETURN v_amount;

EXCEPTION
    WHEN OTHERS THEN
        -- Log loudly, then re-raise so the entire transaction rolls back (no
        -- partial ledger/pool writes). The worker surfaces this as a job failure
        -- and BullMQ retries with backoff.
        RAISE WARNING '[ALERT] earnings.exception clip=% sqlstate=% msg=%',
            p_clip_id, SQLSTATE, SQLERRM;
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
