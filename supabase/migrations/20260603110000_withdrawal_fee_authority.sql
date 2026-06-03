-- Aether Migration: server-authoritative withdrawal fee + RPC privilege lockdown.
--
-- CRITICAL VULNERABILITY FIXED
--   request_withdrawal(p_min_threshold, p_fee_pct) is SECURITY DEFINER and had NO
--   REVOKE/GRANT, so it was EXECUTE-able by PUBLIC — any authenticated creator can
--   call it directly via PostgREST (supabase.rpc) and supply ANY p_fee_pct. The
--   body only rejected < 0 / >= 1, then computed fee = gross * p_fee_pct. So a
--   creator could call rpc('request_withdrawal', { p_fee_pct: 0, p_min_threshold: 0 })
--   to withdraw their FULL gross with NO platform fee and below the $10 minimum.
--   The platform fee was effectively opt-out. This migration makes the fee and
--   minimum SERVER-AUTHORITATIVE (client params are ignored except for tamper
--   detection) and locks down EXECUTE on every money-moving RPC.
--
-- CONCURRENCY MODEL (unchanged): READ COMMITTED + per-creator pg_advisory_xact_lock
-- + claim-by-locked-id-set (FOR UPDATE on the exact earnings, claim that id-set).
-- Idempotency: earnings.payout_id (claim) + payouts.status terminal guards
-- (settlement) + stable Stripe key withdrawal_<payoutId> (transfer).

-- ---------------------------------------------------------------------------
-- 1. Canonical platform fee + minimum (single source of truth; match TS:
--    WITHDRAWAL_FEE_PCT = 0.07, WITHDRAWAL_MIN = 10 in lib/withdrawal.ts).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_withdrawal_fee_pct()
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 0.07::numeric $$;

CREATE OR REPLACE FUNCTION public.platform_withdrawal_min()
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 10::numeric $$;

COMMENT ON FUNCTION public.platform_withdrawal_fee_pct() IS
    'Canonical platform withdrawal fee fraction (0.07). Server-authoritative — never client-supplied.';

-- ---------------------------------------------------------------------------
-- 2. request_withdrawal: server-authoritative fee/min + tamper [ALERT].
--    Same claim-by-locked-id-set as 20260603020000; client params retained for
--    signature compatibility but IGNORED for the security-critical values.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_withdrawal(
    p_min_threshold numeric DEFAULT 10,
    p_fee_pct numeric DEFAULT 0.07
)
RETURNS TABLE(out_payout_id uuid, out_gross numeric, out_net numeric, out_fee numeric) AS $$
DECLARE
    v_creator   uuid := auth.uid();
    v_ids       uuid[];
    v_gross     numeric;
    v_fee       numeric;
    v_net       numeric;
    v_payout_id uuid;
    v_fee_pct   numeric := public.platform_withdrawal_fee_pct();
    v_min       numeric := public.platform_withdrawal_min();
BEGIN
    IF v_creator IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- SECURITY: fee % and minimum are SERVER-AUTHORITATIVE. A caller supplying a
    -- different fee (e.g. 0 to dodge the platform cut) or a lower minimum is a
    -- tamper attempt — ignore the client value, enforce the canonical one, alert.
    IF p_fee_pct IS DISTINCT FROM v_fee_pct THEN
        RAISE WARNING '[ALERT] withdrawal.fee_tamper creator=% requested_pct=% enforced_pct=%',
            v_creator, p_fee_pct, v_fee_pct;
    END IF;
    IF p_min_threshold IS DISTINCT FROM v_min THEN
        RAISE WARNING '[ALERT] withdrawal.min_tamper creator=% requested_min=% enforced_min=%',
            v_creator, p_min_threshold, v_min;
    END IF;

    -- Serialize all of this creator's withdrawal/payout claims.
    PERFORM pg_advisory_xact_lock(hashtext(v_creator::text)::bigint);

    -- Lock the EXACT approved+unclaimed rows (deterministic order) so the summed
    -- set == the claimed set even if promote_due_earnings runs concurrently.
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

    IF v_gross < v_min THEN
        RETURN; -- below the server minimum (claim NOT taken; rows stay available)
    END IF;

    v_fee := ROUND(v_gross * v_fee_pct, 2);
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
-- 3. Payout <-> platform_revenue drift audit (fee accounting integrity).
--    Finds settled, fee-bearing payouts whose immutable revenue row is MISSING
--    or whose recorded fee diverges from the payout's fee. Service-role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_payout_revenue_drift(
    p_trace_id text DEFAULT NULL,
    p_limit int DEFAULT 1000
)
RETURNS TABLE(
    payout_id     uuid,
    payout_fee    numeric,
    recorded_fee  numeric,
    issue         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r       record;
    v_count int := 0;
BEGIN
    FOR r IN
        SELECT p.id AS pid,
               COALESCE(p.fee_amount, 0) AS p_fee,
               pr.fee_amount AS r_fee,
               pr.payout_id IS NULL AS missing
        FROM public.payouts p
        LEFT JOIN public.platform_revenue pr ON pr.payout_id = p.id
        WHERE p.status = 'paid'
          AND COALESCE(p.fee_amount, 0) > 0
          AND (pr.payout_id IS NULL OR abs(pr.fee_amount - p.fee_amount) > 0.01)
        ORDER BY p.created_at DESC
        LIMIT GREATEST(p_limit, 1)
    LOOP
        v_count := v_count + 1;
        payout_id    := r.pid;
        payout_fee   := r.p_fee;
        recorded_fee := r.r_fee;
        issue        := CASE WHEN r.missing THEN 'missing_revenue_row' ELSE 'fee_mismatch' END;

        RAISE WARNING '[ALERT] payout.revenue_drift payout=% issue=% payout_fee=% recorded_fee=% trace=%',
            r.pid, issue, r.p_fee, COALESCE(r.r_fee, 0), COALESCE(p_trace_id, '-');
        RETURN NEXT;
    END LOOP;

    IF v_count = 0 THEN
        RAISE LOG 'payout.revenue_drift.none trace=%', COALESCE(p_trace_id, '-');
    ELSE
        RAISE WARNING '[ALERT] payout.revenue_drift.summary drifted=% trace=%',
            v_count, COALESCE(p_trace_id, '-');
    END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Privilege lockdown — least privilege on every money-moving RPC.
--    * Creator-facing (auth.uid()-scoped): authenticated only (drop anon/public).
--    * Worker/internal: service_role only. SECURITY DEFINER wrappers still call
--      the internal functions with the function owner's rights, so revoking
--      direct EXECUTE from users does NOT break settle_withdrawal/fail_withdrawal.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, numeric) TO authenticated;

REVOKE ALL ON FUNCTION public.settle_withdrawal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_withdrawal(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.fail_withdrawal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_withdrawal(uuid) TO authenticated;

-- Internal money movers: never directly callable by end users.
REVOKE ALL ON FUNCTION public.mark_payout_paid(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_payout_paid(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.mark_payout_failed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_payout_failed(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.create_payout_for_creator(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_payout_for_creator(uuid, numeric) TO service_role;

REVOKE ALL ON FUNCTION public.promote_due_earnings(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_due_earnings(int) TO service_role;

REVOKE ALL ON FUNCTION public.audit_payout_revenue_drift(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_payout_revenue_drift(text, int) TO service_role;
