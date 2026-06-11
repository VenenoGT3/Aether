-- Safe public brand-card metadata for creator discovery.
--
-- Business profile rows contain private operational fields (Stripe readiness,
-- billing/account data), and profile RLS intentionally does not expose them to
-- creators until there is a participation relationship. Discovery needs only a
-- display name and optional avatar, so keep a minimal public table with strict
-- RLS and explicit Data API grants.

CREATE TABLE IF NOT EXISTS public.brand_public_profiles (
    business_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    display_name text,
    avatar_url text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.brand_public_profiles IS
    'Safe brand-card metadata exposed to authenticated creator discovery. No billing, Stripe, website, or private profile fields.';
COMMENT ON COLUMN public.brand_public_profiles.business_id IS
    'Brand auth/user id. Mirrors public.users.id for business/admin accounts only.';
COMMENT ON COLUMN public.brand_public_profiles.display_name IS
    'Public marketplace display name copied from company_name or full_name.';
COMMENT ON COLUMN public.brand_public_profiles.avatar_url IS
    'Optional public brand avatar/logo URL copied from profiles.avatar_url.';

ALTER TABLE public.brand_public_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read public brand cards"
    ON public.brand_public_profiles;
CREATE POLICY "Authenticated users can read public brand cards"
    ON public.brand_public_profiles
    FOR SELECT
    TO authenticated
    USING (true);

REVOKE ALL ON TABLE public.brand_public_profiles FROM PUBLIC;
GRANT SELECT ON TABLE public.brand_public_profiles TO authenticated;
GRANT ALL ON TABLE public.brand_public_profiles TO service_role;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.refresh_brand_public_profile(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
    v_role text;
    v_display_name text;
    v_avatar_url text;
BEGIN
    SELECT
        u.role::text,
        NULLIF(BTRIM(COALESCE(p.company_name, p.full_name, '')), ''),
        NULLIF(BTRIM(COALESCE(p.avatar_url, '')), '')
    INTO v_role, v_display_name, v_avatar_url
    FROM public.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE u.id = p_user_id;

    IF v_role IN ('business', 'admin') THEN
        INSERT INTO public.brand_public_profiles (
            business_id,
            display_name,
            avatar_url,
            updated_at
        )
        VALUES (
            p_user_id,
            v_display_name,
            v_avatar_url,
            now()
        )
        ON CONFLICT (business_id) DO UPDATE
        SET
            display_name = EXCLUDED.display_name,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = now();
    ELSE
        DELETE FROM public.brand_public_profiles
        WHERE business_id = p_user_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_brand_public_profile_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
    PERFORM private.refresh_brand_public_profile(NEW.user_id);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_brand_public_profile_from_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
    PERFORM private.refresh_brand_public_profile(NEW.id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_brand_public_profile_from_profile
    ON public.profiles;
CREATE TRIGGER trg_sync_brand_public_profile_from_profile
    AFTER INSERT OR UPDATE OF company_name, full_name, avatar_url
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION private.sync_brand_public_profile_from_profile();

DROP TRIGGER IF EXISTS trg_sync_brand_public_profile_from_user
    ON public.users;
CREATE TRIGGER trg_sync_brand_public_profile_from_user
    AFTER INSERT OR UPDATE OF role
    ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION private.sync_brand_public_profile_from_user();

INSERT INTO public.brand_public_profiles (
    business_id,
    display_name,
    avatar_url,
    updated_at
)
SELECT
    p.user_id,
    NULLIF(BTRIM(COALESCE(p.company_name, p.full_name, '')), ''),
    NULLIF(BTRIM(COALESCE(p.avatar_url, '')), ''),
    now()
FROM public.profiles p
JOIN public.users u ON u.id = p.user_id
WHERE u.role IN ('business', 'admin')
ON CONFLICT (business_id) DO UPDATE
SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now();
