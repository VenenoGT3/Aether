-- Aether Migration: Performance-Based Clipping — Phase 5
-- Automated payouts + earnings reversal.
--
-- All money mutations are atomic SECURITY DEFINER functions (called by the
-- service-role worker) or a trigger, so correctness/idempotency is enforced in
-- the database rather than in racey application code. Additive — the fixed-fee
-- flow is untouched.

-- ===========================================================================
-- 1. Promote due earnings: 'accrued' -> 'approved' once past the campaign's
--    view_holdback_hours. Per-campaign holdback (env value is a fallback only).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.promote_due_earnings(
    p_default_holdback_hours int DEFAULT 48
)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    WITH due AS (
        UPDATE public.earnings e
        SET status = 'approved'
        FROM public.campaigns c
        WHERE e.campaign_id = c.id
          AND e.status = 'accrued'
          AND e.accrued_at <
              now() - (COALESCE(c.view_holdback_hours, p_default_holdback_hours)
                       || ' hours')::interval
        RETURNING e.id
    )
    SELECT count(*) INTO v_count FROM due;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ===========================================================================
-- 2. Claim a creator's approved earnings into a single payout.
--    Atomic: an advisory lock serializes per-creator, and claimed earnings get
--    payout_id set so a re-run can never re-batch them (no double-pay).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.create_payout_for_creator(
    p_creator_id uuid,
    p_min_threshold numeric
)
RETURNS TABLE(out_payout_id uuid, out_amount numeric) AS $$
DECLARE
    v_total numeric;
    v_payout_id uuid;
BEGIN
    -- Serialize concurrent payout runs for the same creator.
    PERFORM pg_advisory_xact_lock(hashtext(p_creator_id::text)::bigint);

    SELECT COALESCE(SUM(e.amount), 0) INTO v_total
        FROM public.earnings e
        WHERE e.creator_id = p_creator_id
          AND e.status = 'approved'
          AND e.payout_id IS NULL;

    IF v_total <= 0 OR v_total < p_min_threshold THEN
        RETURN; -- nothing payable yet
    END IF;

    INSERT INTO public.payouts (creator_id, amount, status, idempotency_key)
    VALUES (p_creator_id, v_total, 'processing', gen_random_uuid()::text)
    RETURNING id INTO v_payout_id;

    -- Claim the earnings against this payout.
    UPDATE public.earnings
        SET payout_id = v_payout_id
        WHERE creator_id = p_creator_id
          AND status = 'approved'
          AND payout_id IS NULL;

    out_payout_id := v_payout_id;
    out_amount := v_total;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ===========================================================================
-- 3. Settle a successful payout (idempotent): mark earnings 'paid', move
--    reserved -> paid per campaign, bump participation.total_paid, audit txn.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.mark_payout_paid(
    p_payout_id uuid,
    p_transfer_id text
)
RETURNS void AS $$
DECLARE
    v_payout public.payouts%ROWTYPE;
BEGIN
    SELECT * INTO v_payout FROM public.payouts WHERE id = p_payout_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'payout % not found', p_payout_id;
    END IF;
    IF v_payout.status = 'paid' THEN
        RETURN; -- already settled (idempotent)
    END IF;

    -- Move reserved -> paid per campaign.
    UPDATE public.campaigns c
        SET budget_reserved = GREATEST(c.budget_reserved - agg.total, 0),
            budget_paid = c.budget_paid + agg.total
        FROM (
            SELECT campaign_id, SUM(amount) AS total
            FROM public.earnings
            WHERE payout_id = p_payout_id AND status = 'approved'
            GROUP BY campaign_id
        ) agg
        WHERE c.id = agg.campaign_id;

    -- Bump per-participation paid totals.
    UPDATE public.participations p
        SET total_paid = p.total_paid + agg.total
        FROM (
            SELECT participation_id, SUM(amount) AS total
            FROM public.earnings
            WHERE payout_id = p_payout_id AND status = 'approved'
            GROUP BY participation_id
        ) agg
        WHERE p.id = agg.participation_id;

    UPDATE public.earnings SET status = 'paid'
        WHERE payout_id = p_payout_id AND status = 'approved';

    UPDATE public.payouts
        SET status = 'paid', stripe_transfer_id = p_transfer_id
        WHERE id = p_payout_id;

    -- Audit ledger entry for the transfer.
    INSERT INTO public.transactions (
        user_id, amount, type, status, stripe_payment_intent_id, payout_id
    ) VALUES (
        v_payout.creator_id, v_payout.amount, 'payout', 'succeeded',
        p_transfer_id, p_payout_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ===========================================================================
-- 4. Mark a payout failed and RELEASE its claimed earnings so the next run can
--    retry them in a fresh payout.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.mark_payout_failed(p_payout_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.earnings SET payout_id = NULL
        WHERE payout_id = p_payout_id AND status = 'approved';
    UPDATE public.payouts SET status = 'failed' WHERE id = p_payout_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ===========================================================================
-- 5. Earnings reversal trigger: when a clip becomes 'rejected'/'disqualified',
--    reverse its UNPAID ('accrued') earnings and release the reserved budget.
--    Fires for both brand rejects and worker auto-disqualifies. Idempotent
--    (only 'accrued' rows are reversed; 'approved'/'paid' are left intact).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.reverse_earnings_on_clip_block()
RETURNS trigger AS $$
DECLARE
    v_sum numeric;
BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_sum
        FROM public.earnings
        WHERE clip_id = NEW.id AND status = 'accrued';

    IF v_sum > 0 THEN
        UPDATE public.earnings SET status = 'reversed'
            WHERE clip_id = NEW.id AND status = 'accrued';

        UPDATE public.campaigns
            SET budget_reserved = GREATEST(budget_reserved - v_sum, 0)
            WHERE id = NEW.campaign_id;

        UPDATE public.participations
            SET total_earned = GREATEST(total_earned - v_sum, 0)
            WHERE id = NEW.participation_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS reverse_earnings_on_block ON public.clips;
CREATE TRIGGER reverse_earnings_on_block
    AFTER UPDATE OF status ON public.clips
    FOR EACH ROW
    WHEN (
        NEW.status IN ('rejected', 'disqualified')
        AND OLD.status IS DISTINCT FROM NEW.status
    )
    EXECUTE FUNCTION public.reverse_earnings_on_clip_block();

-- ===========================================================================
-- 6. Index to speed up claim queries (creator's unclaimed approved earnings).
-- ===========================================================================
CREATE INDEX IF NOT EXISTS idx_earnings_payout_claim
    ON public.earnings(creator_id, status)
    WHERE payout_id IS NULL;
