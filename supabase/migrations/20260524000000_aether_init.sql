-- Aether Database Migration v1.0
-- Initial Schema & RLS Security Layout

-- 1. Enable Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Define Custom Enums
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE public.user_role AS ENUM ('business', 'influencer', 'admin');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status') THEN
        CREATE TYPE public.campaign_status AS ENUM ('draft', 'open', 'in_progress', 'completed', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participation_status') THEN
        CREATE TYPE public.participation_status AS ENUM ('applied', 'offered', 'accepted', 'declined', 'completed', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_type') THEN
        CREATE TYPE public.transaction_type AS ENUM ('escrow', 'release', 'bonus', 'refund');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
        CREATE TYPE public.transaction_status AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
    END IF;
END$$;

-- 3. Create Update Timestamp Helper Function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create Tables

-- public.users
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role public.user_role NOT NULL DEFAULT 'influencer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public.profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT,
    bio TEXT,
    niches TEXT[] NOT NULL DEFAULT '{}',
    follower_count INTEGER NOT NULL DEFAULT 0,
    engagement_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    audience_demographics JSONB NOT NULL DEFAULT '{}'::jsonb,
    social_handles JSONB NOT NULL DEFAULT '{}'::jsonb,
    rate_card JSONB NOT NULL DEFAULT '{}'::jsonb,
    authenticity_score NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    availability JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding vector(1536), -- Vector embedding representation of bio & niches for AI matchmaking
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public.campaigns
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    budget_total NUMERIC(12,2) NOT NULL,
    budget_allocated NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    target_niches TEXT[] NOT NULL DEFAULT '{}',
    target_audience JSONB NOT NULL DEFAULT '{}'::jsonb,
    deliverables JSONB NOT NULL DEFAULT '{}'::jsonb,
    timeline JSONB NOT NULL DEFAULT '{}'::jsonb,
    status public.campaign_status NOT NULL DEFAULT 'draft',
    embedding vector(1536), -- Vector embedding representation of campaign description & targets
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public.participations
CREATE TABLE IF NOT EXISTS public.participations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    influencer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status public.participation_status NOT NULL DEFAULT 'applied',
    proposed_payout NUMERIC(12,2) NOT NULL,
    actual_payout NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    performance_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_campaign_influencer UNIQUE (campaign_id, influencer_id)
);

-- public.posts
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participation_id UUID NOT NULL REFERENCES public.participations(id) ON DELETE CASCADE,
    platform TEXT NOT NULL, -- 'instagram', 'tiktok', 'youtube', etc.
    post_url TEXT NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb, -- {impressions, reach, likes, comments, shares, engagement_rate}
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public.transactions
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    participation_id UUID REFERENCES public.participations(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    type public.transaction_type NOT NULL,
    stripe_payment_intent_id TEXT,
    status public.transaction_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public.notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT NOT NULL, -- 'campaign_invite', 'status_change', 'payment', etc.
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- public.ratings
CREATE TABLE IF NOT EXISTS public.ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reviewee_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_campaign_reviewer UNIQUE (campaign_id, reviewer_id)
);

-- 5. Attach Triggers for Update Timestamps
CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_participations_updated_at BEFORE UPDATE ON public.participations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER set_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Trigger for Automating User Sync from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_role public.user_role;
    v_full_name text;
    v_avatar_url text;
BEGIN
    -- Extract role from metadata, defaulting to 'influencer'
    v_role := COALESCE(
        (new.raw_user_meta_data->>'role')::public.user_role,
        'influencer'::public.user_role
    );
    
    -- Extract profile fields
    v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', '');
    v_avatar_url := COALESCE(new.raw_user_meta_data->>'avatar_url', '');

    -- Insert into public.users
    INSERT INTO public.users (id, email, role)
    VALUES (new.id, new.email, v_role);

    -- Insert into public.profiles
    INSERT INTO public.profiles (user_id, full_name, avatar_url)
    VALUES (new.id, v_full_name, v_avatar_url);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger for email updates
CREATE OR REPLACE FUNCTION public.handle_update_user()
RETURNS trigger AS $$
BEGIN
    UPDATE public.users
    SET email = new.email,
        updated_at = now()
    WHERE id = new.id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_updated
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_update_user();

-- 7. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies

-- Users policies
CREATE POLICY "Allow public read access to users" 
    ON public.users FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow users to update their own user record" 
    ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Profiles policies
CREATE POLICY "Allow public read access to profiles" 
    ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow users to update their own profile" 
    ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Campaigns policies
CREATE POLICY "Allow read access to campaigns" 
    ON public.campaigns FOR SELECT TO authenticated 
    USING (auth.uid() = business_id OR status != 'draft');

CREATE POLICY "Allow business insertion of campaigns" 
    ON public.campaigns FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = business_id AND EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('business', 'admin')
    ));

CREATE POLICY "Allow businesses to update their own campaigns" 
    ON public.campaigns FOR UPDATE TO authenticated 
    USING (auth.uid() = business_id);

CREATE POLICY "Allow businesses to delete their own campaigns" 
    ON public.campaigns FOR DELETE TO authenticated 
    USING (auth.uid() = business_id);

-- Participations policies
CREATE POLICY "Allow read access to participations" 
    ON public.participations FOR SELECT TO authenticated 
    USING (auth.uid() = influencer_id OR EXISTS (
        SELECT 1 FROM public.campaigns WHERE id = campaign_id AND business_id = auth.uid()
    ));

CREATE POLICY "Allow influencer application" 
    ON public.participations FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = influencer_id AND EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'influencer'
    ));

CREATE POLICY "Allow update access to participations" 
    ON public.participations FOR UPDATE TO authenticated 
    USING (auth.uid() = influencer_id OR EXISTS (
        SELECT 1 FROM public.campaigns WHERE id = campaign_id AND business_id = auth.uid()
    ));

CREATE POLICY "Allow influencer deletion of applied participations" 
    ON public.participations FOR DELETE TO authenticated 
    USING (auth.uid() = influencer_id AND status = 'applied');

-- Posts policies
CREATE POLICY "Allow read access to posts" 
    ON public.posts FOR SELECT TO authenticated 
    USING (EXISTS (
        SELECT 1 FROM public.participations p 
        WHERE p.id = participation_id AND (
            p.influencer_id = auth.uid() OR EXISTS (
                SELECT 1 FROM public.campaigns c WHERE c.id = p.campaign_id AND c.business_id = auth.uid()
            )
        )
    ));

CREATE POLICY "Allow influencer submission of posts" 
    ON public.posts FOR INSERT TO authenticated 
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.participations p 
        WHERE p.id = participation_id AND p.influencer_id = auth.uid()
    ));

CREATE POLICY "Allow update access to posts" 
    ON public.posts FOR UPDATE TO authenticated 
    USING (EXISTS (
        SELECT 1 FROM public.participations p 
        WHERE p.id = participation_id AND (
            p.influencer_id = auth.uid() OR EXISTS (
                SELECT 1 FROM public.campaigns c WHERE c.id = p.campaign_id AND c.business_id = auth.uid()
            )
        )
    ));

CREATE POLICY "Allow influencer deletion of posts" 
    ON public.posts FOR DELETE TO authenticated 
    USING (EXISTS (
        SELECT 1 FROM public.participations p 
        WHERE p.id = participation_id AND p.influencer_id = auth.uid()
    ));

-- Transactions policies
CREATE POLICY "Allow read access to transactions" 
    ON public.transactions FOR SELECT TO authenticated 
    USING (EXISTS (
        SELECT 1 FROM public.participations p 
        WHERE p.id = participation_id AND (
            p.influencer_id = auth.uid() OR EXISTS (
                SELECT 1 FROM public.campaigns c WHERE c.id = p.campaign_id AND c.business_id = auth.uid()
            )
        )
    ));

CREATE POLICY "Allow transaction creation by business" 
    ON public.transactions FOR INSERT TO authenticated 
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.participations p 
        JOIN public.campaigns c ON c.id = p.campaign_id 
        WHERE p.id = participation_id AND c.business_id = auth.uid()
    ));

-- Notifications policies
CREATE POLICY "Allow read access to own notifications" 
    ON public.notifications FOR SELECT TO authenticated 
    USING (auth.uid() = user_id);

CREATE POLICY "Allow update access to own notifications" 
    ON public.notifications FOR UPDATE TO authenticated 
    USING (auth.uid() = user_id);

CREATE POLICY "Allow deletion of own notifications" 
    ON public.notifications FOR DELETE TO authenticated 
    USING (auth.uid() = user_id);

-- Ratings policies
CREATE POLICY "Allow public read access to ratings" 
    ON public.ratings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow insertion of ratings by campaign participants" 
    ON public.ratings FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = reviewer_id AND EXISTS (
        SELECT 1 FROM public.campaigns c 
        WHERE c.id = campaign_id AND (
            c.business_id = auth.uid() OR EXISTS (
                SELECT 1 FROM public.participations p WHERE p.campaign_id = c.id AND p.influencer_id = auth.uid()
            )
        )
    ));

-- 9. Performance Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_profiles_follower_count ON public.profiles(follower_count);
CREATE INDEX IF NOT EXISTS idx_profiles_engagement_rate ON public.profiles(engagement_rate);
CREATE INDEX IF NOT EXISTS idx_campaigns_business_id ON public.campaigns(business_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_participations_campaign_id ON public.participations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_participations_influencer_id ON public.participations(influencer_id);
CREATE INDEX IF NOT EXISTS idx_participations_status ON public.participations(status);
CREATE INDEX IF NOT EXISTS idx_posts_participation_id ON public.posts(participation_id);
CREATE INDEX IF NOT EXISTS idx_transactions_participation_id ON public.transactions(participation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_ratings_campaign_id ON public.ratings(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ratings_reviewee_id ON public.ratings(reviewee_id);
