-- Aether Migration: UGC vs Clipping separation — hardening v2 (caps + immutability).
--
-- Builds on 20260603040000 (category + category_meta shape validation) and
-- 20260603060000 (clip submission gates). Closes the remaining gaps that the
-- shape-only validation did not cover:
--
--   1. NO LENGTH / SIZE CAPS in the DB. The TypeScript Zod schema caps fields
--      (5000 / 2048 chars), but a brand writing their own campaign directly via
--      supabase-js (RLS permits it) bypasses Zod entirely → unbounded JSONB
--      (storage abuse / row bloat / slow reads). validate_category_meta now
--      enforces the SAME caps as lib/campaign-category-meta.ts, plus a hard
--      total-size CHECK on category_meta.
--   2. campaign_category WAS MUTABLE on a live campaign. Flipping ugc<->clipping
--      after creators joined / submitted invalidates their work and the brand's
--      moderation expectations. It is now IMMUTABLE once any participation or
--      clip exists (the brief may still be edited; the TYPE is locked).
--
-- BACKWARD COMPATIBLE: new CHECK is NOT VALID (legacy rows never rejected);
-- validate_category_meta stays IMMUTABLE and a pure function of its inputs.

-- ---------------------------------------------------------------------------
-- 1. Hard total-size cap on category_meta (defense against bloat / abuse).
--    ~20 KB serialized is far above any legitimate brief (4 fields x 5000).
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaigns
    DROP CONSTRAINT IF EXISTS campaigns_category_meta_size;
ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_category_meta_size
        CHECK (octet_length(category_meta::text) <= 20000)
        NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. validate_category_meta — add per-field length caps (mirror the TS schema).
--    UGC:      creative_direction 3..5000; references/dos/donts <= 5000
--    clipping: source_url 8..2048 (https?://); requirements <= 5000; 1<=min<=max<=600
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_category_meta(
    p_category text,
    p_meta jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_dir text;
    v_url text;
    v_min int;
    v_max int;
BEGIN
    IF p_category IS NULL OR p_category NOT IN ('ugc', 'clipping') THEN
        RETURN false;
    END IF;

    IF p_meta IS NULL OR jsonb_typeof(p_meta) <> 'object' THEN
        RETURN false;
    END IF;

    -- Hard total-size guard (belt-and-suspenders vs. the table CHECK).
    IF octet_length(p_meta::text) > 20000 THEN
        RETURN false;
    END IF;

    IF p_category = 'ugc' THEN
        v_dir := trim(COALESCE(p_meta->>'creative_direction', ''));
        IF length(v_dir) < 3 OR length(v_dir) > 5000 THEN
            RETURN false;
        END IF;
        -- Optional string fields: if present, must be scalar strings within cap.
        IF (p_meta ? 'references') AND (
               jsonb_typeof(p_meta->'references') <> 'string'
            OR length(p_meta->>'references') > 5000) THEN
            RETURN false;
        END IF;
        IF (p_meta ? 'dos') AND (
               jsonb_typeof(p_meta->'dos') <> 'string'
            OR length(p_meta->>'dos') > 5000) THEN
            RETURN false;
        END IF;
        IF (p_meta ? 'donts') AND (
               jsonb_typeof(p_meta->'donts') <> 'string'
            OR length(p_meta->>'donts') > 5000) THEN
            RETURN false;
        END IF;
        RETURN true;
    END IF;

    -- clipping
    v_url := trim(COALESCE(p_meta->>'source_url', ''));
    IF length(v_url) < 8 OR length(v_url) > 2048 OR v_url !~* '^https?://' THEN
        RETURN false;
    END IF;
    BEGIN
        v_min := (p_meta->>'min_duration_sec')::int;
        v_max := (p_meta->>'max_duration_sec')::int;
    EXCEPTION
        WHEN OTHERS THEN
            RETURN false;
    END;
    IF v_min IS NULL OR v_max IS NULL OR v_min < 1 OR v_max < v_min OR v_max > 600 THEN
        RETURN false;
    END IF;
    IF (p_meta ? 'requirements') AND (
           jsonb_typeof(p_meta->'requirements') <> 'string'
        OR length(p_meta->>'requirements') > 5000) THEN
        RETURN false;
    END IF;
    RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. enforce_campaign_category_meta — add category immutability once engaged.
--    Re-creates 20260603040000 with an UPDATE guard: a performance campaign's
--    category cannot change after creators have participated or submitted clips.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_campaign_category_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_engaged boolean;
BEGIN
    IF NEW.campaign_type = 'fixed' THEN
        NEW.campaign_category := NULL;
        NEW.category_meta := '{}'::jsonb;
        RETURN NEW;
    END IF;

    IF NEW.campaign_type = 'performance' THEN
        IF NEW.campaign_category IS NULL
            OR NEW.campaign_category NOT IN ('ugc', 'clipping') THEN
            RAISE WARNING '[ALERT] campaign.category_missing business=% title=%',
                NEW.business_id, COALESCE(NEW.title, '-');
            RAISE EXCEPTION 'performance_requires_category'
                USING ERRCODE = 'check_violation',
                      MESSAGE = 'Performance campaigns require category ugc or clipping.';
        END IF;

        IF NOT public.validate_category_meta(NEW.campaign_category, NEW.category_meta) THEN
            RAISE WARNING '[ALERT] campaign.category_meta_invalid business=% category=%',
                NEW.business_id, NEW.campaign_category;
            RAISE EXCEPTION 'invalid_category_meta'
                USING ERRCODE = 'check_violation',
                      MESSAGE = 'Category brief is incomplete or invalid for the selected campaign type.';
        END IF;

        -- Immutability: lock the category once creators have engaged. The brief
        -- (category_meta) may still be edited; only the TYPE switch is blocked.
        IF TG_OP = 'UPDATE'
            AND OLD.campaign_category IS NOT NULL
            AND NEW.campaign_category IS DISTINCT FROM OLD.campaign_category THEN

            SELECT EXISTS (
                SELECT 1 FROM public.clips WHERE campaign_id = NEW.id
                UNION ALL
                SELECT 1 FROM public.participations WHERE campaign_id = NEW.id
                LIMIT 1
            ) INTO v_engaged;

            IF v_engaged THEN
                RAISE WARNING '[ALERT] campaign.category_switch_blocked campaign=% from=% to=%',
                    NEW.id, OLD.campaign_category, NEW.campaign_category;
                RAISE EXCEPTION 'category_immutable_after_engagement'
                    USING ERRCODE = 'check_violation',
                          MESSAGE = 'Campaign category cannot change after creators have joined or submitted clips.';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Trigger definition unchanged (BEFORE INSERT OR UPDATE OF the three columns);
-- re-assert it so a fresh apply is self-contained.
DROP TRIGGER IF EXISTS trg_campaigns_category_meta ON public.campaigns;
CREATE TRIGGER trg_campaigns_category_meta
    BEFORE INSERT OR UPDATE OF campaign_type, campaign_category, category_meta
    ON public.campaigns
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_campaign_category_meta();

-- ---------------------------------------------------------------------------
-- 4. Truncate any legacy over-cap fields so the new CHECK can be VALIDATED
--    later without rejecting historical rows (idempotent, performance only).
-- ---------------------------------------------------------------------------
UPDATE public.campaigns
    SET category_meta = jsonb_build_object(
        'creative_direction', left(COALESCE(category_meta->>'creative_direction', ''), 5000),
        'references',         left(COALESCE(category_meta->>'references', ''), 5000),
        'dos',                left(COALESCE(category_meta->>'dos', ''), 5000),
        'donts',              left(COALESCE(category_meta->>'donts', ''), 5000)
    )
    WHERE campaign_type = 'performance'
      AND campaign_category = 'ugc'
      AND octet_length(category_meta::text) > 20000;

UPDATE public.campaigns
    SET category_meta = jsonb_build_object(
        'source_url',       left(COALESCE(category_meta->>'source_url', ''), 2048),
        'min_duration_sec', COALESCE((category_meta->>'min_duration_sec')::int, 10),
        'max_duration_sec', GREATEST(
            COALESCE((category_meta->>'max_duration_sec')::int, 60),
            COALESCE((category_meta->>'min_duration_sec')::int, 10)
        ),
        'requirements',     left(COALESCE(category_meta->>'requirements', ''), 5000)
    )
    WHERE campaign_type = 'performance'
      AND campaign_category = 'clipping'
      AND octet_length(category_meta::text) > 20000;
