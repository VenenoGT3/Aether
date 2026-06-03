-- Aether Migration: quality-control invariant audit + feedback guarantee.
--
-- The approve/reject/request_changes RPCs (20260603050000) already make every
-- quality transition atomic, locked, and idempotent, and record_clip_earning +
-- the worker view-sync gate on quality_status='approved'. Two gaps remain:
--
--   1. The core invariant `status='tracking' <=> quality_status='approved'` is
--      enforced only by NOT VALID CHECKs — they reject NEW bad writes but never
--      surfaced PRE-EXISTING / legacy violations, and there is no tripwire if a
--      constraint is ever dropped or a service-role path regresses. A tracking
--      clip that is NOT quality-approved is precisely "earning-eligible without
--      approval" — the invariant breach the directive calls out.
--   2. "Lost feedback": nothing guarantees a changes_requested clip carries the
--      brand's notes. request_changes_clip requires a >=3 char reason, but a
--      direct/legacy write could leave quality_notes NULL, stranding the creator.
--
-- This migration adds (a) a feedback CHECK, (b) a PARTIAL INDEX whose predicate
-- IS the invariant violation (so it is normally EMPTY and detection is O(violations),
-- not O(clips)), and (c) an audit RPC that [ALERT]s per offending clip.
--
-- CONCURRENCY: read-only audit on a committed snapshot; every quality mutation is
-- atomic (RPC clip FOR UPDATE), so any reported violation is a real breach, not an
-- in-flight artifact. Backward compatible (new CHECK is NOT VALID).

-- ---------------------------------------------------------------------------
-- 1. Feedback guarantee: changes_requested must carry brand notes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clips
    DROP CONSTRAINT IF EXISTS clips_changes_requested_has_notes;
ALTER TABLE public.clips
    ADD CONSTRAINT clips_changes_requested_has_notes
        CHECK (
            quality_status <> 'changes_requested'
            OR (quality_notes IS NOT NULL AND length(btrim(quality_notes)) >= 3)
        )
        NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Partial index = the invariant-violation set (normally EMPTY).
--    Violation := exactly one of (status='tracking') / (quality_status='approved')
--    is true. Detection scans only the (tiny) violating set.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clips_quality_invariant_violation
    ON public.clips (updated_at DESC)
    WHERE (status = 'tracking') <> (quality_status = 'approved');

-- ---------------------------------------------------------------------------
-- 3. audit_clip_quality_invariants: returns only violating clips + [ALERT].
--    Bounded by p_limit (most-recently-updated first); the partial index makes
--    a clean system a near-instant empty scan. Service-role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_clip_quality_invariants(
    p_trace_id text DEFAULT NULL,
    p_limit int DEFAULT 1000
)
RETURNS TABLE(
    clip_id        uuid,
    clip_status    text,
    quality_status text,
    issue          text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r       record;
    v_count int := 0;
BEGIN
    FOR r IN
        SELECT c.id AS cid, c.status AS st, c.quality_status AS qs
        FROM public.clips c
        WHERE (c.status = 'tracking') <> (c.quality_status = 'approved')
        ORDER BY c.updated_at DESC
        LIMIT GREATEST(p_limit, 1)
    LOOP
        v_count := v_count + 1;
        clip_id        := r.cid;
        clip_status    := r.st;
        quality_status := r.qs;
        issue := CASE
            WHEN r.st = 'tracking' THEN 'tracking_without_quality_approval'
            ELSE 'quality_approved_not_tracking'
        END;

        RAISE WARNING '[ALERT] clip.quality_invariant clip=% status=% quality=% issue=% trace=%',
            r.cid, r.st, r.qs, issue, COALESCE(p_trace_id, '-');
        RETURN NEXT;
    END LOOP;

    IF v_count = 0 THEN
        RAISE LOG 'clip.quality_invariant.none trace=%', COALESCE(p_trace_id, '-');
    ELSE
        RAISE WARNING '[ALERT] clip.quality_invariant.summary violations=% trace=%',
            v_count, COALESCE(p_trace_id, '-');
    END IF;
END;
$$;

COMMENT ON FUNCTION public.audit_clip_quality_invariants(text, int) IS
    'Detects clips violating the tracking<=>quality_approved invariant (earning-eligible without approval, or approved-but-not-tracking). Raises [ALERT]. Service-role only.';

REVOKE ALL ON FUNCTION public.audit_clip_quality_invariants(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_clip_quality_invariants(text, int) TO service_role;
