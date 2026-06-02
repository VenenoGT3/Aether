-- Aether Migration: Performance-Based Clipping — Phase 3
-- Brand moderation of clips (approve / reject).
--
-- Additive: adds review metadata to clips and a defense-in-depth trigger so
-- brands can only touch moderation fields. The clip status set itself
-- (pending / approved / rejected / tracking / disqualified) already exists from
-- Phase 1, and the "Brand moderates clip" UPDATE policy (owns_campaign) already
-- authorizes owners — so no new RLS policy is required here.

-- ===========================================================================
-- 1. Review metadata on clips
-- ===========================================================================
ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS review_note TEXT;

COMMENT ON COLUMN public.clips.reviewed_at IS 'When a brand last approved/rejected this clip.';
COMMENT ON COLUMN public.clips.reviewed_by IS 'Brand user who moderated the clip.';
COMMENT ON COLUMN public.clips.review_note IS 'Optional brand note/reason (e.g. why a clip was rejected).';

-- ===========================================================================
-- 2. Defense-in-depth: restrict what a brand may change on a clip
-- ===========================================================================
-- The "Brand moderates clip" RLS policy lets a campaign owner UPDATE their
-- clips. This trigger ensures an authenticated brand can ONLY change the
-- moderation fields (status / review_*) — never the creator-owned content or
-- the system-owned view/earning watermarks. The view-sync worker writes those
-- via the service role (auth.uid() IS NULL), which is allowed to change anything.
CREATE OR REPLACE FUNCTION public.check_clip_update()
RETURNS trigger AS $$
BEGIN
    -- Service-role / system updates have no auth context: allow (worker writes).
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    -- Authenticated (brand) moderation may only touch moderation fields.
    IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
        OR NEW.participation_id IS DISTINCT FROM OLD.participation_id
        OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
        OR NEW.platform IS DISTINCT FROM OLD.platform
        OR NEW.post_url IS DISTINCT FROM OLD.post_url
        OR NEW.external_post_id IS DISTINCT FROM OLD.external_post_id
        OR NEW.counted_views IS DISTINCT FROM OLD.counted_views
        OR NEW.current_views IS DISTINCT FROM OLD.current_views
    THEN
        RAISE EXCEPTION 'Brands may only update clip moderation fields (status, review).';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER verify_clip_changes
    BEFORE UPDATE ON public.clips
    FOR EACH ROW EXECUTE FUNCTION public.check_clip_update();
