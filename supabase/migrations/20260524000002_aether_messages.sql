-- Database Migration: public.messages
-- Create messages table for direct chat thread.

CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participation_id UUID REFERENCES public.participations(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    is_read BOOLEAN DEFAULT false NOT NULL
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Select policy: Allow access if the user is the sender OR belongs to the participation
CREATE POLICY "Allow read access to messages in participations"
    ON public.messages FOR SELECT TO authenticated
    USING (
        auth.uid() = sender_id OR
        EXISTS (
            SELECT 1 FROM public.participations p
            LEFT JOIN public.campaigns c ON p.campaign_id = c.id
            WHERE p.id = participation_id AND (p.influencer_id = auth.uid() OR c.business_id = auth.uid())
        )
    );

-- Insert policy: Allow access if the user is the sender AND belongs to the participation
CREATE POLICY "Allow insert access to messages in participations"
    ON public.messages FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.participations p
            LEFT JOIN public.campaigns c ON p.campaign_id = c.id
            WHERE p.id = participation_id AND (p.influencer_id = auth.uid() OR c.business_id = auth.uid())
        )
    );

-- Update policy: Allow updating is_read status if the user belongs to the participation
CREATE POLICY "Allow update access to messages in participations"
    ON public.messages FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.participations p
            LEFT JOIN public.campaigns c ON p.campaign_id = c.id
            WHERE p.id = participation_id AND (p.influencer_id = auth.uid() OR c.business_id = auth.uid())
        )
    );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_participation_id ON public.messages(participation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
