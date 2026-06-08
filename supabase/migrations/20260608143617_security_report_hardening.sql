-- Aether security report hardening.
--
-- This migration closes the beta blockers from the 2026-06-08 security scan:
-- self-service admin claims, client-writable authoritative profile/funding/
-- participation fields, normalized clip duplication, and creator-callable
-- withdrawal settlement.

-- ---------------------------------------------------------------------------
-- 1. Role hardening: self-service role paths may claim only product roles.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_role public.user_role := 'influencer'::public.user_role;
    v_role_text text;
    v_full_name text;
    v_avatar_url text;
BEGIN
    v_role_text := lower(coalesce(new.raw_user_meta_data->>'role', ''));
    IF v_role_text IN ('business', 'influencer') THEN
        v_role := v_role_text::public.user_role;
    END IF;

    v_full_name := COALESCE(new.raw_user_meta_data->>'full_name', '');
    v_avatar_url := COALESCE(new.raw_user_meta_data->>'avatar_url', '');

    INSERT INTO public.users (id, email, role)
    VALUES (new.id, new.email, v_role);

    INSERT INTO public.profiles (user_id, full_name, avatar_url)
    VALUES (new.id, v_full_name, v_avatar_url);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_user_update()
RETURNS trigger AS $$
DECLARE
    v_initial_role_claim boolean;
    v_is_not_onboarded boolean;
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        v_initial_role_claim := COALESCE(
            current_setting('aether.initial_role_claim', true) = 'true',
            false
        );

        IF v_initial_role_claim
           AND auth.uid() = OLD.id
           AND NEW.role IN ('business'::public.user_role, 'influencer'::public.user_role)
        THEN
            SELECT NOT COALESCE(onboarded, false)
            INTO v_is_not_onboarded
            FROM public.profiles
            WHERE user_id = OLD.id;

            IF COALESCE(v_is_not_onboarded, true) THEN
                RETURN NEW;
            END IF;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only administrators can change user roles.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.claim_initial_user_role(p_role public.user_role)
RETURNS public.user_role AS $$
DECLARE
    v_existing_role public.user_role;
    v_onboarded boolean;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_role NOT IN ('business'::public.user_role, 'influencer'::public.user_role) THEN
        RAISE EXCEPTION 'Only business or influencer roles can be claimed during onboarding.'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.users (id, email, role)
    VALUES (auth.uid(), auth.email(), p_role)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.profiles (user_id, full_name, avatar_url)
    VALUES (auth.uid(), '', '')
    ON CONFLICT (user_id) DO NOTHING;

    SELECT u.role, COALESCE(p.onboarded, false)
    INTO v_existing_role, v_onboarded
    FROM public.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE u.id = auth.uid()
    FOR UPDATE OF u;

    IF v_onboarded THEN
        RETURN v_existing_role;
    END IF;

    PERFORM set_config('aether.initial_role_claim', 'true', true);

    UPDATE public.users
    SET role = p_role,
        updated_at = now()
    WHERE id = auth.uid();

    RETURN p_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.claim_initial_user_role(public.user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_initial_user_role(public.user_role) TO authenticated;

COMMENT ON FUNCTION public.claim_initial_user_role(public.user_role) IS
    'Allows authenticated OAuth users to set their initial Aether product role before onboarding. Admin cannot be self-claimed.';

-- ---------------------------------------------------------------------------
-- 2. Profile hardening: users cannot self-write trust/onboarding/payout fields.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.aether_is_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(auth.role(), '') = 'service_role'
        OR current_user = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_authoritative_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL
       OR public.aether_is_service_role()
       OR current_setting('aether.profile_mutation', true) = 'true'
    THEN
        RETURN NEW;
    END IF;

    IF NEW.user_id IS DISTINCT FROM OLD.user_id
        OR NEW.onboarded IS DISTINCT FROM OLD.onboarded
        OR NEW.trusted_creator IS DISTINCT FROM OLD.trusted_creator
        OR NEW.stripe_connect_id IS DISTINCT FROM OLD.stripe_connect_id
        OR NEW.stripe_onboarding_completed IS DISTINCT FROM OLD.stripe_onboarding_completed
        OR NEW.authenticity_score IS DISTINCT FROM OLD.authenticity_score
    THEN
        RAISE EXCEPTION 'profile_authoritative_field_forbidden'
            USING ERRCODE = '42501',
                  MESSAGE = 'Use the server onboarding or Stripe flow to update protected profile fields.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_authoritative_fields ON public.profiles;
CREATE TRIGGER trg_profiles_guard_authoritative_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profile_authoritative_fields();

CREATE OR REPLACE FUNCTION public.complete_creator_onboarding(
    p_bio text,
    p_niches text[],
    p_follower_count integer,
    p_engagement_rate numeric,
    p_social_handles jsonb,
    p_rate_card jsonb
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile public.profiles%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
          AND role = 'influencer'
    ) THEN
        RAISE EXCEPTION 'Only creator accounts can complete creator onboarding.'
            USING ERRCODE = '42501';
    END IF;

    IF COALESCE(array_length(p_niches, 1), 0) = 0 THEN
        RAISE EXCEPTION 'At least one niche is required.'
            USING ERRCODE = '23514';
    END IF;

    PERFORM set_config('aether.profile_mutation', 'true', true);

    UPDATE public.profiles
    SET bio = left(coalesce(p_bio, ''), 500),
        niches = p_niches,
        follower_count = greatest(coalesce(p_follower_count, 0), 0),
        engagement_rate = least(greatest(coalesce(p_engagement_rate, 0), 0), 100),
        social_handles = coalesce(p_social_handles, '{}'::jsonb),
        rate_card = coalesce(p_rate_card, '{}'::jsonb),
        onboarded = true,
        updated_at = now()
    WHERE user_id = auth.uid()
    RETURNING * INTO v_profile;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found.'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_creator_onboarding(text, text[], integer, numeric, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_creator_onboarding(text, text[], integer, numeric, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_stripe_connect_account(p_account_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF p_account_id IS NULL OR p_account_id !~ '^acct_[A-Za-z0-9]+$' THEN
        RAISE EXCEPTION 'Invalid Stripe account id.'
            USING ERRCODE = '23514';
    END IF;

    PERFORM set_config('aether.profile_mutation', 'true', true);

    UPDATE public.profiles
    SET stripe_connect_id = p_account_id,
        stripe_onboarding_completed = false,
        updated_at = now()
    WHERE user_id = auth.uid();

    RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_stripe_connect_account(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_stripe_connect_account(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Campaign funding hardening: direct writes cannot open performance pools.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_campaign_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF COALESCE(NEW.campaign_type, 'fixed') = 'performance'
       AND NOT public.aether_is_service_role()
    THEN
        NEW.status := 'draft'::public.campaign_status;
        NEW.funded_at := NULL;
        NEW.funding_payment_intent_id := NULL;
        NEW.budget_reserved := 0;
        NEW.budget_paid := 0;
        NEW.platform_fee_pct := COALESCE(NEW.platform_fee_pct, 0.10);
        NEW.available_pool := round(
            COALESCE(NEW.budget_pool, NEW.budget_total, 0)
            * (1 - COALESCE(NEW.platform_fee_pct, 0.10)),
            2
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaigns_insert_defaults ON public.campaigns;
CREATE TRIGGER trg_campaigns_insert_defaults
    BEFORE INSERT ON public.campaigns
    FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_insert_defaults();

CREATE OR REPLACE FUNCTION public.guard_campaign_authoritative_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL
       OR public.aether_is_service_role()
       OR current_setting('aether.campaign_funding', true) = 'true'
    THEN
        RETURN NEW;
    END IF;

    IF COALESCE(OLD.campaign_type, 'fixed') <> 'performance'
       AND COALESCE(NEW.campaign_type, 'fixed') <> 'performance'
    THEN
        RETURN NEW;
    END IF;

    IF NEW.funded_at IS DISTINCT FROM OLD.funded_at
        OR NEW.funding_payment_intent_id IS DISTINCT FROM OLD.funding_payment_intent_id
        OR NEW.budget_reserved IS DISTINCT FROM OLD.budget_reserved
        OR NEW.budget_paid IS DISTINCT FROM OLD.budget_paid
        OR NEW.available_pool IS DISTINCT FROM OLD.available_pool
    THEN
        RAISE EXCEPTION 'campaign_funding_field_forbidden'
            USING ERRCODE = '42501',
                  MESSAGE = 'Campaign funding fields are updated only by Stripe-backed server flows.';
    END IF;

    IF OLD.funding_payment_intent_id IS NOT NULL
       AND (
            NEW.budget_total IS DISTINCT FROM OLD.budget_total
            OR NEW.budget_pool IS DISTINCT FROM OLD.budget_pool
            OR NEW.brand_cpm_rate IS DISTINCT FROM OLD.brand_cpm_rate
            OR NEW.cpm_rate IS DISTINCT FROM OLD.cpm_rate
            OR NEW.platform_fee_pct IS DISTINCT FROM OLD.platform_fee_pct
            OR NEW.max_payout_per_creator IS DISTINCT FROM OLD.max_payout_per_creator
            OR NEW.min_payout_threshold IS DISTINCT FROM OLD.min_payout_threshold
       )
    THEN
        RAISE EXCEPTION 'funded_campaign_money_terms_locked'
            USING ERRCODE = '42501',
                  MESSAGE = 'Money terms are locked after pool funding starts.';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT (
            OLD.status = 'draft'::public.campaign_status
            AND NEW.status = 'cancelled'::public.campaign_status
        ) THEN
            RAISE EXCEPTION 'campaign_status_transition_forbidden'
                USING ERRCODE = '42501',
                      MESSAGE = 'Use the Stripe funding or moderation server flow to change performance campaign status.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaigns_guard_authoritative_fields ON public.campaigns;
CREATE TRIGGER trg_campaigns_guard_authoritative_fields
    BEFORE UPDATE ON public.campaigns
    FOR EACH ROW EXECUTE FUNCTION public.guard_campaign_authoritative_fields();

CREATE OR REPLACE FUNCTION public.record_pool_funding_intent(
    p_campaign_id uuid,
    p_payment_intent_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_campaign public.campaigns%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;
    IF p_payment_intent_id IS NULL OR btrim(p_payment_intent_id) = '' THEN
        RAISE EXCEPTION 'PaymentIntent id is required.'
            USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_campaign
    FROM public.campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign not found.'
            USING ERRCODE = 'P0002';
    END IF;
    IF v_campaign.business_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'You can only fund your own campaigns.'
            USING ERRCODE = '42501';
    END IF;
    IF v_campaign.campaign_type <> 'performance' THEN
        RAISE EXCEPTION 'Only performance campaigns use pool funding.'
            USING ERRCODE = '23514';
    END IF;
    IF v_campaign.status <> 'draft'::public.campaign_status OR v_campaign.funded_at IS NOT NULL THEN
        RAISE EXCEPTION 'Only unfunded draft campaigns can start pool funding.'
            USING ERRCODE = '23514';
    END IF;

    PERFORM set_config('aether.campaign_funding', 'true', true);

    UPDATE public.campaigns
    SET funding_payment_intent_id = p_payment_intent_id,
        updated_at = now()
    WHERE id = p_campaign_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_pool_funding_intent(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_pool_funding_intent(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_draft_performance_campaign(p_campaign_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_campaign public.campaigns%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    SELECT * INTO v_campaign
    FROM public.campaigns
    WHERE id = p_campaign_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Campaign not found.'
            USING ERRCODE = 'P0002';
    END IF;
    IF v_campaign.business_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'You can only cancel your own campaigns.'
            USING ERRCODE = '42501';
    END IF;
    IF v_campaign.campaign_type <> 'performance'
       OR v_campaign.status <> 'draft'::public.campaign_status
    THEN
        RAISE EXCEPTION 'Only draft performance campaigns can be cancelled.'
            USING ERRCODE = '23514';
    END IF;

    PERFORM set_config('aether.campaign_funding', 'true', true);

    UPDATE public.campaigns
    SET status = 'cancelled'::public.campaign_status,
        updated_at = now()
    WHERE id = p_campaign_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_draft_performance_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_draft_performance_campaign(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Participation rollup hardening.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_participation_authoritative_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL
       OR public.aether_is_service_role()
       OR current_setting('aether.participation_mutation', true) = 'true'
    THEN
        RETURN NEW;
    END IF;

    IF NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
        OR NEW.influencer_id IS DISTINCT FROM OLD.influencer_id
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.proposed_payout IS DISTINCT FROM OLD.proposed_payout
        OR NEW.actual_payout IS DISTINCT FROM OLD.actual_payout
        OR NEW.total_views IS DISTINCT FROM OLD.total_views
        OR NEW.total_earned IS DISTINCT FROM OLD.total_earned
        OR NEW.total_paid IS DISTINCT FROM OLD.total_paid
        OR NEW.creator_cpm_rate IS DISTINCT FROM OLD.creator_cpm_rate
        OR NEW.joined_at IS DISTINCT FROM OLD.joined_at
    THEN
        RAISE EXCEPTION 'participation_authoritative_field_forbidden'
            USING ERRCODE = '42501',
                  MESSAGE = 'Participation status and money rollups are updated only by server flows.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_participations_guard_authoritative_fields ON public.participations;
CREATE TRIGGER trg_participations_guard_authoritative_fields
    BEFORE UPDATE ON public.participations
    FOR EACH ROW EXECUTE FUNCTION public.guard_participation_authoritative_fields();

-- ---------------------------------------------------------------------------
-- 5. Clip ownership and normalized duplicate hardening.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_clip_provider_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL
       OR public.aether_is_service_role()
       OR current_setting('aether.clip_moderation', true) = 'true'
    THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND (
            NEW.creator_social_account_id IS DISTINCT FROM OLD.creator_social_account_id
            OR NEW.view_provider IS DISTINCT FROM OLD.view_provider
       )
    THEN
        RAISE EXCEPTION 'clip_provider_field_forbidden'
            USING ERRCODE = '42501',
                  MESSAGE = 'Clip provider binding is assigned by the submission flow.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clips_guard_provider_fields ON public.clips;
CREATE TRIGGER trg_clips_guard_provider_fields
    BEFORE UPDATE ON public.clips
    FOR EACH ROW EXECUTE FUNCTION public.guard_clip_provider_fields();

CREATE OR REPLACE FUNCTION public.prevent_active_clip_external_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing uuid;
BEGIN
    IF NEW.external_post_id IS NULL
       OR NEW.status NOT IN ('pending', 'approved', 'tracking')
    THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_existing
    FROM public.clips
    WHERE creator_id = NEW.creator_id
      AND platform = NEW.platform
      AND external_post_id = NEW.external_post_id
      AND status IN ('pending', 'approved', 'tracking')
      AND id IS DISTINCT FROM NEW.id
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'duplicate_external_post_id'
            USING ERRCODE = '23505',
                  MESSAGE = 'This video already has an active submission.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clips_prevent_external_duplicate ON public.clips;
CREATE TRIGGER trg_clips_prevent_external_duplicate
    BEFORE INSERT OR UPDATE OF external_post_id, platform, campaign_id, status ON public.clips
    FOR EACH ROW EXECUTE FUNCTION public.prevent_active_clip_external_duplicate();

CREATE INDEX IF NOT EXISTS idx_clips_active_creator_external_post
    ON public.clips (creator_id, platform, external_post_id)
    WHERE external_post_id IS NOT NULL
      AND status IN ('pending', 'approved', 'tracking');

-- ---------------------------------------------------------------------------
-- 6. Withdrawal settlement: creators may request, service role settles/fails.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.settle_withdrawal(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fail_withdrawal(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_withdrawal(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_withdrawal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_payout_paid(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_payout_failed(uuid) TO service_role;

COMMENT ON FUNCTION public.settle_withdrawal(uuid, text) IS
    'Service-role only. Stripe transfer outcomes are settled by trusted server/worker code, not directly by creators.';
COMMENT ON FUNCTION public.fail_withdrawal(uuid) IS
    'Service-role only. Releases a withdrawal claim only after trusted server/worker code determines Stripe did not transfer funds.';

-- ---------------------------------------------------------------------------
-- 7. Weekly challenge: count only approved/tracking clips, not raw submissions.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_weekly_challenge(p_milestone INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me         UUID := auth.uid();
    v_week_start DATE := (date_trunc('week', (now() AT TIME ZONE 'UTC')))::date;
    v_clips      INT;
    v_reward     NUMERIC;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'claim_weekly_challenge: not authenticated';
    END IF;

    v_reward := public.weekly_challenge_reward(p_milestone);
    IF v_reward <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_milestone');
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('aether:challenge:' || v_me::text || ':' || v_week_start::text));

    SELECT count(*) INTO v_clips
        FROM public.clips
        WHERE creator_id = v_me
          AND status IN ('approved', 'tracking')
          AND COALESCE(submitted_at, created_at) >= v_week_start
          AND COALESCE(submitted_at, created_at) <  (v_week_start + INTERVAL '7 days');

    IF v_clips < p_milestone THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_reached', 'clips', v_clips, 'milestone', p_milestone);
    END IF;

    BEGIN
        INSERT INTO public.challenge_claims (user_id, period_start, milestone, clips_at_claim, amount)
        VALUES (v_me, v_week_start, p_milestone, v_clips, v_reward);
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
    END;

    PERFORM public.award_platform_bonus(v_me, v_reward, 'weekly_challenge_' || p_milestone::text);

    RAISE LOG 'challenge.rewarded user=% week=% milestone=% amount=%', v_me, v_week_start, p_milestone, v_reward;

    RETURN jsonb_build_object('ok', true, 'amount', v_reward, 'clips', v_clips, 'milestone', p_milestone);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_weekly_challenge(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_weekly_challenge(INT) TO authenticated;

COMMENT ON FUNCTION public.claim_weekly_challenge(INT) IS
    'Self-service, idempotent. Counts only approved/tracking clips in the current UTC week.';

-- ---------------------------------------------------------------------------
-- 8. OAuth state hardening support.
-- ---------------------------------------------------------------------------

ALTER TABLE public.creator_social_oauth_states
    ADD COLUMN IF NOT EXISTS verifier_hash text,
    ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_creator_social_oauth_states_active
    ON public.creator_social_oauth_states (state, expires_at)
    WHERE consumed_at IS NULL;
