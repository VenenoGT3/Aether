-- ============================================================================
-- Account deletion (GDPR Art. 17) — self-service, money-safe.
--
-- delete_own_account() deletes the caller's auth.users row; every public
-- table cascades from it (auth.users → public.users → profiles, campaigns,
-- participations, clips, earnings, payouts, transactions, ...).
--
-- It REFUSES to delete while money is in flight, so the atomic earnings /
-- escrow pipeline can never be left dangling:
--   creators  — unpaid earnings (accrued/approved) or a processing payout
--   brands    — live campaigns (open/in_progress) or funded, unreleased escrow
-- The caller resolves those first (withdraw, complete or cancel campaigns).
-- Returns { ok, reason? } like the other self-service RPCs.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me UUID := auth.uid();
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'delete_own_account: not authenticated';
    END IF;

    -- Creator money in flight: unpaid performance earnings.
    IF EXISTS (
        SELECT 1 FROM public.earnings
        WHERE creator_id = v_me AND status IN ('accrued', 'approved')
    ) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'earnings_in_flight');
    END IF;

    -- Creator money in flight: a payout the worker/reconciler still owns.
    IF EXISTS (
        SELECT 1 FROM public.payouts
        WHERE creator_id = v_me AND status IN ('pending', 'processing')
    ) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'payout_processing');
    END IF;

    -- Brand: live campaigns must be completed or cancelled first.
    IF EXISTS (
        SELECT 1 FROM public.campaigns
        WHERE business_id = v_me AND status IN ('open', 'in_progress')
    ) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'active_campaigns');
    END IF;

    -- Brand: fixed-fee escrow funded but never released (creator is still owed).
    IF EXISTS (
        SELECT 1
        FROM public.transactions t
        JOIN public.participations p ON p.id = t.participation_id
        JOIN public.campaigns c ON c.id = p.campaign_id
        WHERE c.business_id = v_me
          AND t.type = 'escrow' AND t.status = 'succeeded'
          AND NOT EXISTS (
              SELECT 1 FROM public.transactions r
              WHERE r.participation_id = t.participation_id
                AND r.type = 'release' AND r.status = 'succeeded'
          )
    ) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'escrow_unreleased');
    END IF;

    RAISE LOG 'account.deleted user=%', v_me;

    DELETE FROM auth.users WHERE id = v_me;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ----------------------------------------------------------------------------
-- Privilege lockdown
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

COMMENT ON FUNCTION public.delete_own_account() IS
    'Self-service account deletion (GDPR right to erasure). Cascades the auth.users row through every public table; refuses while money is in flight (unpaid earnings, processing payouts, live campaigns, unreleased escrow).';
