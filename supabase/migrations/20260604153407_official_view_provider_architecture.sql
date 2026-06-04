-- Aether Migration: Official view-provider architecture.
--
-- Adds the schema needed to move payout-grade view tracking from a single
-- Ayrshare dependency toward official first-party providers:
--   * YouTube Data API v3 (server API key, clips.external_post_id = video id)
--   * TikTok Display API (creator OAuth, scope video.list)
--
-- This migration intentionally does not expose OAuth token material to browser
-- clients. Account rows are service-role managed until the OAuth callback flow
-- is implemented in a privileged server/Edge Function path.

-- ---------------------------------------------------------------------------
-- 1. Per-creator connected social accounts for first-party API polling
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.creator_social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL
        CHECK (platform IN ('youtube', 'tiktok', 'instagram')),
    provider TEXT NOT NULL
        CHECK (provider IN ('youtube_official', 'tiktok_official', 'ayrshare', 'phyllo')),
    external_account_id TEXT NOT NULL,
    handle TEXT,
    display_name TEXT,
    profile_url TEXT,
    access_token TEXT,
    refresh_token TEXT,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    token_expires_at TIMESTAMPTZ,
    refresh_expires_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'expired', 'revoked', 'error')),
    last_verified_at TIMESTAMPTZ,
    token_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT creator_social_accounts_unique_external
        UNIQUE (platform, provider, external_account_id)
);

COMMENT ON TABLE public.creator_social_accounts IS
    'Server-managed creator account links for payout-grade view polling. RLS enabled with no anon/authenticated policies by design; token columns are not exposed to browser clients.';
COMMENT ON COLUMN public.creator_social_accounts.provider IS
    'Official/aggregator source used for metrics, e.g. youtube_official or tiktok_official.';
COMMENT ON COLUMN public.creator_social_accounts.external_account_id IS
    'Provider account id: YouTube channel id, TikTok open_id, Ayrshare profile key, etc.';
COMMENT ON COLUMN public.creator_social_accounts.access_token IS
    'Sensitive OAuth access token. Service-role only; do not expose via RLS/client selects.';
COMMENT ON COLUMN public.creator_social_accounts.refresh_token IS
    'Sensitive OAuth refresh token. Service-role only; rotate/update on provider refresh.';
COMMENT ON COLUMN public.creator_social_accounts.scopes IS
    'Provider scopes granted by the creator; TikTok direct view polling requires video.list.';
COMMENT ON COLUMN public.creator_social_accounts.token_metadata IS
    'Provider-specific token/account payload kept server-side for audits and future integrations.';

CREATE INDEX IF NOT EXISTS idx_creator_social_accounts_user_platform
    ON public.creator_social_accounts (user_id, platform, provider)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_creator_social_accounts_external
    ON public.creator_social_accounts (platform, provider, external_account_id);

CREATE OR REPLACE TRIGGER set_creator_social_accounts_updated_at
    BEFORE UPDATE ON public.creator_social_accounts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.creator_social_accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.creator_social_accounts FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_social_accounts FROM anon;
REVOKE ALL ON TABLE public.creator_social_accounts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.creator_social_accounts TO service_role;

-- No anon/authenticated policies are created here on purpose: OAuth tokens are
-- money-sensitive. A future connect/disconnect UI should write through a
-- privileged server/Edge Function and expose only redacted account status.

-- ---------------------------------------------------------------------------
-- 2. Clip metadata for provider routing
-- ---------------------------------------------------------------------------

ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS creator_social_account_id UUID
        REFERENCES public.creator_social_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS view_provider TEXT
        CHECK (
            view_provider IS NULL
            OR view_provider IN ('youtube_official', 'tiktok_official', 'ayrshare')
        );

COMMENT ON COLUMN public.clips.external_post_id IS
    'Platform/provider post id used for polling. For official providers: YouTube video id or TikTok video id.';
COMMENT ON COLUMN public.clips.creator_social_account_id IS
    'Optional linked creator account used to prove ownership and fetch creator-scoped metrics.';
COMMENT ON COLUMN public.clips.view_provider IS
    'Preferred trusted metrics source for this clip. Worker falls back only to another configured trusted provider.';
COMMENT ON COLUMN public.view_snapshots.source IS
    'Trusted metrics source used for the snapshot, e.g. youtube_official, tiktok_official, or ayrshare.';

CREATE INDEX IF NOT EXISTS idx_clips_creator_social_account
    ON public.clips (creator_social_account_id)
    WHERE creator_social_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clips_view_provider_tracking
    ON public.clips (view_provider, last_synced_at ASC NULLS FIRST)
    WHERE status = 'tracking';
