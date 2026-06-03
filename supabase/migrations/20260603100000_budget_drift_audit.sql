-- Aether Migration: budget rollup drift audit (ledger vs. denormalized columns).
--
-- The prior budget-threshold work (20260603030000 / 060000) makes the 90% gate
-- and 100% close race-free and idempotent, and guarantees that — for CORRECT
-- code — campaigns.budget_reserved / budget_paid always match the earnings
-- ledger at any committed snapshot (record_clip_earning, mark_payout_paid, and
-- reverse_earnings_on_clip_block each move the ledger row + the rollup in ONE
-- transaction). What was missing is a DETECTOR: if any future code path, manual
-- SQL fix, or partial failure ever diverges the denormalized rollups from the
-- source-of-truth ledger, every threshold decision (90%/100%) silently uses a
-- wrong pool. This migration adds an authoritative drift audit + [ALERT].
--
-- INVARIANTS AUDITED (per performance campaign)
--   budget_reserved == SUM(earnings.amount) WHERE status IN ('accrued','approved')
--   budget_paid     == SUM(earnings.amount) WHERE status = 'paid'
--   ('reversed' earnings are excluded — the reversal trigger already decremented
--    budget_reserved when it set them 'reversed'.)
--
-- These hold on any READ COMMITTED snapshot because every mutation is atomic, so
-- a non-zero drift is, by construction, a real integrity bug — not an in-flight
-- transaction artifact.

-- ---------------------------------------------------------------------------
-- 1. Cleanup: drop the orphaned pre-060000 submission-gate function. The active
--    gate is enforce_clip_submission_gates (trigger trg_clips_submission_gates);
--    enforce_clip_submission_budget_gate has had no trigger since 20260603040000.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.enforce_clip_submission_budget_gate() CASCADE;

-- ---------------------------------------------------------------------------
-- 2. Index for per-campaign, per-status ledger sums (drift audit hot path).
--    INCLUDE (amount) enables an index-only scan for the FILTERed SUMs.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_earnings_campaign_status_amount
    ON public.earnings (campaign_id, status) INCLUDE (amount);

-- ---------------------------------------------------------------------------
-- 3. audit_campaign_budget_drift: returns only DRIFTED campaigns + [ALERT]s.
--    Bounded by p_limit (most-recently-updated first) so a heartbeat call is
--    cheap even with a large campaign population.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_campaign_budget_drift(
    p_trace_id text DEFAULT NULL,
    p_limit int DEFAULT 1000
)
RETURNS TABLE(
    campaign_id        uuid,
    expected_reserved  numeric,
    actual_reserved    numeric,
    expected_paid      numeric,
    actual_paid        numeric
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
               COALESCE(agg.reserved, 0)  AS exp_reserved,
               COALESCE(c.budget_reserved, 0) AS act_reserved,
               COALESCE(agg.paid, 0)      AS exp_paid,
               COALESCE(c.budget_paid, 0) AS act_paid
        FROM public.campaigns c
        LEFT JOIN LATERAL (
            SELECT
                SUM(e.amount) FILTER (WHERE e.status IN ('accrued', 'approved')) AS reserved,
                SUM(e.amount) FILTER (WHERE e.status = 'paid')                   AS paid
            FROM public.earnings e
            WHERE e.campaign_id = c.id
        ) agg ON true
        WHERE c.campaign_type = 'performance'
          AND c.status IN ('open', 'in_progress', 'exhausted')
        ORDER BY c.updated_at DESC
        LIMIT GREATEST(p_limit, 1)
    LOOP
        IF abs(r.exp_reserved - r.act_reserved) > 0.01
           OR abs(r.exp_paid - r.act_paid) > 0.01 THEN
            v_count := v_count + 1;
            RAISE WARNING '[ALERT] budget.drift campaign=% exp_reserved=% act_reserved=% exp_paid=% act_paid=% trace=%',
                r.cid, r.exp_reserved, r.act_reserved, r.exp_paid, r.act_paid,
                COALESCE(p_trace_id, '-');

            campaign_id       := r.cid;
            expected_reserved := r.exp_reserved;
            actual_reserved   := r.act_reserved;
            expected_paid     := r.exp_paid;
            actual_paid       := r.act_paid;
            RETURN NEXT;
        END IF;
    END LOOP;

    IF v_count = 0 THEN
        RAISE LOG 'budget.drift.none trace=%', COALESCE(p_trace_id, '-');
    ELSE
        RAISE WARNING '[ALERT] budget.drift.summary drifted=% trace=%',
            v_count, COALESCE(p_trace_id, '-');
    END IF;
END;
$$;

COMMENT ON FUNCTION public.audit_campaign_budget_drift(text, int) IS
    'Detects divergence between campaigns.budget_reserved/paid and the earnings ledger. Returns drifted campaigns and raises [ALERT]. Service-role only.';

REVOKE ALL ON FUNCTION public.audit_campaign_budget_drift(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_campaign_budget_drift(text, int) TO service_role;
