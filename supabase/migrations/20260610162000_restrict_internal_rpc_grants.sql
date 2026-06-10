-- Revoke authenticated EXECUTE on internal trigger/service functions that should
-- never be callable as PostgREST RPCs. The trigger machinery and service_role
-- callers do not need authenticated grants.

REVOKE EXECUTE ON FUNCTION public.guard_campaign_authoritative_fields() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_campaign_insert_defaults() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_clip_provider_fields() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_participation_authoritative_fields() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_profile_authoritative_fields() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_active_clip_external_duplicate() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_pool_funding_payment(text, uuid) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.guard_campaign_authoritative_fields() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_campaign_insert_defaults() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_clip_provider_fields() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_participation_authoritative_fields() FROM anon;
REVOKE EXECUTE ON FUNCTION public.guard_profile_authoritative_fields() FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_active_clip_external_duplicate() FROM anon;
REVOKE EXECUTE ON FUNCTION public.settle_pool_funding_payment(text, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.settle_pool_funding_payment(text, uuid) TO service_role;
