-- RLS permissions hardening: tighten profiles, ratings, notifications; guard messages & users

-- ---------------------------------------------------------------------------
-- 1. Profiles: stop exposing business profiles + Stripe fields to everyone
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read access to profiles" ON public.profiles;

CREATE POLICY "Allow scoped read access to profiles"
    ON public.profiles FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = profiles.user_id AND u.role = 'influencer'
        )
        OR EXISTS (
            SELECT 1 FROM public.participations p
            JOIN public.campaigns c ON c.id = p.campaign_id
            WHERE (
                (p.influencer_id = profiles.user_id AND c.business_id = auth.uid())
                OR (c.business_id = profiles.user_id AND p.influencer_id = auth.uid())
            )
        )
    );

CREATE POLICY "Allow users to insert their own profile"
    ON public.profiles FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Ratings: only participants and parties involved
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read access to ratings" ON public.ratings;

CREATE POLICY "Allow read access to campaign ratings"
    ON public.ratings FOR SELECT TO authenticated
    USING (
        auth.uid() = reviewer_id
        OR auth.uid() = reviewee_id
        OR EXISTS (
            SELECT 1 FROM public.participations p
            JOIN public.campaigns c ON c.id = p.campaign_id
            WHERE p.campaign_id = ratings.campaign_id
            AND (
                p.influencer_id = auth.uid()
                OR c.business_id = auth.uid()
            )
        )
    );

-- ---------------------------------------------------------------------------
-- 3. Notifications: allow insert only for self or campaign counterparty
-- ---------------------------------------------------------------------------
CREATE POLICY "Allow insert notifications for campaign counterparties"
    ON public.notifications FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        OR EXISTS (
            SELECT 1 FROM public.participations p
            JOIN public.campaigns c ON c.id = p.campaign_id
            WHERE (
                (c.business_id = auth.uid() AND p.influencer_id = notifications.user_id)
                OR (p.influencer_id = auth.uid() AND c.business_id = notifications.user_id)
            )
        )
    );

-- ---------------------------------------------------------------------------
-- 4. Users: prevent self role escalation (admin set via service role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_user_update()
RETURNS trigger AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only administrators can change user roles.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS verify_user_changes ON public.users;
CREATE TRIGGER verify_user_changes
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.check_user_update();

-- ---------------------------------------------------------------------------
-- 5. Messages: restrict UPDATE to is_read only (no content tampering)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_message_update()
RETURNS trigger AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.participation_id IS DISTINCT FROM OLD.participation_id
        OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
        OR NEW.content IS DISTINCT FROM OLD.content
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION 'Only is_read may be updated on messages.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.participations p
        LEFT JOIN public.campaigns c ON p.campaign_id = c.id
        WHERE p.id = NEW.participation_id
        AND (p.influencer_id = auth.uid() OR c.business_id = auth.uid())
    ) THEN
        RAISE EXCEPTION 'Only participation members can update message read status.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS verify_message_changes ON public.messages;
CREATE TRIGGER verify_message_changes
    BEFORE UPDATE ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.check_message_update();

-- ---------------------------------------------------------------------------
-- 6. Participations: influencers may only delete while still "applied"
--     (policy exists; reinforce WITH CHECK on UPDATE status for business-only
--      approval paths is handled in app — document in PERMISSIONS.md)
-- ---------------------------------------------------------------------------