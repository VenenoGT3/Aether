-- Aether production security/realtime hardening.
--
-- Follow-up to the initial production apply:
--   * remove inherited PUBLIC permissions from the exposed public schema
--   * replace broad anon/authenticated table grants with explicit operation grants
--   * keep only app-facing RPCs executable by authenticated users
--   * add missing FK indexes reported by the Supabase performance advisor
--   * enable realtime only for tables the app actually subscribes to
--   * document every current public RLS policy in database comments

-- ---------------------------------------------------------------------------
-- 1. Schema/table/function privilege baseline
-- ---------------------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- Supabase service role is the server-side maintenance authority. RLS bypass is
-- still controlled by the Supabase service key; do not expose it to clients.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Explicit authenticated table privileges.
--    RLS policies below remain the row-level boundary.
-- ---------------------------------------------------------------------------
GRANT SELECT ON
    public.users,
    public.profiles,
    public.campaigns,
    public.participations,
    public.posts,
    public.messages,
    public.notifications,
    public.ratings,
    public.transactions,
    public.clips,
    public.earnings,
    public.payouts,
    public.platform_transactions,
    public.view_snapshots,
    public.referrals,
    public.challenge_claims
TO authenticated;

GRANT INSERT ON
    public.profiles,
    public.campaigns,
    public.participations,
    public.posts,
    public.messages,
    public.notifications,
    public.ratings,
    public.transactions,
    public.clips
TO authenticated;

GRANT UPDATE ON
    public.users,
    public.profiles,
    public.campaigns,
    public.participations,
    public.posts,
    public.messages,
    public.notifications,
    public.clips
TO authenticated;

GRANT DELETE ON
    public.campaigns,
    public.participations,
    public.posts,
    public.notifications
TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Explicit authenticated RPC/function privileges.
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.owns_campaign(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_creator() TO authenticated;

GRANT EXECUTE ON FUNCTION public.approve_clip(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_clip(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_changes_clip(uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disqualify_clip(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.override_clip_fraud(uuid, text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_withdrawal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_withdrawal(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.attach_referral(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral_bonus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_challenge(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_clip_bonus() TO authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_challenge_reward(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Missing FK indexes from Supabase performance advisor.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clips_quality_reviewed_by
    ON public.clips (quality_reviewed_by)
    WHERE quality_reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clips_reviewed_by
    ON public.clips (reviewed_by)
    WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_earnings_participation_id
    ON public.earnings (participation_id);

CREATE INDEX IF NOT EXISTS idx_messages_sender_id
    ON public.messages (sender_id);

CREATE INDEX IF NOT EXISTS idx_ratings_reviewer_id
    ON public.ratings (reviewer_id);

-- ---------------------------------------------------------------------------
-- 5. Realtime publication.
--    These are the only public tables currently subscribed to by client code.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_table_name text;
    v_tables text[] := ARRAY[
        'campaigns',
        'participations',
        'posts',
        'transactions',
        'messages',
        'notifications'
    ];
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH v_table_name IN ARRAY v_tables LOOP
            IF NOT EXISTS (
                SELECT 1
                FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime'
                  AND schemaname = 'public'
                  AND tablename = v_table_name
            ) THEN
                EXECUTE format(
                    'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
                    v_table_name
                );
            END IF;
        END LOOP;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. RLS policy comments.
-- ---------------------------------------------------------------------------
COMMENT ON POLICY "Allow business insertion of campaigns" ON public.campaigns IS
    'Business/admin users may create campaigns only for their own business_id.';
COMMENT ON POLICY "Allow businesses to delete their own campaigns" ON public.campaigns IS
    'Businesses may delete only campaigns they own.';
COMMENT ON POLICY "Allow businesses to update their own campaigns" ON public.campaigns IS
    'Businesses may update only campaigns they own; money-sensitive transitions are additionally guarded by functions and constraints.';
COMMENT ON POLICY "Allow read access to campaigns" ON public.campaigns IS
    'Authenticated users can read non-draft campaigns; draft campaigns remain owner-only.';

COMMENT ON POLICY "read own challenge claims" ON public.challenge_claims IS
    'Creators can read only their own weekly challenge claim records.';

COMMENT ON POLICY "Brand moderates clip" ON public.clips IS
    'Brands can update clips only for campaigns they own; approval/fraud fields are guarded by moderation RPC triggers.';
COMMENT ON POLICY "Creator submits clip" ON public.clips IS
    'Creators can insert clips only for their own valid participation in an open campaign.';
COMMENT ON POLICY "Read clips" ON public.clips IS
    'Clip rows are visible only to the creator or the owning campaign business.';

COMMENT ON POLICY "Read earnings" ON public.earnings IS
    'Earnings are readable only by the creator or by the owning campaign business.';

COMMENT ON POLICY "Allow insert access to messages in participations" ON public.messages IS
    'Participants can send messages only inside campaign participations where they are a counterparty.';
COMMENT ON POLICY "Allow read access to messages in participations" ON public.messages IS
    'Messages are readable only by sender or campaign participation counterparties.';
COMMENT ON POLICY "Allow update access to messages in participations" ON public.messages IS
    'Message updates are limited to campaign participation counterparties and further guarded by update triggers.';

COMMENT ON POLICY "Allow deletion of own notifications" ON public.notifications IS
    'Users can delete only their own notifications.';
COMMENT ON POLICY "Allow insert notifications for campaign counterparties" ON public.notifications IS
    'Users can create notifications only for themselves or the counterparty in an eligible campaign participation.';
COMMENT ON POLICY "Allow read access to own notifications" ON public.notifications IS
    'Users can read only their own notifications.';
COMMENT ON POLICY "Allow update access to own notifications" ON public.notifications IS
    'Users can update only their own notifications, such as marking them read.';

COMMENT ON POLICY "Allow influencer application" ON public.participations IS
    'Influencer users can apply only as themselves.';
COMMENT ON POLICY "Allow influencer deletion of applied participations" ON public.participations IS
    'Creators can remove only their own still-applied participation rows.';
COMMENT ON POLICY "Allow read access to participations" ON public.participations IS
    'Participation rows are visible to the creator or the owning campaign business.';
COMMENT ON POLICY "Allow update access to participations" ON public.participations IS
    'Participation updates are limited to the creator or owning campaign business; business workflows should preserve status invariants.';
COMMENT ON POLICY "Creators self-join performance campaigns" ON public.participations IS
    'Active creators can self-join open performance campaigns within capacity and budget gates.';

COMMENT ON POLICY "Read payouts" ON public.payouts IS
    'Creators can read only their own payout records; payout creation/settlement is RPC-controlled.';

COMMENT ON POLICY "Read own platform fees" ON public.platform_transactions IS
    'Businesses can read only platform fee rows tied to their own funded campaigns.';

COMMENT ON POLICY "Allow influencer deletion of posts" ON public.posts IS
    'Creators can delete only posts attached to their own participation.';
COMMENT ON POLICY "Allow influencer submission of posts" ON public.posts IS
    'Creators can submit posts only for their own participation.';
COMMENT ON POLICY "Allow read access to posts" ON public.posts IS
    'Posts are visible only to the creator or the owning campaign business.';
COMMENT ON POLICY "Allow update access to posts" ON public.posts IS
    'Posts can be updated only by the creator or owning campaign business, with sensitive fields guarded by triggers.';

COMMENT ON POLICY "Allow scoped read access to profiles" ON public.profiles IS
    'Profiles are visible to the owner, discoverable creators, or campaign counterparties.';
COMMENT ON POLICY "Allow users to insert their own profile" ON public.profiles IS
    'Users can create only their own profile row.';
COMMENT ON POLICY "Allow users to update their own profile" ON public.profiles IS
    'Users can update only their own profile row.';

COMMENT ON POLICY "Allow insertion of ratings by campaign participants" ON public.ratings IS
    'Ratings can be created only by campaign counterparties reviewing each other.';
COMMENT ON POLICY "Allow read access to campaign ratings" ON public.ratings IS
    'Ratings are visible only to reviewer, reviewee, or campaign counterparties.';

COMMENT ON POLICY "read own referrals" ON public.referrals IS
    'Referral ledger rows are visible only to the referrer or referred user.';

COMMENT ON POLICY "Allow read access to transactions" ON public.transactions IS
    'Transactions are readable by the owner or campaign counterparties.';
COMMENT ON POLICY "Allow transaction insertion" ON public.transactions IS
    'Transaction inserts are limited to eligible campaign/business flows; payout and bonus money movement uses RPCs.';

COMMENT ON POLICY "Allow users to read their own user record" ON public.users IS
    'Users can read only their own user record.';
COMMENT ON POLICY "Allow users to update their own user record" ON public.users IS
    'Users can update only their own user record; guarded columns are blocked by trigger.';

COMMENT ON POLICY "Read view snapshots" ON public.view_snapshots IS
    'View snapshots are visible only to the clip creator or owning campaign business.';

COMMENT ON FUNCTION public.approve_clip(uuid, int, text) IS
    'Authenticated brand RPC: approves an owned pending clip under row lock.';
COMMENT ON FUNCTION public.reject_clip(uuid, text, text) IS
    'Authenticated brand RPC: rejects an owned clip and blocks paid-earning regressions.';
COMMENT ON FUNCTION public.request_changes_clip(uuid, text, int, text) IS
    'Authenticated brand RPC: requests creator changes on an owned pending clip.';
COMMENT ON FUNCTION public.disqualify_clip(uuid, text, text) IS
    'Authenticated brand RPC: terminally disqualifies an owned clip unless paid earnings exist.';
COMMENT ON FUNCTION public.override_clip_fraud(uuid, text) IS
    'Authenticated brand RPC: clears a soft fraud flag on an owned non-terminal clip.';
COMMENT ON FUNCTION public.request_withdrawal(numeric, numeric) IS
    'Authenticated creator RPC: claims eligible earnings into a payout with server-side fee/minimum enforcement.';
COMMENT ON FUNCTION public.settle_withdrawal(uuid, text) IS
    'Authenticated server action RPC: marks a creator-owned payout paid after Stripe transfer succeeds.';
COMMENT ON FUNCTION public.fail_withdrawal(uuid) IS
    'Authenticated server action RPC: releases a creator-owned payout after a definite Stripe failure.';
