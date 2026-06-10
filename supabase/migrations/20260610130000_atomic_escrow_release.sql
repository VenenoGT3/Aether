-- Aether Migration: atomic escrow-release completion.
--
-- After a successful Stripe transfer, releaseEscrowAction performed three
-- separate writes (ledger insert, participation completion, campaign
-- completion) with no transaction and unchecked errors — a failure between
-- them left money state inconsistent. This function performs all three in a
-- single transaction. The partial unique index
-- uniq_transactions_release_succeeded still guarantees one ledger row per
-- participation; a 23505 here means a concurrent caller already completed the
-- release (the Stripe transfer itself is idempotent by key).

CREATE OR REPLACE FUNCTION public.complete_escrow_release(
    p_participation_id uuid,
    p_business_user_id uuid,
    p_amount numeric,
    p_transfer_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_campaign_id uuid;
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'complete_escrow_release: invalid amount %', p_amount;
    END IF;

    SELECT campaign_id INTO v_campaign_id
    FROM public.participations
    WHERE id = p_participation_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    INSERT INTO public.transactions (
        participation_id, user_id, amount, type, status, stripe_payment_intent_id
    ) VALUES (
        p_participation_id, p_business_user_id, p_amount, 'release', 'succeeded', p_transfer_id
    );

    UPDATE public.participations
    SET status = 'completed',
        actual_payout = p_amount
    WHERE id = p_participation_id;

    UPDATE public.campaigns
    SET status = 'completed'
    WHERE id = v_campaign_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_escrow_release(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_escrow_release(uuid, uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.complete_escrow_release(uuid, uuid, numeric, text) IS
    'Single-transaction completion of a fixed-fee escrow release: ledger row + participation completed + campaign completed. Service-role only; called after the idempotent Stripe transfer succeeds.';
