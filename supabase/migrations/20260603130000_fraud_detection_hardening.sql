-- Aether Migration: fraud detection hardening — high-volume indexes + audit trail.
--
-- The fraud scoring engine (worker/fraud.ts) is already weighted, time-decayed,
-- and multi-signal. Two production-scale gaps remain:
--
--   1. MISSING INDEXES FOR THE PER-SYNC FRAUD QUERIES. Every view-sync runs:
--        a) clips WHERE post_url = $1 AND campaign_id <> $2 AND status IN (...)
--        b) clips WHERE external_post_id = $1 AND campaign_id <> $2 AND status IN (...)
--        c) count(clips) WHERE creator_id = $1 AND submitted_at >= window
--      The only post_url index is unique_campaign_post_url (campaign_id, post_url) —
--      its leading column is campaign_id, so a post_url-only predicate cannot use
--      it and falls back to a SEQUENTIAL SCAN. At hundreds of thousands of clips
--      with high-frequency syncs that is a per-sync table scan — a thundering-herd
--      meltdown. external_post_id had no index at all. This adds partial indexes
--      matching the exact query shapes (active clips only → small, hot).
--
--   2. NO FORENSIC TRAIL. Each sync OVERWRITES clips.fraud_score / fraud_reasons,
--      so the history of detections is lost — you cannot investigate a
--      sophisticated bot, tune thresholds from real data, or analyze cross-campaign
--      abuse over time. This adds an APPEND-ONLY clip_fraud_events ledger (one row
--      per flag/disqualify), service-role only, indexed for per-clip / per-creator /
--      per-campaign forensics.
--
-- Backward compatible & additive. Reads/writes of the ledger are service-role only
-- (RLS on, no policies); the worker writes it with the service client.

-- ---------------------------------------------------------------------------
-- 1. Indexes for the per-sync cross-campaign duplicate + creator-burst checks.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clips_post_url_active
    ON public.clips (post_url)
    WHERE status IN ('pending', 'approved', 'tracking');

CREATE INDEX IF NOT EXISTS idx_clips_external_post_id_active
    ON public.clips (external_post_id)
    WHERE external_post_id IS NOT NULL
      AND status IN ('pending', 'approved', 'tracking');

CREATE INDEX IF NOT EXISTS idx_clips_creator_submitted
    ON public.clips (creator_id, submitted_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Append-only fraud event ledger (forensics + cross-campaign abuse analysis).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clip_fraud_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id         UUID NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE,
    campaign_id     UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
    creator_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL CHECK (action IN ('flagged', 'disqualified', 'cleared')),
    score           INT  NOT NULL CHECK (score BETWEEN 0 AND 100),
    signal_score    INT  NOT NULL DEFAULT 0 CHECK (signal_score BETWEEN 0 AND 100),
    velocity_breach BOOLEAN NOT NULL DEFAULT FALSE,
    reasons         TEXT[] NOT NULL DEFAULT '{}',
    trace_id        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clip_fraud_events IS
    'Append-only ledger of fraud detections (flag/disqualify/clear) per clip. Forensics + threshold tuning + cross-campaign abuse analysis. Internal — service-role only.';

-- RLS on with NO policies: only the service role / SECURITY DEFINER may touch it.
ALTER TABLE public.clip_fraud_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_clip_fraud_events_clip
    ON public.clip_fraud_events (clip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clip_fraud_events_creator
    ON public.clip_fraud_events (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clip_fraud_events_campaign
    ON public.clip_fraud_events (campaign_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Cross-campaign abuse summary (service-role forensic helper): creators with
--    repeated fraud events across multiple campaigns in a recent window.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fraud_repeat_offenders(
    p_since interval DEFAULT interval '7 days',
    p_min_events int DEFAULT 3
)
RETURNS TABLE(
    creator_id     uuid,
    event_count    bigint,
    campaign_count bigint,
    disqualified   bigint,
    max_score      int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT e.creator_id,
           COUNT(*)                                            AS event_count,
           COUNT(DISTINCT e.campaign_id)                       AS campaign_count,
           COUNT(*) FILTER (WHERE e.action = 'disqualified')   AS disqualified,
           MAX(e.score)                                        AS max_score
    FROM public.clip_fraud_events e
    WHERE e.created_at >= now() - p_since
      AND e.creator_id IS NOT NULL
    GROUP BY e.creator_id
    HAVING COUNT(*) >= GREATEST(p_min_events, 1)
    ORDER BY COUNT(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.fraud_repeat_offenders(interval, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fraud_repeat_offenders(interval, int) TO service_role;
