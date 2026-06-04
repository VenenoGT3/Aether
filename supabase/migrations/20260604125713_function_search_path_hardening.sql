-- Aether production function search_path hardening.
--
-- Supabase security advisor warns when functions inherit a caller/role mutable
-- search_path. These ALTER FUNCTION statements pin existing helpers to public.

ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.handle_update_user() SET search_path = public;

ALTER FUNCTION public.check_post_update() SET search_path = public;
ALTER FUNCTION public.check_user_update() SET search_path = public;
ALTER FUNCTION public.check_message_update() SET search_path = public;

ALTER FUNCTION public.add_business_days(timestamptz, int) SET search_path = public;

ALTER FUNCTION public.campaign_creator_pool(public.campaigns) SET search_path = public;
ALTER FUNCTION public.campaign_budget_remaining(public.campaigns) SET search_path = public;
ALTER FUNCTION public.campaign_budget_used_pct(public.campaigns) SET search_path = public;
ALTER FUNCTION public.campaign_blocks_clip_submission(public.campaigns) SET search_path = public;

ALTER FUNCTION public.validate_category_meta(text, jsonb) SET search_path = public;

ALTER FUNCTION public.platform_withdrawal_fee_pct() SET search_path = public;
ALTER FUNCTION public.platform_withdrawal_min() SET search_path = public;

ALTER FUNCTION public.weekly_challenge_reward(int) SET search_path = public;

COMMENT ON TABLE public.clip_fraud_events IS
    'Internal service-role fraud audit/event table. RLS is enabled with no client policies by design.';
COMMENT ON TABLE public.platform_revenue IS
    'Internal service-role platform revenue ledger. RLS is enabled with no client policies by design.';
