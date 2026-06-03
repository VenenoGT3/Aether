-- Aether Migration: Wallet & Withdrawal hardening (atomic claims + immutable 7% fee).
--
-- Builds on 20260602030000_payout_engine + 20260602110000_creator_withdrawals.
-- All money mutations stay in atomic SECURITY DEFINER functions. Additive and
-- backward compatible (new CHECKs are NOT VALID so legacy rows are never rejected).
--
-- WHAT THIS HARDENS
--   1. Claim-by-locked-id-set: request_withdrawal and create_payout_for_creator
--      previously SUMmed approved+unclaimed earnings, then UPDATEd them in a
--      separate statement. promote_due_earnings (no per-creator lock) could
--      promote a row to 'approved' BETWEEN those statements; the UPDATE would
--      then claim it without it being in the summed gross -> creator marked paid
--      for money never transferred. Fix: lock the exact rows (FOR UPDATE), sum
--      THOSE rows, then claim exactly that id-set.
--   2. Immutable platform-revenue ledger: the 7% fee is now appended to an
--      append-only platform_revenue table (one row per payout) inside
--      mark_payout_paid, with a fee-consistency CHECK + [ALERT] on mismatch.
--
-- CONCURRENCY MODEL (restated)
--   READ COMMITTED + per-creator pg_advisory_xact_lock (request_withdrawal and
--   create_payout_for_creator share the same lock key, so manual withdrawal and
--   the auto-batch can never both claim the same earnings) + SELECT ... FOR
--   UPDATE on the claimed earnings. Idempotency: earnings.payout_id (DB) and a
--   stable Stripe idempotency key withdrawal_<payoutId> (app/worker).

-- ---------------------------------------------------------------------------
-- 1. Immutable platform-revenue ledger (append-only; one row per payout).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_revenue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payout_id UUID NOT NULL UNIQUE REFERENCES public.payouts(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    gross_amount NUMERIC(12,2) NOT NULL CHECK (gross_amount >= 0),
    fee_amount NUMERIC(12,2) NOT NULL CHECK (fee_amount >= 0),
    fee_pct NUMERIC(6,4) NOT NULL DEFAULT 0 CHECK (fee_pct >= 0 AND fee_pct < 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_revenue IS
    'Append-only ledger of withdrawal fees retained by the platform. Exactly one row per settled withdrawal payout (UNIQUE payout_id). Internal — service-role only.';

-- RLS on with NO policies: only SECURITY DEFINER functions / the service role
-- can read or write. Creators/brands must never see the revenue ledger.
ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_platform_revenue_created ON public.platform_revenue(created_at);

-- ---------------------------------------------------------------------------
-- 2. Payout integrity constraints (NOT VALID: enforced on new/updated rows;
--    legacy rows are never rejected).
-- ---------------------------------------------------------------------------
ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS chk_payout_fee_consistency;
ALTER TABLE public.payouts ADD CONSTRAINT chk_payout_fee_consistency
    CHECK (gross_amount IS NULL OR amount + COALESCE(fee_amount, 0) = gross_amount)
    NOT VALID;

ALTER TABLE public.payouts DROP CONSTRAINT IF EXISTS chk_payout_amounts_nonneg;
ALTER TABLE public.payouts ADD CONSTRAINT chk_payout_amounts_nonneg
    CHECK (amount >= 0 AND COALESCE(gross_amount, 0) >= 0 AND COALESCE(fee_amount, 0) >= 0)
    NOT VALID;

-- Reconciler hot path: stuck 'processing' payouts.
CREATE INDEX IF NOT EXISTS idx_payouts_processing
    ON public.payouts(created_at) WHERE status = 'processing';

-- ---------------------------------------------------------------------------
-- 3. request_withdrawal: claim-by-locked-id-set (race-free) + 7% fee.
--    Same signature/return as 20260602110000 — callers unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_withdrawal(
    p_min_threshold numeric DEFAULT 10,
    p_fee_pct numeric DEFAULT 0.07
)
RETURNS TABLE(out_payout_id uuid, out_gross numeric, out_net numeric, out_fee numeric) AS $$
DECLARE
    v_creator uuid := auth.uid();
    v_ids     uuid[];
    v_gross   numeric;
    v_fee     numeric;
    v_net     numeric;
    v_payout_id uuid;
BEGIN
    IF v_creator IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF p_fee_pct < 0 OR p_fee_pct >= 1 THEN
        RAISE EXCEPTION 'invalid fee pct %', p_fee_pct;
    END IF;

    -- Serialize all of this creator's withdrawal/payout claims.
    PERFORM pg_advisory_xact_lock(hashtext(v_creator::text)::bigint);

    -- Lock the EXACT approved+unclaimed rows we will claim (deterministic order),
    -- so the summed set == the claimed set even if promote_due_earnings runs.
    SELECT array_agg(id) INTO v_ids FROM (
        SELECT id FROM public.earnings
        WHERE creator_id = v_creator AND status = 'approved' AND payout_id IS NULL
        ORDER BY id
        FOR UPDATE
    ) locked;

    IF v_ids IS NULL THEN
        RETURN; -- nothing available
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_gross
        FROM public.earnings WHERE id = ANY(v_ids);

    IF v_gross < p_min_threshold THEN
        RETURN; -- below the minimum (claim NOT taken; rows stay available)
    END IF;

    v_fee := ROUND(v_gross * p_fee_pct, 2);
    v_net := ROUND(v_gross - v_fee, 2);

    INSERT INTO public.payouts (creator_id, amount, gross_amount, fee_amount, status, idempotency_key)
    VALUES (v_creator, v_net, v_gross, v_fee, 'processing', gen_random_uuid()::text)
    RETURNING id INTO v_payout_id;

    -- Claim EXACTLY the rows we summed (the double-withdraw guard).
    UPDATE public.earnings SET payout_id = v_payout_id WHERE id = ANY(v_ids);

    RAISE LOG 'withdrawal.claimed creator=% payout=% gross=% fee=% net=% rows=%',
        v_creator, v_payout_id, v_gross, v_fee, v_net, array_length(v_ids, 1);

    out_payout_id := v_payout_id;
    out_gross := v_gross;
    out_net := v_net;
    out_fee := v_fee;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 4. create_payout_for_creator: same claim-by-locked-id-set hardening (worker
--    auto-batch path). Same signature/return as 20260602030000.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_payout_for_creator(
    p_creator_id uuid,
    p_min_threshold numeric
)
RETURNS TABLE(out_payout_id uuid, out_amount numeric) AS $$
DECLARE
    v_ids   uuid[];
    v_total numeric;
    v_payout_id uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_creator_id::text)::bigint);

    SELECT array_agg(id) INTO v_ids FROM (
        SELECT id FROM public.earnings
        WHERE creator_id = p_creator_id AND status = 'approved' AND payout_id IS NULL
        ORDER BY id
        FOR UPDATE
    ) locked;

    IF v_ids IS NULL THEN
        RETURN;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_total
        FROM public.earnings WHERE id = ANY(v_ids);

    IF v_total <= 0 OR v_total < p_min_threshold THEN
        RETURN;
    END IF;

    INSERT INTO public.payouts (creator_id, amount, status, idempotency_key)
    VALUES (p_creator_id, v_total, 'processing', gen_random_uuid()::text)
    RETURNING id INTO v_payout_id;

    UPDATE public.earnings SET payout_id = v_payout_id WHERE id = ANY(v_ids);

    out_payout_id := v_payout_id;
    out_amount := v_total;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 5. mark_payout_paid: settle + record the platform fee immutably.
--    Re-creates 20260602030000 verbatim and appends the platform_revenue write
--    + a fee-consistency [ALERT]. Idempotent (returns early when already 'paid';
--    the platform_revenue insert is ON CONFLICT DO NOTHING as belt-and-suspenders).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_payout_paid(
    p_payout_id uuid,
    p_transfer_id text
)
RETURNS void AS $$
DECLARE
    v_payout public.payouts%ROWTYPE;
BEGIN
    SELECT * INTO v_payout FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'payout % not found', p_payout_id;
    END IF;
    IF v_payout.status = 'paid' THEN
        RETURN; -- already settled (idempotent)
    END IF;

    -- Move reserved -> paid per campaign.
    UPDATE public.campaigns c
        SET budget_reserved = GREATEST(c.budget_reserved - agg.total, 0),
            budget_paid = c.budget_paid + agg.total
        FROM (
            SELECT campaign_id, SUM(amount) AS total
            FROM public.earnings
            WHERE payout_id = p_payout_id AND status = 'approved'
            GROUP BY campaign_id
        ) agg
        WHERE c.id = agg.campaign_id;

    -- Bump per-participation paid totals.
    UPDATE public.participations p
        SET total_paid = p.total_paid + agg.total
        FROM (
            SELECT participation_id, SUM(amount) AS total
            FROM public.earnings
            WHERE payout_id = p_payout_id AND status = 'approved'
            GROUP BY participation_id
        ) agg
        WHERE p.id = agg.participation_id;

    UPDATE public.earnings SET status = 'paid'
        WHERE payout_id = p_payout_id AND status = 'approved';

    UPDATE public.payouts
        SET status = 'paid', stripe_transfer_id = p_transfer_id
        WHERE id = p_payout_id;

    -- Audit ledger entry for the transfer (net to the creator).
    INSERT INTO public.transactions (
        user_id, amount, type, status, stripe_payment_intent_id, payout_id
    ) VALUES (
        v_payout.creator_id, v_payout.amount, 'payout', 'succeeded',
        p_transfer_id, p_payout_id
    );

    -- Immutable platform revenue: record the retained fee exactly once.
    IF COALESCE(v_payout.fee_amount, 0) > 0 THEN
        IF v_payout.gross_amount IS NOT NULL
           AND v_payout.gross_amount <> (v_payout.amount + v_payout.fee_amount) THEN
            RAISE WARNING '[ALERT] payout.fee_mismatch payout=% gross=% net=% fee=%',
                p_payout_id, v_payout.gross_amount, v_payout.amount, v_payout.fee_amount;
        END IF;

        INSERT INTO public.platform_revenue (payout_id, creator_id, gross_amount, fee_amount, fee_pct)
        VALUES (
            p_payout_id,
            v_payout.creator_id,
            COALESCE(v_payout.gross_amount, v_payout.amount + v_payout.fee_amount),
            v_payout.fee_amount,
            CASE WHEN COALESCE(v_payout.gross_amount, 0) > 0
                 THEN ROUND(v_payout.fee_amount / v_payout.gross_amount, 4) ELSE 0 END
        )
        ON CONFLICT (payout_id) DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
