-- Aether Migration: Full UGC vs Clipping separation (schema + enforcement).
--
-- Hardens campaign_category / category_meta with:
--   * Fixed campaigns must leave category NULL; performance must declare ugc|clipping.
--   * JSONB shape validation per category (trigger, not app-only).
--   * Combined clip submission gates (budget 90% + platform allowlist + category set).
--   * Discovery / moderation indexes.
--   * Backfill legacy performance rows with valid default meta.

-- ---------------------------------------------------------------------------
-- 1. Structural constraints (backward compatible via NOT VALID where needed)
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaigns
    DROP CONSTRAINT IF EXISTS campaigns_fixed_no_category;
ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_fixed_no_category
        CHECK (campaign_type <> 'fixed' OR campaign_category IS NULL)
        NOT VALID;

ALTER TABLE public.campaigns
    DROP CONSTRAINT IF EXISTS campaigns_category_meta_is_object;
ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_category_meta_is_object
        CHECK (jsonb_typeof(category_meta) = 'object')
        NOT VALID;

-- Performance campaigns must carry non-empty category_meta (validated by trigger).
ALTER TABLE public.campaigns
    DROP CONSTRAINT IF EXISTS campaigns_perf_meta_nonempty;
ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_perf_meta_nonempty
        CHECK (campaign_type <> 'performance' OR category_meta <> '{}'::jsonb)
        NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. validate_category_meta — shared rules (mirrors lib/campaign-category-meta.ts)
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

    IF p_category = 'ugc' THEN
        v_dir := trim(COALESCE(p_meta->>'creative_direction', ''));
        IF length(v_dir) < 3 THEN
            RETURN false;
        END IF;
        -- Optional string fields: if present, must be scalar strings.
        IF (p_meta ? 'references') AND jsonb_typeof(p_meta->'references') <> 'string' THEN
            RETURN false;
        END IF;
        IF (p_meta ? 'dos') AND jsonb_typeof(p_meta->'dos') <> 'string' THEN
            RETURN false;
        END IF;
        IF (p_meta ? 'donts') AND jsonb_typeof(p_meta->'donts') <> 'string' THEN
            RETURN false;
        END IF;
        RETURN true;
    END IF;

    -- clipping
    v_url := trim(COALESCE(p_meta->>'source_url', ''));
    IF length(v_url) < 8 OR v_url !~* '^https?://' THEN
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
    IF (p_meta ? 'requirements') AND jsonb_typeof(p_meta->'requirements') <> 'string' THEN
        RETURN false;
    END IF;
    RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Campaign write validation (creation / updates)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_campaign_category_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaigns_category_meta ON public.campaigns;
CREATE TRIGGER trg_campaigns_category_meta
    BEFORE INSERT OR UPDATE OF campaign_type, campaign_category, category_meta
    ON public.campaigns
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_campaign_category_meta();

-- ---------------------------------------------------------------------------
-- 4. Backfill legacy performance campaigns (idempotent)
-- ---------------------------------------------------------------------------
UPDATE public.campaigns
    SET campaign_category = 'clipping'
    WHERE campaign_type = 'performance' AND campaign_category IS NULL;

UPDATE public.campaigns
    SET category_meta = jsonb_build_object(
        'source_url', COALESCE(NULLIF(trim(category_meta->>'source_url'), ''), 'https://example.com/source'),
        'min_duration_sec', COALESCE((category_meta->>'min_duration_sec')::int, 10),
        'max_duration_sec', GREATEST(
            COALESCE((category_meta->>'max_duration_sec')::int, 60),
            COALESCE((category_meta->>'min_duration_sec')::int, 10)
        ),
        'requirements', COALESCE(category_meta->>'requirements', '')
    )
    WHERE campaign_type = 'performance'
      AND campaign_category = 'clipping'
      AND NOT public.validate_category_meta('clipping', category_meta);

UPDATE public.campaigns
    SET category_meta = jsonb_build_object(
        'creative_direction', COALESCE(
            NULLIF(trim(category_meta->>'creative_direction'), ''),
            'Legacy UGC campaign — update the creative brief in campaign settings.'
        ),
        'references', COALESCE(category_meta->>'references', ''),
        'dos', COALESCE(category_meta->>'dos', ''),
        'donts', COALESCE(category_meta->>'donts', '')
    )
    WHERE campaign_type = 'performance'
      AND campaign_category = 'ugc'
      AND NOT public.validate_category_meta('ugc', category_meta);

-- ---------------------------------------------------------------------------
-- 5. Clip submission gates (budget + category + platform) — single campaign lock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_clip_submission_gates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_camp   public.campaigns%ROWTYPE;
    v_pool   numeric;
    v_used   numeric;
    v_pct    numeric;
    v_block  constant numeric := 0.9;
BEGIN
    SELECT * INTO v_camp
        FROM public.campaigns
        WHERE id = NEW.campaign_id
        FOR UPDATE;

    IF NOT FOUND OR v_camp.campaign_type <> 'performance' THEN
        RETURN NEW;
    END IF;

    IF v_camp.campaign_category IS NULL
        OR v_camp.campaign_category NOT IN ('ugc', 'clipping') THEN
        RAISE WARNING '[ALERT] clip.submit.missing_category campaign=% clip=%',
            v_camp.id, NEW.id;
        RAISE EXCEPTION 'campaign_category_unset'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This campaign is not configured for clip submissions.';
    END IF;

    IF v_camp.status NOT IN ('open', 'in_progress') THEN
        RAISE EXCEPTION 'campaign_not_accepting_clips'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This campaign is closed and is not accepting new clips.';
    END IF;

    IF COALESCE(array_length(v_camp.platforms, 1), 0) > 0
        AND NOT (NEW.platform = ANY (v_camp.platforms)) THEN
        RAISE WARNING '[ALERT] clip.submit.platform_rejected campaign=% platform=% allowed=%',
            v_camp.id, NEW.platform, v_camp.platforms;
        RAISE EXCEPTION 'clip_platform_not_allowed'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This clip platform is not allowed for this campaign.';
    END IF;

    v_pool := public.campaign_creator_pool(v_camp);
    v_used := COALESCE(v_camp.budget_reserved, 0) + COALESCE(v_camp.budget_paid, 0);
    IF v_pool > 0 THEN
        v_pct := v_used / v_pool;
        IF v_pct >= v_block THEN
            RAISE WARNING '[ALERT] clip.submit.blocked_90pct campaign=% category=% used_pct=%',
                v_camp.id, v_camp.campaign_category, round(v_pct::numeric, 4);
            RAISE EXCEPTION 'campaign_budget_nearly_full'
                USING ERRCODE = 'check_violation',
                      MESSAGE = 'This campaign has used most of its budget and is no longer accepting new clips.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clips_budget_submission_gate ON public.clips;
DROP TRIGGER IF EXISTS trg_clips_submission_gates ON public.clips;
CREATE TRIGGER trg_clips_submission_gates
    BEFORE INSERT ON public.clips
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_clip_submission_gates();

-- ---------------------------------------------------------------------------
-- 6. Indexes — discovery, brand dashboards, moderation
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_campaigns_category;
CREATE INDEX IF NOT EXISTS idx_campaigns_perf_discover
    ON public.campaigns (campaign_category, created_at DESC)
    WHERE campaign_type = 'performance'
      AND status IN ('open', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_campaigns_business_perf_category
    ON public.campaigns (business_id, campaign_category)
    WHERE campaign_type = 'performance';

CREATE INDEX IF NOT EXISTS idx_clips_pending_review
    ON public.clips (campaign_id, created_at DESC)
    WHERE status = 'pending'
      AND quality_status = 'pending_review';

CREATE INDEX IF NOT EXISTS idx_clips_fraud_flagged_campaign
    ON public.clips (campaign_id, fraud_score DESC)
    WHERE status = 'tracking'
      AND fraud_flagged = true;
