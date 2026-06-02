-- Aether Migration: time-decayed fraud scoring + brand override.
--
-- Extends the fraud system (20260602130000_clip_fraud_score) with:
--   - fraud_score_updated_at: when the score was last written, so the worker can
--     time-decay the carried-over score on the next sync.
--   - fraud_overridden: a brand "this flagged clip is fine" override. When set,
--     the worker suppresses soft-score flagging/disqualification for the clip
--     (a hard velocity-cap breach still always disqualifies — see worker/fraud.ts).

ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS fraud_score_updated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fraud_overridden BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clips.fraud_score_updated_at IS
    'When fraud_score was last written; drives the time-decay of carried-over risk.';
COMMENT ON COLUMN public.clips.fraud_overridden IS
    'Brand override: suppress soft-score fraud flagging/disqualification (hard caps still apply).';
