-- Database Migration: Security Hardening & RLS Enhancements
-- 1. Restrict public read access on public.users
DROP POLICY IF EXISTS "Allow public read access to users" ON public.users;

CREATE POLICY "Allow users to read their own user record" 
    ON public.users FOR SELECT TO authenticated 
    USING (auth.uid() = id);

-- 2. Prevent self-approval on posts and ensure data integrity
CREATE OR REPLACE FUNCTION public.check_post_update()
RETURNS trigger AS $$
BEGIN
    -- If approved_at is being changed (approving or revoking approval)
    IF NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
        -- Verify that the current user is the business owner of the campaign
        IF NOT EXISTS (
            SELECT 1 FROM public.participations p
            JOIN public.campaigns c ON c.id = p.campaign_id
            WHERE p.id = NEW.participation_id AND c.business_id = auth.uid()
        ) AND NOT EXISTS (
            -- Or is an admin
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only the campaign owner can approve or modify post approval status.';
        END IF;
    END IF;

    -- If core post details are being updated (platform, post_url, submitted_at)
    IF (NEW.platform IS DISTINCT FROM OLD.platform OR 
        NEW.post_url IS DISTINCT FROM OLD.post_url OR 
        NEW.submitted_at IS DISTINCT FROM OLD.submitted_at) THEN
        
        -- Verify that the current user is the participating influencer
        IF NOT EXISTS (
            SELECT 1 FROM public.participations p
            WHERE p.id = NEW.participation_id AND p.influencer_id = auth.uid()
        ) AND NOT EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only the participating influencer can modify the post details.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER verify_post_changes
    BEFORE UPDATE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION public.check_post_update();

-- 3. Fix Transactions: Add user_id and update policies for payouts
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

-- Drop old transaction policies
DROP POLICY IF EXISTS "Allow read access to transactions" ON public.transactions;
DROP POLICY IF EXISTS "Allow transaction creation by business" ON public.transactions;

-- Select: Allow if they own the transaction OR belong to the campaign/participation
CREATE POLICY "Allow read access to transactions"
    ON public.transactions FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.participations p
            WHERE p.id = participation_id AND (
                p.influencer_id = auth.uid() OR EXISTS (
                    SELECT 1 FROM public.campaigns c WHERE c.id = p.campaign_id AND c.business_id = auth.uid()
                )
            )
        )
    );

-- Insert: Allow business to fund escrows / release payout, and influencer to request payout/withdrawal
CREATE POLICY "Allow transaction insertion"
    ON public.transactions FOR INSERT TO authenticated
    WITH CHECK (
        -- Business scenario
        (EXISTS (
            SELECT 1 FROM public.participations p
            JOIN public.campaigns c ON c.id = p.campaign_id
            WHERE p.id = participation_id AND c.business_id = auth.uid()
        ) AND (user_id IS NULL OR user_id = auth.uid()))
        OR
        -- Influencer payout/withdrawal scenario
        (type = 'payout' AND participation_id IS NULL AND user_id = auth.uid())
    );

-- Add index on user_id for transaction performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
