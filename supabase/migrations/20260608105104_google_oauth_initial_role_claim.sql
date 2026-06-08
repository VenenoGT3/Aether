-- Aether Migration: Google OAuth initial role claim.
--
-- Supabase social OAuth cannot attach app-specific signup metadata in the same
-- way email signup does. This lets a not-yet-onboarded OAuth user claim the
-- role implied by the post-auth redirect path, while preserving the existing
-- admin-only role-change rule for onboarded accounts.

CREATE OR REPLACE FUNCTION public.check_user_update()
RETURNS trigger AS $$
DECLARE
    v_initial_role_claim boolean;
    v_is_not_onboarded boolean;
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        v_initial_role_claim := COALESCE(
            current_setting('aether.initial_role_claim', true) = 'true',
            false
        );

        IF v_initial_role_claim AND auth.uid() = OLD.id THEN
            SELECT NOT COALESCE(onboarded, false)
            INTO v_is_not_onboarded
            FROM public.profiles
            WHERE user_id = OLD.id;

            IF COALESCE(v_is_not_onboarded, true) THEN
                RETURN NEW;
            END IF;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only administrators can change user roles.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.claim_initial_user_role(p_role public.user_role)
RETURNS public.user_role AS $$
DECLARE
    v_existing_role public.user_role;
    v_onboarded boolean;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    INSERT INTO public.users (id, email, role)
    VALUES (auth.uid(), auth.email(), p_role)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (user_id, full_name, avatar_url)
    VALUES (auth.uid(), '', '')
    ON CONFLICT (user_id) DO NOTHING;

    SELECT u.role, COALESCE(p.onboarded, false)
    INTO v_existing_role, v_onboarded
    FROM public.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE u.id = auth.uid()
    FOR UPDATE OF u;

    IF v_onboarded THEN
        RETURN v_existing_role;
    END IF;

    PERFORM set_config('aether.initial_role_claim', 'true', true);

    UPDATE public.users
    SET role = p_role,
        updated_at = now()
    WHERE id = auth.uid();

    RETURN p_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.claim_initial_user_role(public.user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_initial_user_role(public.user_role) TO authenticated;

COMMENT ON FUNCTION public.claim_initial_user_role(public.user_role) IS
    'Allows authenticated OAuth users to set their initial Aether role before onboarding; onboarded users keep admin-only role-change protection.';
