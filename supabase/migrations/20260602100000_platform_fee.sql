-- Aether Migration: 10% platform fee on performance pools.
--
-- The brand pays the full budget_pool. The platform retains platform_fee_pct
-- (default 0.10 for new campaigns); the remaining (1 - fee) is available_pool —
-- the amount creators can actually earn against.
--
-- Enforcement: record_clip_earning now caps accrual at the AVAILABLE pool
-- (COALESCE(available_pool, budget_pool)), so the fee is never reservable or
-- payable to creators. Backward compatible: existing campaigns have
-- available_pool = NULL and keep using the full budget_pool (no retroactive fee).

-- ---------------------------------------------------------------------------
-- 1. Columns (nullable → existing campaigns are unaffected)
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS platform_fee_pct NUMERIC(5,4),
    ADD COLUMN IF NOT EXISTS available_pool NUMERIC(12,2);

COMMENT ON COLUMN public.campaigns.platform_fee_pct IS
    'Platform fee fraction retained from budget_pool (e.g. 0.10). NULL = legacy, no fee.';
COMMENT ON COLUMN public.campaigns.available_pool IS
    'Creator-earnable pool after the platform fee (= budget_pool * (1 - platform_fee_pct)). NULL = legacy, use budget_pool.';

-- ---------------------------------------------------------------------------
-- 2. Platform revenue ledger (one row per funded campaign; idempotent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL UNIQUE REFERENCES public.campaigns(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,        -- platform revenue for this campaign
    fee_pct NUMERIC(5,4) NOT NULL,
    type TEXT NOT NULL DEFAULT 'platform_fee',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_transactions_business
    ON public.platform_transactions(business_id);

ALTER TABLE public.platform_transactions ENABLE ROW LEVEL SECURITY;

-- Brands may read the fee charged on their own campaigns (transparency). Writes
-- are service-role only (the funding webhook) — no INSERT/UPDATE policy.
DROP POLICY IF EXISTS "Read own platform fees" ON public.platform_transactions;
CREATE POLICY "Read own platform fees"
    ON public.platform_transactions FOR SELECT TO authenticated
    USING (business_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. record_clip_earning: cap at the AVAILABLE pool (post platform fee).
--    Identical to 20260602090001 except v_remaining_pool uses available_pool.
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
    SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_clip.status <> 'tracking' THEN
        RETURN 0;
    END IF;

    SELECT * INTO v_camp FROM public.campaigns WHERE id = v_clip.campaign_id FOR UPDATE;
    IF NOT FOUND
        OR v_camp.campaign_type <> 'performance'
        OR v_camp.cpm_rate IS NULL THEN
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

    v_eff_cpm := COALESCE(v_part.creator_cpm_rate, v_camp.cpm_rate);
    v_amount  := ROUND((v_billable::numeric / 1000.0) * v_eff_cpm, 2);

    IF v_camp.max_payout_per_creator IS NOT NULL THEN
        v_remaining_cap := v_camp.max_payout_per_creator - v_part.total_earned;
        v_amount := LEAST(v_amount, GREATEST(v_remaining_cap, 0));
    END IF;

    -- Remaining = AVAILABLE pool (post platform fee) - reserved - paid. The 10%
    -- platform fee is excluded here, so it can never be reserved or paid out.
    v_remaining_pool := COALESCE(v_camp.available_pool, v_camp.budget_pool, 0)
                        - v_camp.budget_reserved
                        - v_camp.budget_paid;
    v_amount := LEAST(v_amount, GREATEST(v_remaining_pool, 0));

    IF v_amount <= 0 THEN
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

    -- 100% of the AVAILABLE pool consumed → auto-close + notify (under the lock).
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

    UPDATE public.participations
        SET total_views  = total_views + v_billable,
            total_earned = total_earned + v_amount
        WHERE id = v_part.id;

    RETURN v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
