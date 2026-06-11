CREATE TABLE IF NOT EXISTS public.post_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    author_role public.user_role NOT NULL,
    text TEXT NOT NULL CHECK (char_length(btrim(text)) BETWEEN 1 AND 2000),
    x NUMERIC(5,2) NOT NULL CHECK (x >= 0 AND x <= 100),
    y NUMERIC(5,2) NOT NULL CHECK (y >= 0 AND y <= 100),
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.post_annotations IS
    'Persistent review pins and coordinate-less feedback attached to submitted campaign posts.';
COMMENT ON COLUMN public.post_annotations.x IS
    'Horizontal position as a 0-100 percentage of the preview surface. Use 50 for coordinate-less review feedback.';
COMMENT ON COLUMN public.post_annotations.y IS
    'Vertical position as a 0-100 percentage of the preview surface. Use 50 for coordinate-less review feedback.';

ALTER TABLE public.post_annotations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_post_annotations_post_created
    ON public.post_annotations (post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_post_annotations_author_created
    ON public.post_annotations (author_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.verify_post_annotation_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.post_id IS DISTINCT FROM OLD.post_id
        OR NEW.author_id IS DISTINCT FROM OLD.author_id
        OR NEW.author_role IS DISTINCT FROM OLD.author_role
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'post_annotation_immutable_fields'
            USING ERRCODE = '42501',
                  MESSAGE = 'Post annotation ownership fields cannot be changed.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS verify_post_annotation_update ON public.post_annotations;
CREATE TRIGGER verify_post_annotation_update
    BEFORE UPDATE ON public.post_annotations
    FOR EACH ROW EXECUTE FUNCTION public.verify_post_annotation_update();

DROP TRIGGER IF EXISTS update_post_annotations_updated_at ON public.post_annotations;
CREATE TRIGGER update_post_annotations_updated_at
    BEFORE UPDATE ON public.post_annotations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Participants can read post annotations" ON public.post_annotations;
CREATE POLICY "Participants can read post annotations"
    ON public.post_annotations FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.posts po
            JOIN public.participations pa ON pa.id = po.participation_id
            JOIN public.campaigns ca ON ca.id = pa.campaign_id
            WHERE po.id = post_id
              AND (pa.influencer_id = auth.uid() OR ca.business_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Participants can create post annotations" ON public.post_annotations;
CREATE POLICY "Participants can create post annotations"
    ON public.post_annotations FOR INSERT TO authenticated
    WITH CHECK (
        author_id = auth.uid()
        AND author_role = (
            SELECT role
            FROM public.users
            WHERE id = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM public.posts po
            JOIN public.participations pa ON pa.id = po.participation_id
            JOIN public.campaigns ca ON ca.id = pa.campaign_id
            WHERE po.id = post_id
              AND (pa.influencer_id = auth.uid() OR ca.business_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "Participants can resolve post annotations" ON public.post_annotations;
CREATE POLICY "Participants can resolve post annotations"
    ON public.post_annotations FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.posts po
            JOIN public.participations pa ON pa.id = po.participation_id
            JOIN public.campaigns ca ON ca.id = pa.campaign_id
            WHERE po.id = post_id
              AND (pa.influencer_id = auth.uid() OR ca.business_id = auth.uid())
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.posts po
            JOIN public.participations pa ON pa.id = po.participation_id
            JOIN public.campaigns ca ON ca.id = pa.campaign_id
            WHERE po.id = post_id
              AND (pa.influencer_id = auth.uid() OR ca.business_id = auth.uid())
        )
    );

REVOKE ALL ON public.post_annotations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.post_annotations TO authenticated;
GRANT ALL ON public.post_annotations TO service_role;
