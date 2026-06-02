-- Aether Migration: Performance-Based Clipping — Phase 1
-- Additive schema + core earnings logic.
--
-- This migration introduces the foundation for a performance-based UGC / clipping
-- model (open joining, pay-per-view via CPM, pooled budgets, automated accrual)
-- WITHOUT breaking the existing fixed-fee escrow model. Every change here is
-- additive: new nullable/defaulted columns, new tables, new functions, new policies.
-- The legacy "fixed" campaign flow continues to work unchanged.

-- ===========================================================================
-- 1. MODIFY EXISTING TABLES (additive only)
-- ===========================================================================

-- 1A. campaigns: pooled budget + CPM rate + caps for performance campaigns.
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT 'fixed'
        CHECK (campaign_type IN ('fixed', 'performance')),
    ADD COLUMN IF NOT EXISTS cpm_rate NUMERIC(10,2),                 -- $ per 1,000 paid views
    ADD COLUMN IF NOT EXISTS budget_pool NUMERIC(12,2),              -- total funded performance pool
    ADD COLUMN IF NOT EXISTS budget_reserved NUMERIC(12,2) NOT NULL DEFAULT 0,  -- accrued, not yet paid
    ADD COLUMN IF NOT EXISTS budget_paid NUMERIC(12,2) NOT NULL DEFAULT 0,      -- transferred to creators
    ADD COLUMN IF NOT EXISTS max_payout_per_creator NUMERIC(12,2),   -- NULL = uncapped
    ADD COLUMN IF NOT EXISTS min_payout_threshold NUMERIC(12,2) NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS view_holdback_hours INT NOT NULL DEFAULT 48;       -- anti-fraud settle delay

COMMENT ON COLUMN public.campaigns.campaign_type IS 'fixed = legacy negotiated escrow; performance = pay-per-view clipping pool.';
COMMENT ON COLUMN public.campaigns.budget_reserved IS 'Earnings accrued against the pool but not yet paid out.';
COMMENT ON COLUMN public.campaigns.budget_paid IS 'Earnings already transferred to creators.';

-- 1B. participations: open-join semantics + per-creator performance rollups.
-- proposed_payout is irrelevant for CPM campaigns, so relax it (legacy rows keep their values).
ALTER TABLE public.participations
    ALTER COLUMN proposed_payout DROP NOT NULL,
    ALTER COLUMN proposed_payout SET DEFAULT 0;

ALTER TABLE public.participations
    ADD COLUMN IF NOT EXISTS total_views BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ===========================================================================
-- 2. NEW TABLES
-- ===========================================================================

-- 2A. clips — individual content submissions (many per creator per campaign).
CREATE TABLE IF NOT EXISTS public.clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    participation_id UUID NOT NULL REFERENCES public.participations(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,                 -- 'tiktok' | 'instagram' | 'youtube' | ...
    post_url TEXT NOT NULL,
    external_post_id TEXT,                  -- provider/platform id used for polling
    ayrshare_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'tracking', 'disqualified')),
    counted_views BIGINT NOT NULL DEFAULT 0,   -- watermark: views already accrued against
    current_views BIGINT NOT NULL DEFAULT 0,   -- latest synced view count
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Anti-fraud: the same post URL can only be submitted once per campaign.
    CONSTRAINT unique_campaign_post_url UNIQUE (campaign_id, post_url)
);

COMMENT ON COLUMN public.clips.counted_views IS 'High-water mark of views already converted to earnings. Billable delta = current_views - counted_views.';

-- 2B. view_snapshots — append-only time series for delta computation + fraud detection.
CREATE TABLE IF NOT EXISTS public.view_snapshots (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    views BIGINT NOT NULL DEFAULT 0,
    likes BIGINT NOT NULL DEFAULT 0,
    comments BIGINT NOT NULL DEFAULT 0,
    shares BIGINT NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'ayrshare',
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2C. payouts — batched transfers to a creator (one Stripe transfer per row).
CREATE TABLE IF NOT EXISTS public.payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
    stripe_transfer_id TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,   -- guards against double-pay on worker retries
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2D. earnings — immutable record of each views -> money accrual event.
CREATE TABLE IF NOT EXISTS public.earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    participation_id UUID NOT NULL REFERENCES public.participations(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    billable_views BIGINT NOT NULL,         -- the view delta this accrual paid for
    effective_cpm NUMERIC(10,2) NOT NULL,   -- CPM snapshotted at accrual time
    amount NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'accrued'
        CHECK (status IN ('accrued', 'approved', 'paid', 'reversed')),
    payout_id UUID REFERENCES public.payouts(id) ON DELETE SET NULL,
    accrued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2E. Indexes
CREATE INDEX IF NOT EXISTS idx_clips_campaign_id ON public.clips(campaign_id);
CREATE INDEX IF NOT EXISTS idx_clips_participation_id ON public.clips(participation_id);
CREATE INDEX IF NOT EXISTS idx_clips_creator_id ON public.clips(creator_id);
CREATE INDEX IF NOT EXISTS idx_clips_status ON public.clips(status);
CREATE INDEX IF NOT EXISTS idx_view_snapshots_clip_time ON public.view_snapshots(clip_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_creator_status ON public.earnings(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_earnings_campaign_id ON public.earnings(campaign_id);
CREATE INDEX IF NOT EXISTS idx_earnings_clip_id ON public.earnings(clip_id);
CREATE INDEX IF NOT EXISTS idx_earnings_payout_id ON public.earnings(payout_id);
CREATE INDEX IF NOT EXISTS idx_payouts_creator_status ON public.payouts(creator_id, status);

-- 2F. updated_at triggers (reuse existing helper from the init migration)
CREATE OR REPLACE TRIGGER set_clips_updated_at
    BEFORE UPDATE ON public.clips
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER set_payouts_updated_at
    BEFORE UPDATE ON public.payouts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================================================
-- 3. HELPER FUNCTIONS (SECURITY DEFINER) — mirror existing repo patterns
-- ===========================================================================

-- Is the current user an onboarded influencer? (used by open-join + clip RLS)
CREATE OR REPLACE FUNCTION public.is_active_creator()
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users u
        JOIN public.profiles p ON p.user_id = u.id
        WHERE u.id = auth.uid()
          AND u.role = 'influencer'
          AND COALESCE(p.onboarded, false) = true
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Does the current user own the given campaign?
CREATE OR REPLACE FUNCTION public.owns_campaign(c_id uuid)
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.campaigns c
        WHERE c.id = c_id AND c.business_id = auth.uid()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- ===========================================================================
-- 4. CORE EARNINGS FUNCTION
-- ===========================================================================
-- record_clip_earning: atomically convert a clip's latest view count into an
-- earnings accrual, respecting per-creator caps and the shared campaign pool.
--
-- Concurrency safety: locks the clip, then the campaign, then the participation
-- with FOR UPDATE. Locking the campaign row serializes every clip drawing from
-- the same pool, so concurrent workers can never over-reserve the budget.
--
-- Returns the amount accrued (0 when nothing was billable / pool or cap exhausted).
-- Designed to be called by a service-role worker (RLS is bypassed there).
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

    -- Lock the participation (per-creator caps + rollups).
    SELECT * INTO v_part FROM public.participations WHERE id = v_clip.participation_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- Billable views = monotonic delta above the watermark, never negative.
    v_billable := GREATEST(p_new_views - v_clip.counted_views, 0);
    IF v_billable = 0 THEN
        RETURN 0;
    END IF;

    v_eff_cpm := v_camp.cpm_rate;
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

    -- 1) Append immutable earnings ledger row.
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

-- ===========================================================================
-- 5. ROW LEVEL SECURITY (new tables)
-- ===========================================================================
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.view_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- ----- clips -----
-- Read: the creator who submitted it, or the brand that owns the campaign.
DROP POLICY IF EXISTS "Read clips" ON public.clips;
CREATE POLICY "Read clips"
    ON public.clips FOR SELECT TO authenticated
    USING (
        creator_id = auth.uid()
        OR public.owns_campaign(campaign_id)
    );

-- Insert: an onboarded creator may submit a clip only for a campaign they have
-- joined. (Phase 2 tightens this to require status = 'active' once that
-- participation_status enum value exists — see 20260602010000.)
DROP POLICY IF EXISTS "Creator submits clip" ON public.clips;
CREATE POLICY "Creator submits clip"
    ON public.clips FOR INSERT TO authenticated
    WITH CHECK (
        creator_id = auth.uid()
        AND public.is_active_creator()
        AND EXISTS (
            SELECT 1 FROM public.participations p
            WHERE p.id = participation_id
              AND p.influencer_id = auth.uid()
              AND p.campaign_id = clips.campaign_id
        )
    );

-- Update: only the brand owner (clip moderation: approve / reject / disqualify).
-- System view/earning field updates run through the service role (RLS bypassed).
DROP POLICY IF EXISTS "Brand moderates clip" ON public.clips;
CREATE POLICY "Brand moderates clip"
    ON public.clips FOR UPDATE TO authenticated
    USING (public.owns_campaign(campaign_id));

-- ----- view_snapshots -----
-- Read only: clip owner or brand. Writes are service-role only (no write policy).
DROP POLICY IF EXISTS "Read view snapshots" ON public.view_snapshots;
CREATE POLICY "Read view snapshots"
    ON public.view_snapshots FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.clips c
            WHERE c.id = clip_id
              AND (c.creator_id = auth.uid() OR public.owns_campaign(c.campaign_id))
        )
    );

-- ----- earnings -----
-- Read only: the creator who earned, or the brand that owns the campaign.
-- Writes happen exclusively via record_clip_earning / the payout worker (service role).
DROP POLICY IF EXISTS "Read earnings" ON public.earnings;
CREATE POLICY "Read earnings"
    ON public.earnings FOR SELECT TO authenticated
    USING (
        creator_id = auth.uid()
        OR public.owns_campaign(campaign_id)
    );

-- ----- payouts -----
-- Read only: the creator being paid. Writes are service-role only.
DROP POLICY IF EXISTS "Read payouts" ON public.payouts;
CREATE POLICY "Read payouts"
    ON public.payouts FOR SELECT TO authenticated
    USING (creator_id = auth.uid());
