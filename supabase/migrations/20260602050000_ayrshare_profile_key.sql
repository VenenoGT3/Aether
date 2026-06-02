-- Aether Migration: Ayrshare account-linking preparation
--
-- Real Ayrshare scopes a creator's social analytics via a per-user "Profile-Key".
-- This stores that key on the creator's profile so the view-sync worker can,
-- once account linking is implemented, fetch analytics scoped to that creator's
-- linked accounts. NULL until the creator links their accounts. Additive.
-- (Per-clip linkage already lives on clips.external_post_id / clips.ayrshare_ref.)

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS ayrshare_profile_key TEXT;

COMMENT ON COLUMN public.profiles.ayrshare_profile_key IS
    'Ayrshare Profile-Key for the creator''s linked social accounts (NULL = not linked).';
