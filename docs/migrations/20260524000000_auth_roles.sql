-- Aether Auth Roles and Profiles Schema Setup
-- Run this in your Supabase SQL Editor to set up roles, profiles and custom claims.

-- 1. Create custom user role enum if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('business', 'influencer');
  END IF;
END $$;

-- 2. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  role public.user_role NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  onboarded BOOLEAN DEFAULT FALSE NOT NULL,
  
  -- Business fields
  company_name TEXT,
  website TEXT,
  industry TEXT,
  company_size TEXT,
  stripe_connect_id TEXT,
  stripe_onboarding_completed BOOLEAN DEFAULT FALSE NOT NULL,
  
  -- Influencer fields
  bio TEXT,
  niche TEXT,
  followers INTEGER,
  engagement_rate NUMERIC(4, 2),
  social_links JSONB DEFAULT '{}'::jsonb NOT NULL,
  rate_card JSONB DEFAULT '{}'::jsonb NOT NULL,
  portfolio JSONB DEFAULT '[]'::jsonb NOT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" 
  ON public.profiles FOR SELECT 
  USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" 
  ON public.profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- 5. Create a trigger function that runs on user signup to set custom claims and profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  default_role public.user_role;
  raw_role_text TEXT;
  full_name_text TEXT;
  avatar_url_text TEXT;
BEGIN
  -- Extract metadata properties safely from raw_user_meta_data
  raw_role_text := coalesce(new.raw_user_meta_data->>'role', 'influencer');
  full_name_text := coalesce(new.raw_user_meta_data->>'full_name', '');
  avatar_url_text := coalesce(
    new.raw_user_meta_data->>'avatar_url', 
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
  );

  -- Determine role
  IF raw_role_text = 'business' THEN
    default_role := 'business'::public.user_role;
  ELSE
    default_role := 'influencer'::public.user_role;
  END IF;

  -- Set custom claim in auth.users app_metadata.
  -- Supabase includes raw_app_meta_data in JWT claims under `app_metadata`.
  UPDATE auth.users
  SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', default_role)
  WHERE id = new.id;

  -- Create public.profiles record
  INSERT INTO public.profiles (
    id, 
    role, 
    full_name, 
    avatar_url,
    onboarded,
    stripe_onboarding_completed
  )
  VALUES (
    new.id,
    default_role,
    full_name_text,
    avatar_url_text,
    false,
    false
  );
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger definition
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
