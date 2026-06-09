-- Let creator social OAuth return to the surface that initiated linking
-- instead of always landing on /creator/clips.
ALTER TABLE public.creator_social_oauth_states
    ADD COLUMN IF NOT EXISTS return_path TEXT NOT NULL DEFAULT '/creator/settings';

ALTER TABLE public.creator_social_oauth_states
    DROP CONSTRAINT IF EXISTS creator_social_oauth_states_return_path_safe;
ALTER TABLE public.creator_social_oauth_states
    ADD CONSTRAINT creator_social_oauth_states_return_path_safe
        CHECK (
            length(return_path) BETWEEN 1 AND 256
            AND return_path LIKE '/creator/%'
            AND return_path NOT LIKE '//%'
        );

COMMENT ON COLUMN public.creator_social_oauth_states.return_path IS
    'Safe app-relative creator path used after social OAuth completes.';
