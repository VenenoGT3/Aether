-- Aether Migration: creator-initiated withdrawals (manual payouts + 7% fee).
--
-- Creators withdraw their AVAILABLE balance (approved earnings that cleared
-- holdback) on demand. The platform retains a 7% fee; the creator receives the
-- net via Stripe (the existing transfer logic).
--
-- Safety: withdrawals reuse the atomic claim model (earnings.payout_id). The
-- functions are SECURITY DEFINER but scoped to auth.uid(), so a creator can only
-- ever withdraw / settle their OWN earnings, and a per-creator advisory lock plus
-- the payout_id claim make double-withdrawal impossible (a second request finds
-- nothing unclaimed). Partial state is fine: each request claims whatever is
-- approved-and-unclaimed at that moment.

-- ---------------------------------------------------------------------------
-- 1. Record gross + fee on the payout (payout.amount stays = net transferred).
-- ---------------------------------------------------------------------------
ALTER TABLE public.payouts
    ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12,2);

COMMENT ON COLUMN public.payouts.gross_amount IS 'Earnings claimed (pre-fee). amount = net transferred to the creator.';
COMMENT ON COLUMN public.payouts.fee_amount IS 'Withdrawal fee retained by the platform (gross - net).';

-- ---------------------------------------------------------------------------
-- 2. request_withdrawal(): claim the CALLING creator's approved+unclaimed
--    earnings into a payout (net = gross - fee). auth.uid()-scoped + advisory
--    locked → safe to expose via RPC and impossible to double-claim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_withdrawal(
    p_min_threshold numeric DEFAULT 10,
    p_fee_pct numeric DEFAULT 0.07
)
RETURNS TABLE(out_payout_id uuid, out_gross numeric, out_net numeric, out_fee numeric) AS $$
DECLARE
    v_creator uuid := auth.uid();
    v_gross   numeric;
    v_fee     numeric;
    v_net     numeric;
    v_payout_id uuid;
BEGIN
    IF v_creator IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Serialize concurrent withdrawal attempts for this creator.
    PERFORM pg_advisory_xact_lock(hashtext(v_creator::text)::bigint);

    SELECT COALESCE(SUM(e.amount), 0) INTO v_gross
        FROM public.earnings e
        WHERE e.creator_id = v_creator
          AND e.status = 'approved'
          AND e.payout_id IS NULL;

    IF v_gross < p_min_threshold THEN
        RETURN; -- below the minimum / nothing available
    END IF;

    v_fee := ROUND(v_gross * p_fee_pct, 2);
    v_net := ROUND(v_gross - v_fee, 2);

    INSERT INTO public.payouts (creator_id, amount, gross_amount, fee_amount, status, idempotency_key)
    VALUES (v_creator, v_net, v_gross, v_fee, 'processing', gen_random_uuid()::text)
    RETURNING id INTO v_payout_id;

    -- Claim the earnings against this payout (the double-withdraw guard).
    UPDATE public.earnings
        SET payout_id = v_payout_id
        WHERE creator_id = v_creator
          AND status = 'approved'
          AND payout_id IS NULL;

    out_payout_id := v_payout_id;
    out_gross := v_gross;
    out_net := v_net;
    out_fee := v_fee;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 3. settle_withdrawal(): mark a successful transfer paid (auth-scoped wrapper
--    around mark_payout_paid — verifies the payout belongs to the caller).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_withdrawal(p_payout_id uuid, p_transfer_id text)
RETURNS void AS $$
DECLARE
    v_creator uuid := auth.uid();
    v_owner   uuid;
BEGIN
    SELECT creator_id INTO v_owner FROM public.payouts WHERE id = p_payout_id;
    IF v_owner IS NULL OR v_owner <> v_creator THEN
        RAISE EXCEPTION 'Not your payout';
    END IF;
    PERFORM public.mark_payout_paid(p_payout_id, p_transfer_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 4. fail_withdrawal(): release a failed withdrawal's claim so the balance
--    returns to 'available' (auth-scoped wrapper around mark_payout_failed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fail_withdrawal(p_payout_id uuid)
RETURNS void AS $$
DECLARE
    v_creator uuid := auth.uid();
    v_owner   uuid;
BEGIN
    SELECT creator_id INTO v_owner FROM public.payouts WHERE id = p_payout_id;
    IF v_owner IS NULL OR v_owner <> v_creator THEN
        RAISE EXCEPTION 'Not your payout';
    END IF;
    PERFORM public.mark_payout_failed(p_payout_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
