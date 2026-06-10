-- Aether beta launch hardening.
--
-- Fixes the remote DB lint blocker in public.mark_payout_paid() and closes the
-- highest-signal Supabase security advisor findings that can be resolved from
-- migrations without changing product semantics.

-- ---------------------------------------------------------------------------
-- 1. Payout ledger compatibility.
-- ---------------------------------------------------------------------------
-- mark_payout_paid() has intentionally written a performance payout transaction
-- with a payout_id since the withdrawal hardening migrations. The transactions
-- table predates the performance payout engine, so fresh/remote projects can be
-- missing the column and payout settlement then fails at compile/runtime.

ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS payout_id uuid
        REFERENCES public.payouts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.transactions.payout_id IS
    'Set for performance-payout transfer ledger rows. Used to distinguish creator withdrawals from legacy fixed-fee escrow transactions.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_payout_id_unique
    ON public.transactions(payout_id)
    WHERE payout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
    ON public.transactions(user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Social-account redacted view: use invoker security, not definer security.
-- ---------------------------------------------------------------------------
-- Supabase flags default SECURITY DEFINER views because they bypass the
-- querying user's RLS. The underlying table stores OAuth tokens, so expose only
-- non-token columns to authenticated users and keep RLS scoped to the owner.

REVOKE ALL ON TABLE public.creator_social_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_social_accounts FROM anon;
REVOKE ALL ON TABLE public.creator_social_accounts FROM authenticated;

GRANT SELECT (
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
) ON public.creator_social_accounts TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.creator_social_accounts TO service_role;

DROP POLICY IF EXISTS "Creator reads own linked social account status"
    ON public.creator_social_accounts;

CREATE POLICY "Creator reads own linked social account status"
    ON public.creator_social_accounts
    FOR SELECT
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE VIEW public.creator_social_account_status
WITH (security_invoker = true, security_barrier = true)
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
WHERE user_id = (SELECT auth.uid());

COMMENT ON VIEW public.creator_social_account_status IS
    'Invoker-security redacted creator social account links for the authenticated owner. OAuth token columns remain ungranted and omitted.';

REVOKE ALL ON public.creator_social_account_status FROM PUBLIC;
REVOKE ALL ON public.creator_social_account_status FROM anon;
GRANT SELECT ON public.creator_social_account_status TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Helper function search_path.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.aether_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(auth.role(), '') = 'service_role'
        OR current_user = 'service_role';
$$;

-- ---------------------------------------------------------------------------
-- 4. Remove anonymous default EXECUTE on SECURITY DEFINER functions.
-- ---------------------------------------------------------------------------
-- New functions receive EXECUTE for PUBLIC by default. Revoke that broadly, then
-- re-grant only the authenticated RPCs and service-role internals the app uses.
-- This clears the anon-executable advisor findings while keeping intended
-- signed-in flows callable.

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Authenticated product RPCs.
GRANT EXECUTE ON FUNCTION public.claim_initial_user_role(public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_creator_onboarding(text, text[], integer, numeric, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_stripe_connect_account(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_pool_funding_intent(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_draft_performance_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_creator_social_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

-- Brand moderation RPCs.
GRANT EXECUTE ON FUNCTION public.approve_clip(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_clip(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_changes_clip(uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disqualify_clip(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.override_clip_fraud(uuid, text) TO authenticated;

-- Creator withdrawal / referral / reward RPCs.
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_referral(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral_bonus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_challenge(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_clip_bonus() TO authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_challenge_reward(int) TO authenticated;

-- RLS helper functions intentionally callable by signed-in users because RLS
-- policies reference them during normal table reads/writes.
GRANT EXECUTE ON FUNCTION public.owns_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_creator() TO authenticated;

-- Service-role only internals called by worker / Edge Functions / server admin.
GRANT EXECUTE ON FUNCTION public.settle_pool_funding_payment(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_withdrawal(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_withdrawal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_payout_paid(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_payout_failed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_payout_for_creator(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_due_earnings(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_approve_overdue_clips(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_exhausted_performance_campaigns(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_campaign_budget_drift(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_payout_revenue_drift(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_clip_quality_invariants(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_disqualified_clip_earnings(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fraud_event_stats(interval) TO service_role;
GRANT EXECUTE ON FUNCTION public.fraud_repeat_offenders(interval, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_revenue_summary(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_escrow_release(uuid, uuid, numeric, text) TO service_role;
