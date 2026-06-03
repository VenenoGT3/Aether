-- Aether Migration: clip fraud-override RPC (regression fix) + approval invariants.
--
-- REGRESSION FIXED
--   20260603050000 hardened check_clip_update() to block ALL authenticated clip
--   field changes unless the transaction sets aether.clip_moderation='true' (only
--   the moderation RPCs do). But the brand fraud-override path still wrote
--   clips.fraud_overridden / fraud_flagged DIRECTLY via the authenticated client,
--   so it now raises clip_update_forbidden (42501). Brands could no longer clear a
--   fraud flag. This migration moves the override into an atomic SECURITY DEFINER
--   RPC (override_clip_fraud) that takes the same per-clip lock + ownership check
--   and sets the moderation flag — closing the regression and the bypass at once.
--
-- ADDED INVARIANTS (NOT VALID: enforced on new/updated rows; legacy never rejected)
--   * A flag cannot be both raised and overridden (fraud_flagged + fraud_overridden).
--   * Terminal clips (rejected/disqualified) must not be quality_status='approved'.
--
-- CONCURRENCY: READ COMMITTED + clip-row FOR UPDATE (via _clip_moderation_lock_brand).
-- Idempotent: a second override on an already-overridden clip is a no-op success.

-- ---------------------------------------------------------------------------
-- 1. Invariant CHECK constraints (defense in depth)
-- ---------------------------------------------------------------------------
ALTER TABLE public.clips
    DROP CONSTRAINT IF EXISTS clips_fraud_flag_xor_override;
ALTER TABLE public.clips
    ADD CONSTRAINT clips_fraud_flag_xor_override
        CHECK (NOT (fraud_flagged = true AND fraud_overridden = true))
        NOT VALID;

ALTER TABLE public.clips
    DROP CONSTRAINT IF EXISTS clips_terminal_not_quality_approved;
ALTER TABLE public.clips
    ADD CONSTRAINT clips_terminal_not_quality_approved
        CHECK (status NOT IN ('rejected', 'disqualified')
               OR quality_status <> 'approved')
        NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. override_clip_fraud — atomic, owner-only, idempotent. Clears the soft
--    fraud flag and marks the clip overridden so the worker stops soft-score
--    flagging/disqualifying it. A HARD velocity-cap breach still disqualifies
--    (see worker/fraud.ts). Does NOT change clip status (keeps it tracking/earning).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.override_clip_fraud(
    p_clip_id uuid,
    p_trace_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clip public.clips%ROWTYPE;
    v_camp public.campaigns%ROWTYPE;
    v_now  timestamptz := now();
BEGIN
    SELECT m.clip_row, m.campaign_row
        INTO v_clip, v_camp
        FROM public._clip_moderation_lock_brand(p_clip_id) AS m;

    -- Idempotent: already overridden → no-op success.
    IF v_clip.fraud_overridden THEN
        RETURN jsonb_build_object(
            'ok', true, 'idempotent', true,
            'clip_id', p_clip_id, 'status', v_clip.status
        );
    END IF;

    -- Terminal clips cannot be vouched back into earning.
    IF v_clip.status IN ('rejected', 'disqualified') THEN
        RAISE EXCEPTION 'clip_terminal'
            USING ERRCODE = 'check_violation',
                  MESSAGE = format('Cannot override a clip in %s state.', v_clip.status);
    END IF;

    PERFORM set_config('aether.clip_moderation', 'true', true);

    UPDATE public.clips
        SET fraud_overridden = true,
            fraud_flagged = false,
            updated_at = v_now
        WHERE id = p_clip_id;

    RAISE LOG 'clip.fraud_overridden clip=% campaign=% brand=% trace=%',
        p_clip_id, v_camp.id, auth.uid(), COALESCE(p_trace_id, '-');

    RETURN jsonb_build_object(
        'ok', true, 'idempotent', false,
        'clip_id', p_clip_id, 'status', v_clip.status,
        'reviewed_at', v_now, 'reviewed_by', auth.uid()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.override_clip_fraud(uuid, text) TO authenticated;
