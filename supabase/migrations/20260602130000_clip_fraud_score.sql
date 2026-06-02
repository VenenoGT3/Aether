-- Aether Migration: per-clip fraud score + flag for advanced bot detection.
--
-- The view-sync worker computes a 0–100 fraud score from multiple signals
-- (velocity caps, spike, bot-uniformity, low engagement, velocity anomaly,
-- cross-campaign duplicate). High scores auto-disqualify; medium scores flag the
-- clip for manual brand review (it keeps tracking until the brand acts). These
-- columns persist the latest assessment so the moderation UI can surface risk.

ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS fraud_score INT NOT NULL DEFAULT 0
        CHECK (fraud_score BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS fraud_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS fraud_reasons TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.clips.fraud_score IS
    'Latest 0–100 fraud risk from the view-sync worker (>= disqualify threshold => auto-disqualified).';
COMMENT ON COLUMN public.clips.fraud_flagged IS
    'True when fraud_score is in the manual-review band (flagged but still tracking).';
COMMENT ON COLUMN public.clips.fraud_reasons IS 'Human-readable signals that contributed to the score.';

-- Surface flagged, still-tracking clips quickly for the brand review queue.
CREATE INDEX IF NOT EXISTS idx_clips_fraud_flagged
    ON public.clips(campaign_id)
    WHERE fraud_flagged = TRUE AND status = 'tracking';
