-- Aether Migration: Harden per-video approval flow + trusted creator bypass.
--
-- Adds atomic SECURITY DEFINER RPCs (approve / reject / request_changes / disqualify),
-- SKIP LOCKED deadline sweeps, insert/update defense-in-depth, and earnings invariant
-- alerts. Uses session flag aether.clip_moderation for brand moderation writes.

-- ---------------------------------------------------------------------------
-- 1. Invariant constraints (NOT VALID for legacy rows)
-- ---------------------------------------------------------------------------
ALTER TABLE public.clips
    DROP CONSTRAINT IF EXISTS clips_tracking_requires_quality_approved;
ALTER TABLE public.clips
    ADD CONSTRAINT clips_tracking_requires_quality_approved
        CHECK (status <> 'tracking' OR quality_status = 'approved')
        NOT VALID;

ALTER TABLE public.clips
    DROP CONSTRAINT IF EXISTS clips_trusted_auto_approved;
ALTER TABLE public.clips
    ADD CONSTRAINT clips_trusted_auto_approved
        CHECK (
            auto_approved = false
            OR (status = 'tracking' AND quality_status = 'approved')
        )
        NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Indexes — moderation queue + deadline sweeps
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clips_auto_approve_due
    ON public.clips (approval_deadline ASC)
    WHERE status = 'pending'
      AND quality_status = 'pending_review';

CREATE INDEX IF NOT EXISTS idx_clips_moderation_pending
    ON public.clips (created_at DESC)
    WHERE status = 'pending'
      AND quality_status = 'pending_review';

-- ---------------------------------------------------------------------------
-- 3. Insert trigger — trusted bypass server-side only (ignore client status)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_clip_approval_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_trusted boolean;
BEGIN
    IF NEW.submitted_at IS NULL THEN
        NEW.submitted_at := now();
    END IF;
    NEW.approval_deadline := public.add_business_days(NEW.submitted_at, 5);

    SELECT COALESCE(p.trusted_creator, false) INTO v_trusted
        FROM public.profiles p
        WHERE p.user_id = NEW.creator_id;

    IF v_trusted THEN
        NEW.status := 'tracking';
        NEW.quality_status := 'approved';
        NEW.approved_at := now();
        NEW.auto_approved := true;
        NEW.rejected_at := NULL;
    ELSE
        NEW.status := 'pending';
        NEW.quality_status := 'pending_review';
        NEW.approved_at := NULL;
        NEW.rejected_at := NULL;
        NEW.auto_approved := false;
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Brand UPDATE guard — only moderation RPC may touch approval/quality fields
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_clip_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF current_setting('aether.clip_moderation', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
        OR NEW.participation_id IS DISTINCT FROM OLD.participation_id
        OR NEW.creator_id IS DISTINCT FROM OLD.creator_id
        OR NEW.platform IS DISTINCT FROM OLD.platform
        OR NEW.post_url IS DISTINCT FROM OLD.post_url
        OR NEW.external_post_id IS DISTINCT FROM OLD.external_post_id
        OR NEW.counted_views IS DISTINCT FROM OLD.counted_views
        OR NEW.current_views IS DISTINCT FROM OLD.current_views
        OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
        OR NEW.approval_deadline IS DISTINCT FROM OLD.approval_deadline
        OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
        OR NEW.rejected_at IS DISTINCT FROM OLD.rejected_at
        OR NEW.auto_approved IS DISTINCT FROM OLD.auto_approved
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.quality_status IS DISTINCT FROM OLD.quality_status
        OR NEW.quality_reviewed_at IS DISTINCT FROM OLD.quality_reviewed_at
        OR NEW.quality_reviewed_by IS DISTINCT FROM OLD.quality_reviewed_by
        OR NEW.quality_notes IS DISTINCT FROM OLD.quality_notes
        OR NEW.quality_score IS DISTINCT FROM OLD.quality_score
        OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
        OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
        OR NEW.review_note IS DISTINCT FROM OLD.review_note
        OR NEW.last_synced_at IS DISTINCT FROM OLD.last_synced_at
        OR NEW.fraud_score IS DISTINCT FROM OLD.fraud_score
        OR NEW.fraud_flagged IS DISTINCT FROM OLD.fraud_flagged
        OR NEW.fraud_reasons IS DISTINCT FROM OLD.fraud_reasons
        OR NEW.fraud_overridden IS DISTINCT FROM OLD.fraud_overridden
    THEN
        RAISE EXCEPTION 'clip_update_forbidden'
            USING ERRCODE = '42501',
                  MESSAGE = 'Use the moderation API to approve, reject, or request changes on clips.';
    END IF;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Shared moderation helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._clip_moderation_lock_brand(p_clip_id uuid)
RETURNS TABLE (clip_row public.clips, campaign_row public.campaigns)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_brand uuid := auth.uid();
    v_clip  public.clips%ROWTYPE;
    v_camp  public.campaigns%ROWTYPE;
BEGIN
    IF v_brand IS NULL THEN
        RAISE EXCEPTION 'not_authenticated'
            USING ERRCODE = '28000',
                  MESSAGE = 'Authentication required.';
    END IF;

    SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'clip_not_found'
            USING ERRCODE = 'P0002',
                  MESSAGE = 'Clip not found.';
    END IF;

    SELECT * INTO v_camp FROM public.campaigns WHERE id = v_clip.campaign_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'campaign_not_found'
            USING ERRCODE = 'P0002',
                  MESSAGE = 'Campaign not found.';
    END IF;

    IF v_camp.business_id IS DISTINCT FROM v_brand THEN
        RAISE WARNING '[ALERT] clip.moderation.forbidden clip=% brand=% owner=%',
            p_clip_id, v_brand, v_camp.business_id;
        RAISE EXCEPTION 'forbidden'
            USING ERRCODE = '42501',
                  MESSAGE = 'You can only moderate clips on your own campaigns.';
    END IF;

    clip_row := v_clip;
    campaign_row := v_camp;
    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public._clip_has_paid_earnings(p_clip_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.earnings e
        WHERE e.clip_id = p_clip_id AND e.status = 'paid'
    );
$$;

-- ---------------------------------------------------------------------------
-- 6. approve_clip — idempotent, locked, brand-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_clip(
    p_clip_id uuid,
    p_quality_score int DEFAULT NULL,
    p_trace_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clip   public.clips%ROWTYPE;
    v_camp   public.campaigns%ROWTYPE;
    v_locked record;
    v_now    timestamptz := now();
BEGIN
    SELECT m.clip_row, m.campaign_row
        INTO v_locked
        FROM public._clip_moderation_lock_brand(p_clip_id) AS m;
    v_clip := v_locked.clip_row;
    v_camp := v_locked.campaign_row;

    IF v_clip.status = 'disqualified' THEN
        RAISE EXCEPTION 'clip_terminal'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This clip is disqualified and can no longer be moderated.';
    END IF;

    IF public._clip_has_paid_earnings(p_clip_id) THEN
        RAISE EXCEPTION 'clip_has_paid_earnings'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This clip already has paid earnings and cannot be moderated.';
    END IF;

    IF v_clip.status = 'tracking' AND v_clip.quality_status = 'approved' THEN
        RETURN jsonb_build_object(
            'ok', true, 'idempotent', true,
            'clip_id', p_clip_id, 'status', v_clip.status,
            'reviewed_at', v_clip.reviewed_at
        );
    END IF;

    IF v_clip.status NOT IN ('pending', 'rejected') THEN
        RAISE EXCEPTION 'invalid_transition'
            USING ERRCODE = 'check_violation',
                  MESSAGE = format('Cannot approve a clip in %s state.', v_clip.status);
    END IF;

    IF p_quality_score IS NOT NULL
        AND (p_quality_score < 1 OR p_quality_score > 10) THEN
        RAISE EXCEPTION 'invalid_quality_score'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'Quality score must be between 1 and 10.';
    END IF;

    PERFORM set_config('aether.clip_moderation', 'true', true);

    UPDATE public.clips
        SET status = 'tracking',
            quality_status = 'approved',
            approved_at = v_now,
            rejected_at = NULL,
            auto_approved = false,
            reviewed_at = v_now,
            reviewed_by = auth.uid(),
            review_note = NULL,
            quality_reviewed_at = v_now,
            quality_reviewed_by = auth.uid(),
            quality_notes = NULL,
            quality_score = p_quality_score,
            updated_at = v_now
        WHERE id = p_clip_id
          AND status IN ('pending', 'rejected');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'approve_race'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'Clip state changed during approval. Please refresh and retry.';
    END IF;

    RAISE LOG 'clip.approved clip=% campaign=% trace=%',
        p_clip_id, v_camp.id, COALESCE(p_trace_id, '-');

    RETURN jsonb_build_object(
        'ok', true, 'idempotent', false,
        'clip_id', p_clip_id, 'status', 'tracking',
        'reviewed_at', v_now, 'reviewed_by', auth.uid()
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. reject_clip
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_clip(
    p_clip_id uuid,
    p_reason text DEFAULT NULL,
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
    v_locked record;
    v_now  timestamptz := now();
BEGIN
    SELECT m.clip_row, m.campaign_row
        INTO v_locked
        FROM public._clip_moderation_lock_brand(p_clip_id) AS m;
    v_clip := v_locked.clip_row;
    v_camp := v_locked.campaign_row;

    IF v_clip.status = 'disqualified' THEN
        RAISE EXCEPTION 'clip_terminal'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This clip is disqualified and can no longer be moderated.';
    END IF;

    IF public._clip_has_paid_earnings(p_clip_id) THEN
        RAISE EXCEPTION 'clip_has_paid_earnings'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This clip already has paid earnings and cannot be moderated.';
    END IF;

    IF v_clip.status = 'rejected' AND v_clip.quality_status = 'rejected' THEN
        RETURN jsonb_build_object(
            'ok', true, 'idempotent', true,
            'clip_id', p_clip_id, 'status', 'rejected',
            'reviewed_at', v_clip.reviewed_at
        );
    END IF;

    IF v_clip.status NOT IN ('pending', 'approved', 'tracking') THEN
        RAISE EXCEPTION 'invalid_transition'
            USING ERRCODE = 'check_violation',
                  MESSAGE = format('Cannot reject a clip in %s state.', v_clip.status);
    END IF;

    PERFORM set_config('aether.clip_moderation', 'true', true);

    UPDATE public.clips
        SET status = 'rejected',
            quality_status = 'rejected',
            rejected_at = v_now,
            approved_at = NULL,
            auto_approved = false,
            reviewed_at = v_now,
            reviewed_by = auth.uid(),
            review_note = NULLIF(trim(COALESCE(p_reason, '')), ''),
            quality_reviewed_at = v_now,
            quality_reviewed_by = auth.uid(),
            quality_notes = NULLIF(trim(COALESCE(p_reason, '')), ''),
            updated_at = v_now
        WHERE id = p_clip_id
          AND status IN ('pending', 'approved', 'tracking');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'reject_race'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'Clip state changed during rejection. Please refresh and retry.';
    END IF;

    RAISE LOG 'clip.rejected clip=% campaign=% trace=%',
        p_clip_id, v_camp.id, COALESCE(p_trace_id, '-');

    RETURN jsonb_build_object(
        'ok', true, 'idempotent', false,
        'clip_id', p_clip_id, 'status', 'rejected',
        'reviewed_at', v_now, 'reviewed_by', auth.uid()
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. request_changes_clip
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_changes_clip(
    p_clip_id uuid,
    p_reason text,
    p_quality_score int DEFAULT NULL,
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
    v_locked record;
    v_now  timestamptz := now();
    v_note text;
BEGIN
    v_note := NULLIF(trim(COALESCE(p_reason, '')), '');
    IF v_note IS NULL OR length(v_note) < 3 THEN
        RAISE EXCEPTION 'reason_required'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'Tell the creator what to change (at least 3 characters).';
    END IF;

    SELECT m.clip_row, m.campaign_row
        INTO v_locked
        FROM public._clip_moderation_lock_brand(p_clip_id) AS m;
    v_clip := v_locked.clip_row;
    v_camp := v_locked.campaign_row;

    IF v_clip.status <> 'pending' THEN
        RAISE EXCEPTION 'invalid_transition'
            USING ERRCODE = 'check_violation',
                  MESSAGE = format('Cannot request changes on a clip in %s state.', v_clip.status);
    END IF;

    IF v_clip.quality_status = 'changes_requested'
        AND v_clip.quality_notes IS NOT DISTINCT FROM v_note THEN
        RETURN jsonb_build_object(
            'ok', true, 'idempotent', true,
            'clip_id', p_clip_id, 'status', 'pending',
            'reviewed_at', v_clip.quality_reviewed_at
        );
    END IF;

    IF p_quality_score IS NOT NULL
        AND (p_quality_score < 1 OR p_quality_score > 10) THEN
        RAISE EXCEPTION 'invalid_quality_score'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'Quality score must be between 1 and 10.';
    END IF;

    PERFORM set_config('aether.clip_moderation', 'true', true);

    UPDATE public.clips
        SET status = 'pending',
            quality_status = 'changes_requested',
            auto_approved = false,
            approved_at = NULL,
            reviewed_at = v_now,
            reviewed_by = auth.uid(),
            review_note = v_note,
            quality_reviewed_at = v_now,
            quality_reviewed_by = auth.uid(),
            quality_notes = v_note,
            quality_score = p_quality_score,
            updated_at = v_now
        WHERE id = p_clip_id
          AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'changes_race'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'Clip state changed. Please refresh and retry.';
    END IF;

    RAISE LOG 'clip.changes_requested clip=% campaign=% trace=%',
        p_clip_id, v_camp.id, COALESCE(p_trace_id, '-');

    RETURN jsonb_build_object(
        'ok', true, 'idempotent', false,
        'clip_id', p_clip_id, 'status', 'pending',
        'reviewed_at', v_now, 'reviewed_by', auth.uid()
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. disqualify_clip (fraud / policy removal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disqualify_clip(
    p_clip_id uuid,
    p_reason text DEFAULT NULL,
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
    v_locked record;
    v_now  timestamptz := now();
BEGIN
    SELECT m.clip_row, m.campaign_row
        INTO v_locked
        FROM public._clip_moderation_lock_brand(p_clip_id) AS m;
    v_clip := v_locked.clip_row;
    v_camp := v_locked.campaign_row;

    IF v_clip.status = 'disqualified' THEN
        RETURN jsonb_build_object(
            'ok', true, 'idempotent', true,
            'clip_id', p_clip_id, 'status', 'disqualified',
            'reviewed_at', v_clip.reviewed_at
        );
    END IF;

    IF public._clip_has_paid_earnings(p_clip_id) THEN
        RAISE WARNING '[ALERT] clip.disqualify.paid_earnings clip=% trace=%',
            p_clip_id, COALESCE(p_trace_id, '-');
        RAISE EXCEPTION 'clip_has_paid_earnings'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'This clip already has paid earnings and cannot be disqualified.';
    END IF;

    IF v_clip.status NOT IN ('pending', 'approved', 'tracking') THEN
        RAISE EXCEPTION 'invalid_transition'
            USING ERRCODE = 'check_violation',
                  MESSAGE = format('Cannot disqualify a clip in %s state.', v_clip.status);
    END IF;

    PERFORM set_config('aether.clip_moderation', 'true', true);

    UPDATE public.clips
        SET status = 'disqualified',
            quality_status = 'rejected',
            rejected_at = v_now,
            auto_approved = false,
            reviewed_at = v_now,
            reviewed_by = auth.uid(),
            review_note = NULLIF(trim(COALESCE(p_reason, '')), ''),
            quality_reviewed_at = v_now,
            quality_reviewed_by = auth.uid(),
            quality_notes = NULLIF(trim(COALESCE(p_reason, '')), ''),
            updated_at = v_now
        WHERE id = p_clip_id
          AND status IN ('pending', 'approved', 'tracking');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'disqualify_race'
            USING ERRCODE = 'check_violation',
                  MESSAGE = 'Clip state changed during disqualification.';
    END IF;

    RAISE WARNING '[ALERT] clip.disqualified clip=% campaign=% trace=%',
        p_clip_id, v_camp.id, COALESCE(p_trace_id, '-');

    RETURN jsonb_build_object(
        'ok', true, 'idempotent', false,
        'clip_id', p_clip_id, 'status', 'disqualified',
        'reviewed_at', v_now, 'reviewed_by', auth.uid()
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. auto_approve_overdue_clips — SKIP LOCKED sweep (deadline race-safe)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_approve_overdue_clips(
    p_trace_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
BEGIN
    PERFORM set_config('aether.clip_moderation', 'true', true);

    WITH candidates AS (
        SELECT c.id
        FROM public.clips c
        INNER JOIN public.campaigns ca ON ca.id = c.campaign_id
        WHERE c.status = 'pending'
          AND c.quality_status = 'pending_review'
          AND c.approval_deadline IS NOT NULL
          AND c.approval_deadline <= now()
          AND ca.campaign_type = 'performance'
          AND ca.status IN ('open', 'in_progress')
        FOR UPDATE OF c SKIP LOCKED
    ),
    promoted AS (
        UPDATE public.clips c
        SET status = 'tracking',
            quality_status = 'approved',
            approved_at = now(),
            auto_approved = true,
            updated_at = now()
        FROM candidates
        WHERE c.id = candidates.id
          AND c.status = 'pending'
          AND c.quality_status = 'pending_review'
        RETURNING c.id
    )
    SELECT count(*)::int INTO v_count FROM promoted;

    IF v_count > 0 THEN
        RAISE LOG 'clip.auto_approved count=% trace=%', v_count, COALESCE(p_trace_id, '-');
    END IF;

    RETURN COALESCE(v_count, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. record_clip_earning — alert on tracking/quality invariant violation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_clip_earning(
    p_clip_id uuid,
    p_new_views bigint,
    p_trace_id text DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    v_clip            public.clips%ROWTYPE;
    v_camp            public.campaigns%ROWTYPE;
    v_part            public.participations%ROWTYPE;
    v_billable        bigint;
    v_eff_cpm         numeric;
    v_raw_amount      numeric;
    v_remaining_pool  numeric;
    v_remaining_cap   numeric;
    v_amount          numeric;
    v_pool            numeric;
    v_used            numeric;
    v_used_pct        numeric;
    v_remaining_after numeric;
    v_closed          boolean;
BEGIN
    SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_clip.status = 'tracking'
        AND v_clip.quality_status IS DISTINCT FROM 'approved' THEN
        RAISE WARNING '[ALERT] earnings.invariant_violation clip=% status=% quality=% trace=%',
            p_clip_id, v_clip.status, v_clip.quality_status, COALESCE(p_trace_id, '-');
        RETURN 0;
    END IF;

    IF v_clip.status <> 'tracking' THEN
        RETURN 0;
    END IF;

    IF v_clip.quality_status IS DISTINCT FROM 'approved' THEN
        RETURN 0;
    END IF;

    SELECT * INTO v_camp FROM public.campaigns WHERE id = v_clip.campaign_id FOR UPDATE;
    IF NOT FOUND OR v_camp.campaign_type <> 'performance' THEN
        RETURN 0;
    END IF;

    v_eff_cpm := COALESCE(v_camp.brand_cpm_rate, v_camp.cpm_rate);
    IF v_eff_cpm IS NULL OR v_eff_cpm <= 0 THEN
        RETURN 0;
    END IF;

    IF v_camp.status NOT IN ('open', 'in_progress') THEN
        RETURN 0;
    END IF;

    SELECT * INTO v_part FROM public.participations WHERE id = v_clip.participation_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    v_billable := GREATEST(p_new_views - v_clip.counted_views, 0);
    IF v_billable = 0 THEN
        RETURN 0;
    END IF;

    v_raw_amount := ROUND((v_billable::numeric / 1000.0) * v_eff_cpm, 2);
    v_amount     := v_raw_amount;

    IF v_camp.max_payout_per_creator IS NOT NULL THEN
        v_remaining_cap := v_camp.max_payout_per_creator - v_part.total_earned;
        v_amount := LEAST(v_amount, GREATEST(v_remaining_cap, 0));
    END IF;

    v_remaining_pool := public.campaign_budget_remaining(v_camp);
    v_pool           := public.campaign_creator_pool(v_camp);
    v_used           := COALESCE(v_camp.budget_reserved, 0) + COALESCE(v_camp.budget_paid, 0);
    v_used_pct       := CASE WHEN v_pool > 0 THEN v_used / v_pool ELSE 0 END;

    IF v_remaining_pool < 0 THEN
        RAISE WARNING '[ALERT] earnings.pool_negative campaign=% title=% remaining=% reserved=% paid=% pool=% trace=%',
            v_camp.id, COALESCE(v_camp.title, '-'), v_remaining_pool,
            v_camp.budget_reserved, v_camp.budget_paid, v_pool,
            COALESCE(p_trace_id, '-');
    END IF;

    IF v_used_pct >= 0.9 AND v_used_pct < 1.0 THEN
        RAISE LOG 'earnings.near_exhaustion clip=% campaign=% used_pct=% trace=%',
            v_clip.id, v_camp.id, round(v_used_pct::numeric, 4), COALESCE(p_trace_id, '-');
    END IF;

    v_amount := LEAST(v_amount, GREATEST(v_remaining_pool, 0));

    IF v_amount < v_raw_amount THEN
        RAISE LOG 'earnings.clamped clip=% campaign=% raw=% paid=% remaining_pool=% trace=%',
            v_clip.id, v_camp.id, v_raw_amount, v_amount, v_remaining_pool,
            COALESCE(p_trace_id, '-');
        IF v_remaining_pool <= 0.005 THEN
            RAISE WARNING '[ALERT] earnings.clamped_at_exhaustion clip=% campaign=% trace=%',
                v_clip.id, v_camp.id, COALESCE(p_trace_id, '-');
        END IF;
    END IF;

    v_remaining_after := v_remaining_pool - v_amount;

    IF v_amount <= 0 THEN
        UPDATE public.clips
            SET counted_views = p_new_views,
                current_views = GREATEST(current_views, p_new_views),
                last_synced_at = now(),
                updated_at = now()
            WHERE id = p_clip_id;

        v_closed := public.close_performance_campaign_if_exhausted(
            v_camp.id, v_remaining_pool, p_trace_id);
        RETURN 0;
    END IF;

    INSERT INTO public.earnings (
        clip_id, participation_id, campaign_id, creator_id,
        billable_views, effective_cpm, amount, status
    ) VALUES (
        v_clip.id, v_clip.participation_id, v_camp.id, v_clip.creator_id,
        v_billable, v_eff_cpm, v_amount, 'accrued'
    );

    UPDATE public.clips
        SET counted_views = p_new_views,
            current_views = GREATEST(current_views, p_new_views),
            last_synced_at = now(),
            updated_at = now()
        WHERE id = p_clip_id;

    UPDATE public.campaigns
        SET budget_reserved = budget_reserved + v_amount
        WHERE id = v_camp.id;

    UPDATE public.participations
        SET total_views  = total_views + v_billable,
            total_earned = total_earned + v_amount
        WHERE id = v_part.id;

    RAISE LOG 'earnings.accrued clip=% campaign=% creator=% billable=% cpm=% amount=% remaining_after=% trace=%',
        v_clip.id, v_camp.id, v_clip.creator_id, v_billable, v_eff_cpm, v_amount,
        v_remaining_after, COALESCE(p_trace_id, '-');

    PERFORM public.close_performance_campaign_if_exhausted(
        v_camp.id, v_remaining_after, p_trace_id);

    RETURN v_amount;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '[ALERT] earnings.exception clip=% sqlstate=% msg=% trace=%',
            p_clip_id, SQLSTATE, SQLERRM, COALESCE(p_trace_id, '-');
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 12. Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.approve_clip(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_clip(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_changes_clip(uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disqualify_clip(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_approve_overdue_clips(text) TO service_role;
