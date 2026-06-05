-- Aether Migration: idempotent pool funding settlement + redacted social-account access.

-- ---------------------------------------------------------------------------
-- 1. Shared pool-funding settlement for every Stripe webhook runtime.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settle_pool_funding_payment(
    p_payment_intent_id text,
    p_campaign_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_camp public.campaigns%ROWTYPE;
    v_fee_pct numeric;
    v_pool numeric;
    v_fee numeric;
BEGIN
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION 'payment_intent_id is required';
    END IF;

    IF p_campaign_id IS NOT NULL THEN
        SELECT * INTO v_camp
        FROM public.campaigns
        WHERE id = p_campaign_id
        FOR UPDATE;
    ELSE
        SELECT * INTO v_camp
        FROM public.campaigns
        WHERE funding_payment_intent_id = p_payment_intent_id
        FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RAISE WARNING 'pool_funding.settle_missing payment_intent=% campaign=%',
            p_payment_intent_id, p_campaign_id;
        RETURN NULL;
    END IF;

    IF v_camp.funding_payment_intent_id IS NOT NULL
       AND v_camp.funding_payment_intent_id <> p_payment_intent_id THEN
        RAISE EXCEPTION 'PaymentIntent % does not match campaign % funding record',
            p_payment_intent_id, v_camp.id;
    END IF;

    IF v_camp.status IN ('draft', 'open') THEN
        UPDATE public.campaigns
        SET status = 'open',
            funded_at = COALESCE(funded_at, now()),
            funding_payment_intent_id = COALESCE(funding_payment_intent_id, p_payment_intent_id)
        WHERE id = v_camp.id;
    ELSE
        RAISE WARNING 'pool_funding.settle_unexpected_status campaign=% status=% payment_intent=%',
            v_camp.id, v_camp.status, p_payment_intent_id;
    END IF;

    v_pool := COALESCE(v_camp.budget_pool, 0);
    v_fee_pct := COALESCE(v_camp.platform_fee_pct, 0);
    v_fee := round(v_pool * v_fee_pct, 2);

    IF v_fee > 0 THEN
        INSERT INTO public.platform_transactions (
            campaign_id,
            business_id,
            amount,
            fee_pct,
            type
        )
        VALUES (
            v_camp.id,
            v_camp.business_id,
            v_fee,
            v_fee_pct,
            'platform_fee'
        )
        ON CONFLICT (campaign_id) DO NOTHING;
    END IF;

    RAISE LOG 'pool_funding.settled campaign=% payment_intent=% fee=%',
        v_camp.id, p_payment_intent_id, v_fee;
    RETURN v_camp.id;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_pool_funding_payment(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_pool_funding_payment(text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Redacted creator social-account status for the authenticated owner.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.creator_social_account_status
WITH (security_barrier = true)
AS
SELECT
    id,
    user_id,
    platform,
    provider,
    external_account_id,
    handle,
    display_name,
    profile_url,
    scopes,
    status,
    last_verified_at,
    token_expires_at,
    refresh_expires_at,
    created_at,
    updated_at
FROM public.creator_social_accounts
WHERE user_id = auth.uid();

COMMENT ON VIEW public.creator_social_account_status IS
    'Redacted creator social account links for the authenticated owner. Token columns are intentionally omitted.';

REVOKE ALL ON public.creator_social_account_status FROM PUBLIC;
GRANT SELECT ON public.creator_social_account_status TO authenticated;

CREATE OR REPLACE FUNCTION public.disconnect_creator_social_account(
    p_account_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rows int;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.creator_social_accounts
    SET status = 'revoked',
        access_token = NULL,
        refresh_token = NULL,
        token_expires_at = NULL,
        refresh_expires_at = NULL,
        updated_at = now()
    WHERE id = p_account_id
      AND user_id = auth.uid();

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.disconnect_creator_social_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.disconnect_creator_social_account(uuid) TO authenticated;

-- OAuth state is service-role managed by supabase/functions/social-oauth.
CREATE TABLE IF NOT EXISTS public.creator_social_oauth_states (
    state TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('youtube', 'tiktok')),
    provider TEXT NOT NULL CHECK (provider IN ('youtube_official', 'tiktok_official')),
    redirect_origin TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_social_oauth_states_expires
    ON public.creator_social_oauth_states (expires_at);

ALTER TABLE public.creator_social_oauth_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.creator_social_oauth_states FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_social_oauth_states FROM anon;
REVOKE ALL ON TABLE public.creator_social_oauth_states FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.creator_social_oauth_states TO service_role;
