-- Aether Migration: Performance-Based Clipping — Phase 2
-- Open join + clip submission.
--
-- Lets creators self-join performance campaigns directly (no application /
-- brand approval) and submit clips against them. Fully backward compatible:
-- the legacy fixed-fee "apply -> approve" flow is untouched (it runs on the
-- existing "Allow influencer application" policy and campaign_type = 'fixed').

-- ===========================================================================
-- 1. OPEN JOIN — participations
-- ===========================================================================

-- Additive INSERT policy: an onboarded creator may self-join a *performance*
-- campaign that is currently accepting creators. This coexists (OR) with the
-- existing "Allow influencer application" policy used by fixed campaigns.
DROP POLICY IF EXISTS "Creators self-join performance campaigns" ON public.participations;
CREATE POLICY "Creators self-join performance campaigns"
    ON public.participations FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = influencer_id
        AND public.is_active_creator()
        AND EXISTS (
            SELECT 1 FROM public.campaigns c
            WHERE c.id = campaign_id
              AND c.campaign_type = 'performance'
              AND c.status IN ('open', 'in_progress')
        )
    );

-- Trigger: force safe defaults when a creator self-joins a performance campaign.
-- Creators can never self-assign a privileged status (e.g. 'completed') — the
-- trigger pins it to 'active' and zeroes the rollups. Fixed campaigns are left
-- exactly as the legacy apply flow inserts them.
CREATE OR REPLACE FUNCTION public.enforce_open_join()
RETURNS trigger AS $$
DECLARE
    v_type text;
BEGIN
    SELECT campaign_type INTO v_type
        FROM public.campaigns
        WHERE id = NEW.campaign_id;

    IF v_type = 'performance' AND NEW.influencer_id = auth.uid() THEN
        NEW.status         := 'active';
        NEW.proposed_payout := COALESCE(NEW.proposed_payout, 0);
        NEW.actual_payout  := COALESCE(NEW.actual_payout, 0);
        NEW.total_views    := 0;
        NEW.total_earned   := 0;
        NEW.total_paid     := 0;
        NEW.joined_at      := now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS enforce_open_join_trg ON public.participations;
CREATE TRIGGER enforce_open_join_trg
    BEFORE INSERT ON public.participations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_open_join();

-- ===========================================================================
-- 2. CLIP SUBMISSION — tighten the clips insert policy
-- ===========================================================================
-- Now that participation_status has 'active' (20260601000002), require the
-- creator's participation to be active before they can submit a clip.
DROP POLICY IF EXISTS "Creator submits clip" ON public.clips;
CREATE POLICY "Creator submits clip"
    ON public.clips FOR INSERT TO authenticated
    WITH CHECK (
        creator_id = auth.uid()
        AND public.is_active_creator()
        AND EXISTS (
            SELECT 1 FROM public.participations p
            WHERE p.id = participation_id
              AND p.influencer_id = auth.uid()
              AND p.campaign_id = clips.campaign_id
              AND p.status = 'active'
        )
    );
