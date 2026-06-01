-- Aether Database Seeding Script v1.0
-- Seeds 3 Businesses, 8 Influencers, 5 Campaigns, and related entities

-- 1. Seed auth.users (triggers will automatically insert into public.users and public.profiles)

-- Businesses
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES 
('d3b07384-d113-4a11-9a74-d4b998cf0001', 'marketing@acmetech.com', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Acme Tech Corp", "role":"business", "avatar_url":"https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=120&h=120&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
('d3b07384-d113-4a11-9a74-d4b998cf0002', 'partnerships@aurafashion.com', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Aura Aesthetics", "role":"business", "avatar_url":"https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=120&h=120&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
('d3b07384-d113-4a11-9a74-d4b998cf0003', 'collabs@vigornutrition.com', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Vigor Nutrition", "role":"business", "avatar_url":"https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=120&h=120&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- Influencers
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES 
('d3b07384-d113-4a11-9a74-d4b998cf0004', 'marcus@marcusv.tech', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Marcus Vance", "role":"influencer", "avatar_url":"https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
('d3b07384-d113-4a11-9a74-d4b998cf0005', 'chloe@chloestyle.com', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Chloe Zhang", "role":"influencer", "avatar_url":"https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
('d3b07384-d113-4a11-9a74-d4b998cf0006', 'alex@mercerfit.com', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Alex Mercer", "role":"influencer", "avatar_url":"https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
('d3b07384-d113-4a11-9a74-d4b998cf0007', 'sofia@rossiphotos.com', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Sofia Rossi", "role":"influencer", "avatar_url":"https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
('d3b07384-d113-4a11-9a74-d4b998cf0008', 'liam@liamcooks.com', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Liam O''Connor", "role":"influencer", "avatar_url":"https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
('d3b07384-d113-4a11-9a74-d4b998cf0009', 'elena@petrovaplays.com', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Elena Petrova", "role":"influencer", "avatar_url":"https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
('d3b07384-d113-4a11-9a74-d4b998cf0010', 'maya@mayabeauty.com', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Maya Lin", "role":"influencer", "avatar_url":"https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated'),
('d3b07384-d113-4a11-9a74-d4b998cf0011', 'david@millerwealth.com', '$2a$12$K.z895qV15FjW/r6H38L2e8V/FwR16XzQv6aH14a34b8c9d0e1f2g', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"David Miller", "role":"influencer", "avatar_url":"https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"}'::jsonb, now(), now(), 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;


-- 2. Update Profiles with rich, realistic domain specifics

-- Businesses
UPDATE public.profiles SET 
  bio = 'Building the tools of tomorrow, today. Premier developer and tech equipment manufacturer.',
  social_handles = '{"twitter": "@acmetech", "linkedin": "acme-tech", "website": "https://acmetech.com"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0001';

UPDATE public.profiles SET 
  bio = 'Minimalist organic linen apparel for the modern conscious creator.',
  social_handles = '{"instagram": "@aura.aesthetics", "tiktok": "@aura.aesthetics", "website": "https://auraaesthetics.com"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0002';

UPDATE public.profiles SET 
  bio = 'Clean sports nutrition and recovery fuel engineered for high-performance lifestyles.',
  social_handles = '{"instagram": "@vigornutrition", "youtube": "vigornutrition", "website": "https://vigornutrition.com"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0003';

-- Influencers
UPDATE public.profiles SET
  bio = 'Visual storyteller focusing on premium tech, workspace setups, and productivity.',
  niches = ARRAY['Tech', 'Minimalism', 'Productivity'],
  follower_count = 48500,
  engagement_rate = 4.82,
  social_handles = '{"instagram": "@marcusv", "youtube": "marcusvance", "twitter": "@marcusv"}'::jsonb,
  rate_card = '{"reel": 450.00, "video": 900.00, "story": 150.00}'::jsonb,
  audience_demographics = '{"age": {"18-24": 35, "25-34": 50, "35-44": 15}, "gender": {"male": 75, "female": 25}, "locations": {"US": 60, "UK": 15, "CA": 10}}'::jsonb,
  authenticity_score = 0.97,
  availability = '{"status": "available", "next_open_date": "2026-06-01"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0004';

UPDATE public.profiles SET
  bio = 'Casual luxury styling, seasonal lookbooks, and daily fashion aesthetics.',
  niches = ARRAY['Fashion', 'Lifestyle', 'Luxury'],
  follower_count = 125000,
  engagement_rate = 5.12,
  social_handles = '{"instagram": "@chloestyle", "tiktok": "@chloestyle"}'::jsonb,
  rate_card = '{"reel": 750.00, "tiktok": 600.00, "story": 250.00}'::jsonb,
  audience_demographics = '{"age": {"18-24": 60, "25-34": 30, "35-44": 10}, "gender": {"male": 10, "female": 90}, "locations": {"US": 50, "UK": 20, "FR": 10}}'::jsonb,
  authenticity_score = 0.94,
  availability = '{"status": "busy", "next_open_date": "2026-06-15"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0005';

UPDATE public.profiles SET
  bio = 'Daily athletic training routines, clean nutrition guides, and mental conditioning hacks.',
  niches = ARRAY['Fitness', 'Health', 'Nutrition'],
  follower_count = 85000,
  engagement_rate = 3.45,
  social_handles = '{"instagram": "@alexmercer", "youtube": "alexmercerfitness"}'::jsonb,
  rate_card = '{"reel": 500.00, "youtube_sponsor": 1200.00, "story": 200.00}'::jsonb,
  audience_demographics = '{"age": {"18-24": 40, "25-34": 45, "35-44": 15}, "gender": {"male": 65, "female": 35}, "locations": {"US": 55, "CA": 15, "AU": 10}}'::jsonb,
  authenticity_score = 0.96,
  availability = '{"status": "available", "next_open_date": "2026-05-25"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0006';

UPDATE public.profiles SET
  bio = 'Capturing hidden corners of the world through a warm cinematic travel lens.',
  niches = ARRAY['Travel', 'Photography', 'Adventure'],
  follower_count = 62000,
  engagement_rate = 6.75,
  social_handles = '{"instagram": "@sofiarossi", "tiktok": "@sofiarossi"}'::jsonb,
  rate_card = '{"post": 400.00, "reel": 550.00, "story": 150.00}'::jsonb,
  audience_demographics = '{"age": {"18-24": 25, "25-34": 55, "35-44": 20}, "gender": {"male": 45, "female": 55}, "locations": {"IT": 30, "US": 25, "UK": 15}}'::jsonb,
  authenticity_score = 0.98,
  availability = '{"status": "available", "next_open_date": "2026-06-05"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0007';

UPDATE public.profiles SET
  bio = 'Quick, healthy, high-protein meals for busy urban professionals.',
  niches = ARRAY['Food', 'Cooking', 'Lifestyle'],
  follower_count = 142000,
  engagement_rate = 4.10,
  social_handles = '{"tiktok": "@liamcooks", "instagram": "@liamcooks"}'::jsonb,
  rate_card = '{"tiktok": 700.00, "reel": 800.00, "story": 300.00}'::jsonb,
  audience_demographics = '{"age": {"18-24": 30, "25-34": 50, "35-44": 20}, "gender": {"male": 40, "female": 60}, "locations": {"US": 45, "CA": 20, "UK": 15}}'::jsonb,
  authenticity_score = 0.92,
  availability = '{"status": "busy", "next_open_date": "2026-06-20"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0008';

UPDATE public.profiles SET
  bio = 'Competitive live streams, ergonomic setup builds, and custom keyboard content.',
  niches = ARRAY['Gaming', 'Tech', 'Setup'],
  follower_count = 93000,
  engagement_rate = 5.55,
  social_handles = '{"twitch": "elenaplays", "youtube": "elenaplays", "twitter": "@elenaplays"}'::jsonb,
  rate_card = '{"stream_sponsor": 1500.00, "youtube_sponsor": 1100.00, "tweet": 250.00}'::jsonb,
  audience_demographics = '{"age": {"18-24": 55, "25-34": 35, "35-44": 10}, "gender": {"male": 70, "female": 30}, "locations": {"US": 40, "DE": 15, "RU": 15}}'::jsonb,
  authenticity_score = 0.95,
  availability = '{"status": "available", "next_open_date": "2026-05-24"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0009';

UPDATE public.profiles SET
  bio = 'Dermatology-focused science skincare and chemical-free aesthetic beauty reviews.',
  niches = ARRAY['Beauty', 'Skincare', 'Health'],
  follower_count = 74000,
  engagement_rate = 6.15,
  social_handles = '{"instagram": "@mayalinbeauty", "tiktok": "@mayalinbeauty"}'::jsonb,
  rate_card = '{"reel": 550.00, "tiktok": 500.00, "story": 200.00}'::jsonb,
  audience_demographics = '{"age": {"18-24": 50, "25-34": 40, "35-44": 10}, "gender": {"male": 5, "female": 95}, "locations": {"US": 60, "CA": 15, "SG": 10}}'::jsonb,
  authenticity_score = 0.97,
  availability = '{"status": "available", "next_open_date": "2026-05-28"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0010';

UPDATE public.profiles SET
  bio = 'Unpacking personal finance concepts, long-term investments, and business growth strategy.',
  niches = ARRAY['Finance', 'Business', 'Career'],
  follower_count = 55000,
  engagement_rate = 3.80,
  social_handles = '{"youtube": "millerfinance", "instagram": "@davidmiller"}'::jsonb,
  rate_card = '{"youtube_sponsor": 1000.00, "reel": 450.00, "story": 150.00}'::jsonb,
  audience_demographics = '{"age": {"18-24": 30, "25-34": 55, "35-44": 15}, "gender": {"male": 80, "female": 20}, "locations": {"US": 65, "UK": 10, "CA": 10}}'::jsonb,
  authenticity_score = 0.96,
  availability = '{"status": "available", "next_open_date": "2026-06-01"}'::jsonb
WHERE user_id = 'd3b07384-d113-4a11-9a74-d4b998cf0011';


-- 3. Seed campaigns (Created by Businesses)

INSERT INTO public.campaigns (id, business_id, title, description, budget_total, budget_allocated, target_niches, target_audience, deliverables, timeline, status)
VALUES
-- Campaign 1: Acme Tech "NextGen Workspace Setup"
('c1c07384-d113-4a11-9a74-d4b998cf0001', 'd3b07384-d113-4a11-9a74-d4b998cf0001', 
 'NextGen Workspace Setup', 
 'Promote our new premium ergonomic monitor arm and cable management accessories to minimalist tech and productivity creators.', 
 5000.00, 1350.00, ARRAY['Tech', 'Minimalism', 'Productivity'], 
 '{"age": ["18-24", "25-34"], "gender": ["male", "female"], "locations": ["US", "UK"]}'::jsonb,
 '[{"type": "instagram_reel", "quantity": 1, "description": "1x 60s Reel showing full desk transformation using monitor arm."}]'::jsonb,
 '{"start_date": "2026-06-01", "end_date": "2026-06-30"}'::jsonb, 
 'open'),

-- Campaign 2: Aura Aesthetics "Summer Linen Launch"
('c1c07384-d113-4a11-9a74-d4b998cf0002', 'd3b07384-d113-4a11-9a74-d4b998cf0002', 
 'Summer Linen Launch', 
 'Showcase our breathable, organic summer linen apparel in everyday casual-luxury styling clips.', 
 8000.00, 2100.00, ARRAY['Fashion', 'Lifestyle', 'Luxury'], 
 '{"age": ["18-24", "25-34"], "gender": ["female"], "locations": ["US", "UK", "FR"]}'::jsonb,
 '[{"type": "tiktok_video", "quantity": 1, "description": "1x 30s TikTok lookbook styling linen collection"}, {"type": "instagram_story", "quantity": 3, "description": "3x Stories with swipe up direct product links."}]'::jsonb,
 '{"start_date": "2026-05-15", "end_date": "2026-06-15"}'::jsonb, 
 'in_progress'),

-- Campaign 3: Vigor Nutrition "Clean Pre-Workout Boost"
('c1c07384-d113-4a11-9a74-d4b998cf0003', 'd3b07384-d113-4a11-9a74-d4b998cf0003', 
 'Clean Pre-Workout Boost', 
 'Highlight the organic energy and crash-free formula of our new pre-workout boost powder.', 
 3500.00, 700.00, ARRAY['Fitness', 'Health', 'Nutrition'], 
 '{"age": ["18-24", "25-34"], "locations": ["US", "CA"]}'::jsonb,
 '[{"type": "instagram_reel", "quantity": 1, "description": "1x Reel showing preparation and workout performance boost."}]'::jsonb,
 '{"start_date": "2026-05-01", "end_date": "2026-05-20"}'::jsonb, 
 'completed'),

-- Campaign 4: Acme Tech "Developer Productivity Hackathon"
('c1c07384-d113-4a11-9a74-d4b998cf0004', 'd3b07384-d113-4a11-9a74-d4b998cf0001', 
 'Developer Productivity Hackathon', 
 'Promote our mechanical split keyboard and custom macro pads to developers and gamers.', 
 4500.00, 0.00, ARRAY['Tech', 'Gaming', 'Setup'], 
 '{"age": ["18-24", "25-34"], "gender": ["male", "female"]}'::jsonb,
 '[{"type": "youtube_sponsor", "quantity": 1, "description": "1x 90s integrated sponsor slot in setup video."}]'::jsonb,
 '{"start_date": "2026-07-01", "end_date": "2026-07-31"}'::jsonb, 
 'draft'),

-- Campaign 5: Aura Aesthetics "Sustainable Basics Promotion"
('c1c07384-d113-4a11-9a74-d4b998cf0005', 'd3b07384-d113-4a11-9a74-d4b998cf0002', 
 'Sustainable Basics Campaign', 
 'Promote our core bamboo basics, highlighting fabric longevity and ecological manufacturing.', 
 12000.00, 3000.00, ARRAY['Fashion', 'Lifestyle', 'Minimalism'], 
 '{"age": ["18-34"]}'::jsonb,
 '[{"type": "instagram_reel", "quantity": 2, "description": "2x Reels focusing on outfit repeating and durability"}, {"type": "tiktok", "quantity": 1, "description": "1x TikTok review of textures."}]'::jsonb,
 '{"start_date": "2026-06-10", "end_date": "2026-07-10"}'::jsonb, 
 'open')
ON CONFLICT (id) DO NOTHING;


-- 4. Seed participations (Influencer applications and states)

INSERT INTO public.participations (id, campaign_id, influencer_id, status, proposed_payout, actual_payout, performance_data, applied_at)
VALUES
-- Marcus Vance accepted to Acme Tech setup campaign
('p1p07384-d113-4a11-9a74-d4b998cf0001', 'c1c07384-d113-4a11-9a74-d4b998cf0001', 'd3b07384-d113-4a11-9a74-d4b998cf0004', 
 'accepted', 450.00, 0.00, '{}'::jsonb, now() - INTERVAL '5 days'),

-- Elena Petrova applied to Acme Tech setup campaign
('p1p07384-d113-4a11-9a74-d4b998cf0002', 'c1c07384-d113-4a11-9a74-d4b998cf0001', 'd3b07384-d113-4a11-9a74-d4b998cf0009', 
 'applied', 900.00, 0.00, '{}'::jsonb, now() - INTERVAL '2 days'),

-- Chloe Zhang accepted to Aura Aesthetics linen campaign
('p1p07384-d113-4a11-9a74-d4b998cf0003', 'c1c07384-d113-4a11-9a74-d4b998cf0002', 'd3b07384-d113-4a11-9a74-d4b998cf0005', 
 'accepted', 1500.00, 0.00, '{}'::jsonb, now() - INTERVAL '10 days'),

-- Sofia Rossi offered a deal by Aura Aesthetics
('p1p07384-d113-4a11-9a74-d4b998cf0004', 'c1c07384-d113-4a11-9a74-d4b998cf0002', 'd3b07384-d113-4a11-9a74-d4b998cf0007', 
 'offered', 600.00, 0.00, '{}'::jsonb, now() - INTERVAL '4 days'),

-- Alex Mercer completed Vigor pre-workout campaign
('p1p07384-d113-4a11-9a74-d4b998cf0005', 'c1c07384-d113-4a11-9a74-d4b998cf0003', 'd3b07384-d113-4a11-9a74-d4b998cf0006', 
 'completed', 700.00, 700.00, '{"views": 25400, "likes": 1100, "comments": 85, "engagement_rate": 4.67}'::jsonb, now() - INTERVAL '20 days')
ON CONFLICT (id) DO NOTHING;


-- 5. Seed posts (Deliverable uploads)

INSERT INTO public.posts (id, participation_id, platform, post_url, metrics, submitted_at, approved_at)
VALUES
-- Alex Mercer post submission (Completed campaign)
('e1e07384-d113-4a11-9a74-d4b998cf0001', 'p1p07384-d113-4a11-9a74-d4b998cf0005', 
 'instagram', 'https://instagram.com/p/C7X892-boost', 
 '{"likes": 1100, "reach": 15000, "shares": 45, "comments": 85, "impressions": 18000, "engagement_rate": 4.8}'::jsonb, 
 now() - INTERVAL '15 days', now() - INTERVAL '13 days')
ON CONFLICT (id) DO NOTHING;


-- 6. Seed transactions (Billing history)

INSERT INTO public.transactions (id, participation_id, amount, type, stripe_payment_intent_id, status, created_at)
VALUES
-- Vigor Nutrition funds Escrow for Alex Mercer (Completed)
('t1t07384-d113-4a11-9a74-d4b998cf0001', 'p1p07384-d113-4a11-9a74-d4b998cf0005', 
 700.00, 'escrow', 'pi_3Mxt82LkdIwHu7ix1a2s', 'succeeded', now() - INTERVAL '19 days'),

-- Vigor Nutrition releases Escrow to Alex Mercer (Completed)
('t1t07384-d113-4a11-9a74-d4b998cf0002', 'p1p07384-d113-4a11-9a74-d4b998cf0005', 
 700.00, 'release', 'tr_3Mxt82LkdIwHu7ix3b4t', 'succeeded', now() - INTERVAL '13 days'),

-- Aura Aesthetics funds Escrow for Chloe Zhang (In Progress)
('t1t07384-d113-4a11-9a74-d4b998cf0003', 'p1p07384-d113-4a11-9a74-d4b998cf0003', 
 1500.00, 'escrow', 'pi_3Mxt82LkdIwHu7ix4c8r', 'succeeded', now() - INTERVAL '9 days')
ON CONFLICT (id) DO NOTHING;


-- 7. Seed notifications

INSERT INTO public.notifications (id, user_id, title, content, type, is_read, created_at)
VALUES
-- Notification for Marcus Vance
('n1n07384-d113-4a11-9a74-d4b998cf0001', 'd3b07384-d113-4a11-9a74-d4b998cf0004', 
 'Campaign Accepted', 
 'Acme Tech has accepted your application for the NextGen Workspace Setup campaign. Please fund payment details to lock in escrow.', 
 'status_change', true, now() - INTERVAL '5 days'),

-- Notification for Chloe Zhang
('n1n07384-d113-4a11-9a74-d4b998cf0002', 'd3b07384-d113-4a11-9a74-d4b998cf0005', 
 'Escrow Funded', 
 'Aura Aesthetics has successfully funded the $1,500.00 escrow for Summer Linen Launch. You can now begin creating drafts.', 
 'payment', false, now() - INTERVAL '9 days'),

-- Notification for Acme Tech
('n1n07384-d113-4a11-9a74-d4b998cf0003', 'd3b07384-d113-4a11-9a74-d4b998cf0001', 
 'New Application Received', 
 'Elena Petrova (@elenaplays) has applied to your campaign "NextGen Workspace Setup". Review their media kit and rate card.', 
 'campaign_invite', false, now() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;


-- 8. Seed ratings (Reviews of collaborations)

INSERT INTO public.ratings (id, campaign_id, reviewer_id, reviewee_id, score, comment, created_at)
VALUES
-- Vigor Nutrition reviews Alex Mercer
('r1r07384-d113-4a11-9a74-d4b998cf0001', 'c1c07384-d113-4a11-9a74-d4b998cf0003', 
 'd3b07384-d113-4a11-9a74-d4b998cf0003', 'd3b07384-d113-4a11-9a74-d4b998cf0006', 
 5, 'Alex delivered exceptional video quality and exceeded the target engagement rates. Highly recommend!', now() - INTERVAL '12 days'),

-- Alex Mercer reviews Vigor Nutrition
('r1r07384-d113-4a11-9a74-d4b998cf0002', 'c1c07384-d113-4a11-9a74-d4b998cf0003', 
 'd3b07384-d113-4a11-9a74-d4b998cf0006', 'd3b07384-d113-4a11-9a74-d4b998cf0003', 
 5, 'Clear brief, quick approvals, and immediate escrow payout release. Fantastic communication!', now() - INTERVAL '12 days')
ON CONFLICT (id) DO NOTHING;
