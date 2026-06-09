-- Aether Migration: stop storing YouTube OAuth tokens.
--
-- The YouTube grant exists only to prove channel ownership at link time
-- (channels?mine=true); view tracking uses the public Data API with the
-- server key. The social-oauth edge function now revokes the grant in the
-- callback and stores no tokens, so clear the ones written before that
-- change — a secret the database doesn't hold can't leak from it.
--
-- (These tokens cannot be revoked from SQL; online-only access tokens expire
-- within the hour, and any legacy offline grants are revoked by the
-- /disconnect flow or by the user via their Google account settings.)

UPDATE public.creator_social_accounts
SET access_token = NULL,
    refresh_token = NULL,
    token_expires_at = NULL,
    refresh_expires_at = NULL,
    updated_at = now()
WHERE platform = 'youtube'
  AND provider = 'youtube_official'
  AND (access_token IS NOT NULL OR refresh_token IS NOT NULL);
