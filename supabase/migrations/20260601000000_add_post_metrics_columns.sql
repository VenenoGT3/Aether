-- Add metrics columns to public.posts table
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS comments INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS saves INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS engagement_rate NUMERIC(5,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ;

-- Add description for columns
COMMENT ON COLUMN public.posts.views IS 'Calculated views or play counts extracted from the public Reels/TikTok video info endpoint.';
COMMENT ON COLUMN public.posts.likes IS 'Total like count synced from the platform API.';
COMMENT ON COLUMN public.posts.comments IS 'Total comment count synced from the platform API.';
COMMENT ON COLUMN public.posts.shares IS 'Total share count synced from the platform API.';
COMMENT ON COLUMN public.posts.saves IS 'Total save/collect count synced from the platform API, if available.';
COMMENT ON COLUMN public.posts.engagement_rate IS 'Engagement percentage calculated as ((likes + comments + shares + saves) / views) * 100.';
COMMENT ON COLUMN public.posts.fetched_at IS 'Timestamp of when these metrics were last automatically fetched.';
