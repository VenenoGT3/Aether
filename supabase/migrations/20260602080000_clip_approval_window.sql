-- Aether Migration: per-video approval window + Trusted Creator bypass
--
-- Content-Rewards-style approval flow:
--   * A submitted clip starts 'pending' with a 5 WORKING-DAY approval deadline.
--   * The brand approves/rejects within the window (existing moderation flow).
--   * If the brand does NOT act by the deadline, the clip AUTO-APPROVES
--     (-> 'tracking') so the creator isn't penalized for brand inaction.
--   * TRUSTED creators skip the window entirely: their clips auto-approve on
--     submit (-> 'tracking'), enforced server-side in the insert trigger.
--
-- Earnings need no change: record_clip_earning already only pays 'tracking'
-- clips. The worker promotes overdue 'pending' clips via auto_approve_overdue_clips().

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS trusted_creator BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.trusted_creator IS
    'Trusted creators have their clips auto-approved on submit (skip the review window).';

ALTER TABLE public.clips
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approval_deadline TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clips.approval_deadline IS
    'submitted_at + 5 working days. If the brand does not act by then, the clip auto-approves (-> tracking).';
COMMENT ON COLUMN public.clips.auto_approved IS
    'True when the clip reached tracking without explicit brand review (trusted creator on submit, or deadline lapse).';

-- ---------------------------------------------------------------------------
-- 2. add_business_days(): add N working days, skipping Sat/Sun.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_business_days(p_from timestamptz, p_days int)
RETURNS timestamptz AS $$
DECLARE
    v_ts   timestamptz := p_from;
    v_left int := GREATEST(p_days, 0);
BEGIN
    WHILE v_left > 0 LOOP
        v_ts := v_ts + interval '1 day';
        -- ISODOW: 6 = Saturday, 7 = Sunday.
        IF EXTRACT(ISODOW FROM v_ts) < 6 THEN
            v_left := v_left - 1;
        END IF;
    END LOOP;
    RETURN v_ts;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------------------------------------------------------------------------
-- 3. Insert trigger: set submitted_at + deadline, apply the trusted bypass.
--    Forces status server-side (a creator can never self-insert 'tracking').
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
        -- Trusted creator: auto-approve immediately.
        NEW.status := 'tracking';
        NEW.approved_at := now();
        NEW.auto_approved := true;
    ELSE
        -- Everyone else starts pending, regardless of any client-provided status.
        NEW.status := 'pending';
        NEW.approved_at := NULL;
        NEW.auto_approved := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER set_clip_approval
    BEFORE INSERT ON public.clips
    FOR EACH ROW EXECUTE FUNCTION public.set_clip_approval_defaults();

-- Backfill existing clips so their deadlines are populated (use created_at).
UPDATE public.clips
    SET submitted_at = COALESCE(submitted_at, created_at),
        approval_deadline = COALESCE(approval_deadline, public.add_business_days(created_at, 5))
    WHERE approval_deadline IS NULL;

-- ---------------------------------------------------------------------------
-- 4. auto_approve_overdue_clips(): promote pending clips past their deadline.
--    Called by the worker on each cycle. Returns the number promoted.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_approve_overdue_clips()
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    WITH promoted AS (
        UPDATE public.clips c
        SET status = 'tracking',
            approved_at = now(),
            auto_approved = true,
            updated_at = now()
        FROM public.campaigns ca
        WHERE c.campaign_id = ca.id
          AND c.status = 'pending'
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
