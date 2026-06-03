-- Aether Migration: fraud forensics alerting — reversal integrity + event stats.
--
-- 20260603130000 added the clip_fraud_events ledger, fraud_repeat_offenders(),
-- and the per-sync indexes. This final layer adds the DETECTORS that turn that
-- data into alarms and closes the last integrity gap:
--
--   1. REVERSAL INTEGRITY. When a clip is disqualified/rejected, the
--      reverse_earnings_on_clip_block trigger reverses its 'accrued' earnings and
--      releases the reserved budget — atomically, in the same statement. If that
--      ever fails (trigger disabled, a future code path, a partial restore), a
--      terminal clip would keep 'accrued' earnings counted in budget_reserved —
--      money reserved for fraud. audit_disqualified_clip_earnings() detects it.
--
--   2. EVENT STATS. fraud_event_stats() exposes windowed counts so the worker can
--      [ALERT] on a disqualification-rate SPIKE (provider returning bad data or a
--      misconfigured threshold mass-disqualifying real creators — a scoring anomaly).
--
-- Read-only/observability + a partial index. Backward compatible.

-- ---------------------------------------------------------------------------
-- 1. Partial index over un-reversed accrued earnings (drives the reversal audit;
--    normally the audit's join is tiny since accrued rows are short-lived).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_earnings_accrued_clip
    ON public.earnings (clip_id)
    WHERE status = 'accrued';

-- ---------------------------------------------------------------------------
-- 2. Reversal-integrity audit: terminal clips that still carry accrued earnings.
--    Each such row is money reserved against a disqualified/rejected clip — a
--    reversal failure. Returns offenders + raises [ALERT]. Service-role only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_disqualified_clip_earnings(
    p_trace_id text DEFAULT NULL,
    p_limit int DEFAULT 1000
)
RETURNS TABLE(
    clip_id       uuid,
    clip_status   text,
    accrued_count bigint,
    accrued_total numeric
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
        SELECT c.id AS cid,
               c.status AS st,
               count(e.id) AS n,
               COALESCE(sum(e.amount), 0) AS total
        FROM public.clips c
        JOIN public.earnings e
          ON e.clip_id = c.id AND e.status = 'accrued'
        WHERE c.status IN ('disqualified', 'rejected')
        GROUP BY c.id, c.status
        ORDER BY total DESC
        LIMIT GREATEST(p_limit, 1)
    LOOP
        v_count := v_count + 1;
        clip_id       := r.cid;
        clip_status   := r.st;
        accrued_count := r.n;
        accrued_total := r.total;

        RAISE WARNING '[ALERT] fraud.reversal_failure clip=% status=% accrued_rows=% accrued_total=% trace=%',
            r.cid, r.st, r.n, r.total, COALESCE(p_trace_id, '-');
        RETURN NEXT;
    END LOOP;

    IF v_count = 0 THEN
        RAISE LOG 'fraud.reversal_audit.none trace=%', COALESCE(p_trace_id, '-');
    ELSE
        RAISE WARNING '[ALERT] fraud.reversal_audit.summary offenders=% trace=%',
            v_count, COALESCE(p_trace_id, '-');
    END IF;
END;
$$;

COMMENT ON FUNCTION public.audit_disqualified_clip_earnings(text, int) IS
    'Detects disqualified/rejected clips that still carry accrued (un-reversed) earnings — a reversal-integrity breach. Raises [ALERT]. Service-role only.';

-- ---------------------------------------------------------------------------
-- 3. Windowed fraud event stats (drives the worker disqualify-rate anomaly alert).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fraud_event_stats(
    p_since interval DEFAULT interval '1 hour'
)
RETURNS TABLE(
    total_events     bigint,
    disqualified     bigint,
    flagged          bigint,
    distinct_creators bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT count(*)                                          AS total_events,
           count(*) FILTER (WHERE action = 'disqualified')   AS disqualified,
           count(*) FILTER (WHERE action = 'flagged')        AS flagged,
           count(DISTINCT creator_id)                        AS distinct_creators
    FROM public.clip_fraud_events
    WHERE created_at >= now() - p_since;
$$;

REVOKE ALL ON FUNCTION public.audit_disqualified_clip_earnings(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_disqualified_clip_earnings(text, int) TO service_role;
REVOKE ALL ON FUNCTION public.fraud_event_stats(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fraud_event_stats(interval) TO service_role;
