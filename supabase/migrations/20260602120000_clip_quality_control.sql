-- Aether Migration: video Quality Control on clips.
--
-- Adds a brand "quality review" decision layer on top of the operational clip
-- status. quality_status moves pending_review -> approved | changes_requested |
-- rejected. The operational `status` still gates earnings; the invariant is
-- status='tracking' <=> quality_status='approved', enforced by:
--   * approve   -> status=tracking,  quality_status=approved
--   * reject    -> status=rejected,  quality_status=rejected
--   * changes   -> status=pending,   quality_status=changes_requested (no earning)
--   * trusted insert / deadline auto-approve -> also set quality_status=approved
--   * record_clip_earning gets a defensive quality_status='approved' guard.
--
-- Backward compatible: existing clips are backfilled so tracking clips stay
-- quality-approved (and keep earning) and rejected clips stay rejected.

-- ---------------------------------------------------------------------------
-- 1. Columns + backfill
-- ---------------------------------------------------------------------------
ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS quality_status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (quality_status IN ('pending_review', 'approved', 'changes_requested', 'rejected')),
    ADD COLUMN IF NOT EXISTS quality_reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS quality_reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS quality_notes TEXT,
    ADD COLUMN IF NOT EXISTS quality_score INT CHECK (quality_score IS NULL OR quality_score BETWEEN 1 AND 10);

COMMENT ON COLUMN public.clips.quality_status IS
    'Brand quality decision: pending_review | approved | changes_requested | rejected. tracking <=> approved.';
COMMENT ON COLUMN public.clips.quality_notes IS 'Brand feedback for changes_requested / rejected.';
COMMENT ON COLUMN public.clips.quality_score IS 'Optional 1-10 brand quality rating.';

-- Align existing clips with the invariant (tracking clips must stay approved so
-- they keep earning; rejected/disqualified become rejected).
UPDATE public.clips SET quality_status = CASE
    WHEN status IN ('tracking', 'approved') THEN 'approved'
    WHEN status IN ('rejected', 'disqualified') THEN 'rejected'
    ELSE 'pending_review'
END;

-- ---------------------------------------------------------------------------
-- 2. Insert trigger: trusted creators are quality-approved on submit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_clip_approval_defaults()
RETURNS trigger AS $$
DECLARE
    v_trusted boolean;
BEGIN
    IF NEW.submitted_at IS NULL THEN
        NEW.submitted_at := now();
    END IF;
    NEW.approval_deadline := public.add_business_days(NEW.submitted_at, 5);

    SELECT trusted_creator INTO v_trusted
        FROM public.profiles WHERE user_id = NEW.creator_id;

    IF COALESCE(v_trusted, false) THEN
        NEW.status := 'tracking';
        NEW.quality_status := 'approved';
        NEW.approved_at := now();
        NEW.auto_approved := true;
    ELSE
        NEW.status := 'pending';
        NEW.quality_status := 'pending_review';
        NEW.approved_at := NULL;
        NEW.auto_approved := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 3. Deadline auto-approve: only NEVER-reviewed clips (pending_review) lapse to
--    approved; changes_requested clips wait on the creator, not the clock.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_approve_overdue_clips()
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    WITH promoted AS (
        UPDATE public.clips c
        SET status = 'tracking',
            quality_status = 'approved',
            approved_at = now(),
            auto_approved = true,
            updated_at = now()
        FROM public.campaigns ca
        WHERE c.campaign_id = ca.id
          AND c.status = 'pending'
          AND c.quality_status = 'pending_review'
          AND c.approval_deadline IS NOT NULL
          AND c.approval_deadline <= now()
          AND ca.campaign_type = 'performance'
          AND ca.status IN ('open', 'in_progress')
        RETURNING c.id
    )
    SELECT count(*) INTO v_count FROM promoted;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 4. record_clip_earning: defensive quality guard. Only quality-approved,
--    tracking clips on live campaigns accrue. (Re-creates 20260602100000 + the
--    quality_status guard.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_clip_earning(
    p_clip_id uuid,
    p_new_views bigint
)
RETURNS numeric AS $$
DECLARE
    v_clip            public.clips%ROWTYPE;
    v_camp            public.campaigns%ROWTYPE;
    v_part            public.participations%ROWTYPE;
    v_billable        bigint;
    v_eff_cpm         numeric;
    v_remaining_pool  numeric;
    v_remaining_cap   numeric;
    v_amount          numeric;
BEGIN
    SELECT * INTO v_clip FROM public.clips WHERE id = p_clip_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    IF v_clip.status <> 'tracking' THEN
        RETURN 0;
    END IF;

    -- Defensive: never pay a clip that isn't quality-approved.
    IF v_clip.quality_status IS DISTINCT FROM 'approved' THEN
        RETURN 0;
    END IF;

    SELECT * INTO v_camp FROM public.campaigns WHERE id = v_clip.campaign_id FOR UPDATE;
    IF NOT FOUND
        OR v_camp.campaign_type <> 'performance'
        OR v_camp.cpm_rate IS NULL THEN
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

    v_eff_cpm := COALESCE(v_part.creator_cpm_rate, v_camp.cpm_rate);
    v_amount  := ROUND((v_billable::numeric / 1000.0) * v_eff_cpm, 2);

    IF v_camp.max_payout_per_creator IS NOT NULL THEN
        v_remaining_cap := v_camp.max_payout_per_creator - v_part.total_earned;
        v_amount := LEAST(v_amount, GREATEST(v_remaining_cap, 0));
    END IF;

    v_remaining_pool := COALESCE(v_camp.available_pool, v_camp.budget_pool, 0)
                        - v_camp.budget_reserved
                        - v_camp.budget_paid;
    v_amount := LEAST(v_amount, GREATEST(v_remaining_pool, 0));

    IF v_amount <= 0 THEN
        UPDATE public.clips
            SET counted_views = p_new_views,
                current_views = GREATEST(current_views, p_new_views),
                last_synced_at = now(),
                updated_at = now()
            WHERE id = p_clip_id;

        IF v_remaining_pool <= 0.005 THEN
            UPDATE public.campaigns
                SET status = 'exhausted', updated_at = now()
                WHERE id = v_camp.id AND status IN ('open', 'in_progress');
        END IF;
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

    IF (v_remaining_pool - v_amount) <= 0.005 THEN
        UPDATE public.campaigns
            SET status = 'exhausted', updated_at = now()
            WHERE id = v_camp.id AND status IN ('open', 'in_progress');

        INSERT INTO public.notifications (user_id, title, content, type)
        VALUES (
            v_camp.business_id,
            'Campaign budget exhausted',
            'Your performance campaign "' || COALESCE(v_camp.title, 'Untitled')
                || '" has used its full creator budget and is now closed to new earnings.',
            'budget'
        );
    END IF;

    UPDATE public.participations
        SET total_views  = total_views + v_billable,
            total_earned = total_earned + v_amount
        WHERE id = v_part.id;

    RETURN v_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
