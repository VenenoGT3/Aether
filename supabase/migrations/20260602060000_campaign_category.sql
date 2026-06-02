-- Aether Migration: UGC vs Clipping campaign category
--
-- Additive. Performance campaigns are now sub-typed by HOW the content is made:
--   * 'ugc'      — creators produce ORIGINAL content from a brief
--   * 'clipping' — creators CUT short clips from brand-supplied source footage
--
-- The existing campaign_type (fixed | performance) is unchanged and continues to
-- coexist: category only applies to performance campaigns (NULL for fixed).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS campaign_category TEXT
        CHECK (campaign_category IS NULL OR campaign_category IN ('ugc', 'clipping')),
    ADD COLUMN IF NOT EXISTS category_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- content_rules was written by createCampaignAction but never had a column;
    -- add it so performance campaign inserts actually persist their rules/asset kit.
    ADD COLUMN IF NOT EXISTS content_rules JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.campaigns.campaign_category IS
    'Performance sub-type: ugc (creator-original from a brief) or clipping (cut from brand source). NULL for fixed campaigns.';
COMMENT ON COLUMN public.campaigns.category_meta IS
    'Type-specific brief: UGC { creative_direction, references, dos, donts } or clipping { source_url, min_duration_sec, max_duration_sec, requirements }.';

-- ---------------------------------------------------------------------------
-- 2. Backfill + conditional requirement
-- ---------------------------------------------------------------------------
-- Existing performance campaigns predate the split and were all clipping.
UPDATE public.campaigns
    SET campaign_category = 'clipping'
    WHERE campaign_type = 'performance' AND campaign_category IS NULL;

-- A performance campaign MUST declare a category; fixed campaigns leave it NULL.
ALTER TABLE public.campaigns
    DROP CONSTRAINT IF EXISTS campaigns_performance_requires_category;
ALTER TABLE public.campaigns
    ADD CONSTRAINT campaigns_performance_requires_category
    CHECK (campaign_type <> 'performance' OR campaign_category IN ('ugc', 'clipping'));

-- ---------------------------------------------------------------------------
-- 3. Index (discovery filters by category)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_campaigns_category ON public.campaigns(campaign_category);
