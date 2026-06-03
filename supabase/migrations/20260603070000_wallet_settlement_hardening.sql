-- Aether Migration: Wallet settlement hardening (terminal-state guards + 7% fee).
--
-- Builds on 20260602030000 (payout engine), 20260602110000 (creator withdrawals),
-- and 20260603020000 (claim-by-locked-id-set + platform_revenue). This migration
-- closes two settlement-side integrity holes that the prior claim hardening did
-- not cover, and adds reporting/observability.
--
-- WHAT THIS HARDENS
--   1. mark_payout_paid could settle a payout in ANY non-'paid' state — including
--      'failed' (whose earnings were already released by mark_payout_failed). That
--      would write a phantom payout transaction + platform_revenue row with NO
--      backing earnings. Fix: only 'processing'/'pending' may settle; 'paid' is
--      idempotent; 'failed'/unknown raises with an [ALERT]. Also alert when a
--      settle finds zero claimed earnings (rollup/transfer divergence).
--   2. mark_payout_failed took NO row lock and had NO status guard, so it could
--      race mark_payout_paid and overwrite a 'paid' payout with 'failed' (and the
--      money had already moved). Fix: SELECT ... FOR UPDATE + status guard
--      (never touch 'paid'; idempotent on 'failed'). The FOR UPDATE on the payout
--      row is the single serialization point for settle-vs-fail on one payout.
--
-- CONCURRENCY MODEL (restated)
--   READ COMMITTED. The payout row FOR UPDATE serializes all settlement of a
--   single payout (settle vs. fail vs. reconcile retry). The per-creator advisory
--   lock (request_withdrawal / create_payout_for_creator) serializes CLAIMS.
--   Idempotency: earnings.payout_id (claim) + payouts.status terminal guards
--   (settlement) + the stable Stripe key withdrawal_<payoutId> (transfer).

-- ---------------------------------------------------------------------------
-- 1. Reporting / hot-path indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_platform_revenue_creator
    ON public.platform_revenue(creator_id, created_at DESC);

-- Settlement aggregates earnings by payout_id; ensure that lookup is indexed
-- specifically for claimed rows (idx_earnings_payout_id exists from phase 1, but
-- this partial index keeps the settlement scan tight on high-volume tables).
CREATE INDEX IF NOT EXISTS idx_earnings_payout_settlement
    ON public.earnings(payout_id, status)
    WHERE payout_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. mark_payout_paid: terminal-state guard + zero-earnings anomaly alert.
--    Re-creates 20260603020000 with a status guard before any mutation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_payout_paid(
    p_payout_id uuid,
    p_transfer_id text
)
RETURNS void AS $$
DECLARE
    v_payout      public.payouts%ROWTYPE;
    v_claimed     numeric;
    v_claim_count int;
BEGIN
    SELECT * INTO v_payout FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'payout % not found', p_payout_id;
    END IF;

    -- Idempotent: a re-issued transfer (same Stripe key) settles only once.
    IF v_payout.status = 'paid' THEN
        RETURN;
    END IF;

    -- Terminal-state guard: a 'failed' payout already released its earnings;
    -- settling it would create a phantom payment with no backing ledger rows.
    IF v_payout.status NOT IN ('processing', 'pending') THEN
        RAISE WARNING '[ALERT] payout.settle_on_terminal payout=% status=% transfer=%',
            p_payout_id, v_payout.status, p_transfer_id;
        RAISE EXCEPTION 'cannot settle payout % in % state', p_payout_id, v_payout.status
            USING ERRCODE = 'check_violation';
    END IF;

    -- Defense in depth: a settling payout must have claimed earnings. Zero means
    -- the claim was released out from under it (should be impossible) — alert but
    -- still settle the payout row so the (already-transferred) money isn't re-sent.
    SELECT COALESCE(SUM(amount), 0), COUNT(*)
        INTO v_claimed, v_claim_count
        FROM public.earnings
        WHERE payout_id = p_payout_id AND status = 'approved';

    IF v_claim_count = 0 THEN
        RAISE WARNING '[ALERT] payout.settle_no_earnings payout=% creator=% amount=% transfer=%',
            p_payout_id, v_payout.creator_id, v_payout.amount, p_transfer_id;
    ELSIF v_payout.gross_amount IS NOT NULL
        AND abs(v_claimed - v_payout.gross_amount) > 0.01 THEN
        RAISE WARNING '[ALERT] payout.settle_gross_mismatch payout=% claimed=% gross=%',
            p_payout_id, v_claimed, v_payout.gross_amount;
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

    RAISE LOG 'payout.settled payout=% creator=% net=% fee=% transfer=%',
        p_payout_id, v_payout.creator_id, v_payout.amount,
        COALESCE(v_payout.fee_amount, 0), p_transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 3. mark_payout_failed: lock + status guard (never overwrite a 'paid' payout).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_payout_failed(p_payout_id uuid)
RETURNS void AS $$
DECLARE
    v_payout public.payouts%ROWTYPE;
    v_released int;
BEGIN
    SELECT * INTO v_payout FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'payout % not found', p_payout_id;
    END IF;

    -- Never fail a settled payout: the money already moved. Loud alert — this
    -- means a release raced a settlement (e.g. a stale reconcile decision).
    IF v_payout.status = 'paid' THEN
        RAISE WARNING '[ALERT] payout.fail_on_paid payout=% creator=%',
            p_payout_id, v_payout.creator_id;
        RETURN;
    END IF;

    -- Idempotent: already failed → nothing to release.
    IF v_payout.status = 'failed' THEN
        RETURN;
    END IF;

    -- Release the claim so the next batch/withdrawal can retry these earnings.
    UPDATE public.earnings SET payout_id = NULL
        WHERE payout_id = p_payout_id AND status = 'approved';
    GET DIAGNOSTICS v_released = ROW_COUNT;

    UPDATE public.payouts SET status = 'failed' WHERE id = p_payout_id;

    RAISE LOG 'payout.failed_released payout=% creator=% released_rows=%',
        p_payout_id, v_payout.creator_id, v_released;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 4. platform_revenue_summary(): internal reporting helper (service-role only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_revenue_summary(
    p_from timestamptz DEFAULT NULL,
    p_to   timestamptz DEFAULT NULL
)
RETURNS TABLE(total_fee numeric, total_gross numeric, payout_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(fee_amount), 0),
           COALESCE(SUM(gross_amount), 0),
           COUNT(*)::bigint
    FROM public.platform_revenue
    WHERE (p_from IS NULL OR created_at >= p_from)
      AND (p_to   IS NULL OR created_at <  p_to);
$$;

REVOKE ALL ON FUNCTION public.platform_revenue_summary(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_revenue_summary(timestamptz, timestamptz) TO service_role;
