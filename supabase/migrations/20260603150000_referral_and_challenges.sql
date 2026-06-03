-- ============================================================================
-- Phase 4: Creator virality — referral system + weekly challenge rewards.
--
-- Adds:
--   * users.referral_code (unique, auto-generated), users.referred_by,
--     users.referral_count
--   * public.referrals          — who referred whom + bonus lifecycle (audit trail)
--   * public.challenge_claims   — idempotent record of claimed weekly milestones
--
-- All money-moving / state-changing work goes through SECURITY DEFINER RPCs
-- (attach_referral, claim_referral_bonus, claim_weekly_challenge) so RLS stays
-- closed and rewards are SERVER-AUTHORITATIVE — the client never supplies an
-- amount. Bonuses are platform-funded and credited to the legacy wallet as a
-- `transactions` row of type 'bonus' (already treated as a credit by the ledger).
--
-- Backward compatible: additive columns/tables, IF NOT EXISTS throughout.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Referral fields on public.users
-- ----------------------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS referral_code  TEXT,
    ADD COLUMN IF NOT EXISTS referred_by    UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS referral_count INTEGER NOT NULL DEFAULT 0;

-- A code is unique when present (partial index tolerates NULLs during backfill).
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_referral_code
    ON public.users (referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users (referred_by);

-- Defense in depth: you can never refer yourself.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_no_self_referral;
ALTER TABLE public.users
    ADD CONSTRAINT chk_users_no_self_referral
    CHECK (referred_by IS NULL OR referred_by <> id);

-- ----------------------------------------------------------------------------
-- 2. Referral code generation (unambiguous alphabet, collision-checked)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- No 0/1/I/O (mirrors REFERRAL_CODE_ALPHABET in lib/referral.ts).
    v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    v_len      CONSTANT INT  := 8;
    v_code     TEXT;
    v_i        INT;
    v_tries    INT := 0;
BEGIN
    LOOP
        v_code := '';
        FOR v_i IN 1..v_len LOOP
            v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
        END LOOP;

        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE referral_code = v_code);

        v_tries := v_tries + 1;
        IF v_tries > 20 THEN
            -- Astronomically unlikely; extend entropy and let the UNIQUE index arbitrate.
            RAISE WARNING '[ALERT] referral.code_gen_retries_exhausted tries=%', v_tries;
            v_code := v_code || floor(random() * 9)::text;
            EXIT;
        END IF;
    END LOOP;
    RETURN v_code;
END;
$$;

-- Auto-assign a code on every new user (covers handle_new_user inserts too).
CREATE OR REPLACE FUNCTION public.set_user_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
        NEW.referral_code := public.gen_referral_code();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_referral_code_before_insert ON public.users;
CREATE TRIGGER set_referral_code_before_insert
    BEFORE INSERT ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.set_user_referral_code();

-- Backfill existing users.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.users WHERE referral_code IS NULL LOOP
        UPDATE public.users SET referral_code = public.gen_referral_code() WHERE id = r.id;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Referrals ledger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referrals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    referred_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    referral_code   TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'qualified', 'rewarded')),
    referrer_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (referrer_amount >= 0),
    referred_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (referred_amount >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    qualified_at    TIMESTAMPTZ,
    rewarded_at     TIMESTAMPTZ,
    -- A user can only ever be referred once.
    CONSTRAINT uq_referrals_referred  UNIQUE (referred_id),
    CONSTRAINT chk_referrals_distinct CHECK (referrer_id <> referred_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON public.referrals (referred_id);

-- ----------------------------------------------------------------------------
-- 4. Weekly challenge claims (idempotency anchor: one row per user/week/milestone)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.challenge_claims (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    period_start   DATE NOT NULL,                              -- week start (Monday, UTC)
    milestone      INTEGER NOT NULL CHECK (milestone > 0),     -- clip threshold reached
    clips_at_claim INTEGER NOT NULL CHECK (clips_at_claim >= 0),
    amount         NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_challenge_claim UNIQUE (user_id, period_start, milestone)
);
CREATE INDEX IF NOT EXISTS idx_challenge_claims_user_period
    ON public.challenge_claims (user_id, period_start);

-- ----------------------------------------------------------------------------
-- 5. RLS — read-only for owners; ALL writes go through the RPCs below
-- ----------------------------------------------------------------------------
ALTER TABLE public.referrals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own referrals" ON public.referrals;
CREATE POLICY "read own referrals" ON public.referrals
    FOR SELECT TO authenticated
    USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

DROP POLICY IF EXISTS "read own challenge claims" ON public.challenge_claims;
CREATE POLICY "read own challenge claims" ON public.challenge_claims
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6. Internal: credit a platform-funded bonus into the legacy wallet
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_platform_bonus(
    p_user_id UUID,
    p_amount  NUMERIC,
    p_reason  TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tx_id UUID;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'award_platform_bonus: user_id required';
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'award_platform_bonus: amount must be positive (got %)', p_amount;
    END IF;

    INSERT INTO public.transactions (user_id, amount, type, status, participation_id)
    VALUES (p_user_id, p_amount, 'bonus', 'succeeded', NULL)
    RETURNING id INTO v_tx_id;

    RAISE LOG 'platform.bonus user=% amount=% reason=% tx=%', p_user_id, p_amount, p_reason, v_tx_id;
    RETURN v_tx_id;
END;
$$;

-- Authoritative weekly milestone reward table (keep in sync with lib/referral.ts).
CREATE OR REPLACE FUNCTION public.weekly_challenge_reward(p_milestone INT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_milestone
        WHEN 3  THEN 5.00
        WHEN 7  THEN 15.00
        WHEN 15 THEN 40.00
        ELSE 0.00
    END;
$$;

-- ----------------------------------------------------------------------------
-- 7. attach_referral — link the current user to a referrer by code (once)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_referral(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me       UUID := auth.uid();
    v_code     TEXT := upper(btrim(COALESCE(p_code, '')));
    v_referrer public.users%ROWTYPE;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'attach_referral: not authenticated';
    END IF;
    IF v_code = '' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
    END IF;

    -- Serialize concurrent attaches for this user.
    PERFORM pg_advisory_xact_lock(hashtext('aether:referral:attach:' || v_me::text));

    IF EXISTS (SELECT 1 FROM public.users WHERE id = v_me AND referred_by IS NOT NULL)
       OR EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = v_me) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_referred');
    END IF;

    SELECT * INTO v_referrer FROM public.users WHERE referral_code = v_code;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'code_not_found');
    END IF;
    IF v_referrer.id = v_me THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
    END IF;

    UPDATE public.users SET referred_by = v_referrer.id WHERE id = v_me;

    INSERT INTO public.referrals (referrer_id, referred_id, referral_code, status)
    VALUES (v_referrer.id, v_me, v_code, 'pending')
    ON CONFLICT (referred_id) DO NOTHING;

    RAISE LOG 'referral.attached referrer=% referred=%', v_referrer.id, v_me;
    RETURN jsonb_build_object('ok', true, 'referrer_id', v_referrer.id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. claim_referral_bonus — referrer claims once the referred user is active
--    Qualifying event: the referred user has an approved/tracking clip.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_referral_bonus(p_referred_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me              UUID := auth.uid();
    v_ref             public.referrals%ROWTYPE;
    v_qualified       BOOLEAN;
    v_referrer_reward CONSTANT NUMERIC := 5.00;
    v_referred_reward CONSTANT NUMERIC := 5.00;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'claim_referral_bonus: not authenticated';
    END IF;

    -- Lock the referral row to serialize concurrent claims (idempotency).
    SELECT * INTO v_ref FROM public.referrals
        WHERE referrer_id = v_me AND referred_id = p_referred_id
        FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_ref.status = 'rewarded' THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
    END IF;

    v_qualified := EXISTS (
        SELECT 1 FROM public.clips
        WHERE creator_id = p_referred_id AND status IN ('approved', 'tracking')
    );
    IF NOT v_qualified THEN
        -- Record the (still-pending) state so the UI can reflect it.
        RETURN jsonb_build_object('ok', false, 'reason', 'not_qualified');
    END IF;

    PERFORM public.award_platform_bonus(v_ref.referrer_id, v_referrer_reward, 'referral_referrer');
    PERFORM public.award_platform_bonus(v_ref.referred_id, v_referred_reward, 'referral_referred');

    UPDATE public.referrals
        SET status          = 'rewarded',
            referrer_amount = v_referrer_reward,
            referred_amount = v_referred_reward,
            qualified_at    = COALESCE(qualified_at, now()),
            rewarded_at     = now()
        WHERE id = v_ref.id;

    UPDATE public.users SET referral_count = referral_count + 1 WHERE id = v_ref.referrer_id;

    RAISE LOG 'referral.rewarded referrer=% referred=% total=%',
        v_ref.referrer_id, v_ref.referred_id, (v_referrer_reward + v_referred_reward);

    RETURN jsonb_build_object(
        'ok', true,
        'referrer_amount', v_referrer_reward,
        'referred_amount', v_referred_reward
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. claim_weekly_challenge — claim a milestone reached this week (idempotent)
-- ----------------------------------------------------------------------------
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

    -- Serialize this user's claims for the week (the UNIQUE index is the backstop).
    PERFORM pg_advisory_xact_lock(hashtext('aether:challenge:' || v_me::text || ':' || v_week_start::text));

    SELECT count(*) INTO v_clips
        FROM public.clips
        WHERE creator_id = v_me
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

-- ----------------------------------------------------------------------------
-- 10. Privilege lockdown — close PUBLIC, grant only the user-facing RPCs
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.gen_referral_code()                       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_referral_code()                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_platform_bonus(UUID, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.weekly_challenge_reward(INT)              FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_referral(TEXT)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_referral_bonus(UUID)               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_weekly_challenge(INT)              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.attach_referral(TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_referral_bonus(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_challenge(INT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_challenge_reward(INT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. Documentation
-- ----------------------------------------------------------------------------
COMMENT ON COLUMN public.users.referral_code  IS 'Unique shareable code; auto-generated on insert.';
COMMENT ON COLUMN public.users.referred_by    IS 'The user who referred this account (set once via attach_referral).';
COMMENT ON COLUMN public.users.referral_count IS 'Number of rewarded referrals this user has made.';
COMMENT ON TABLE  public.referrals            IS 'Referral lifecycle + payout audit trail (pending -> qualified -> rewarded).';
COMMENT ON TABLE  public.challenge_claims     IS 'Idempotent record of claimed weekly-challenge milestones (one row per user/week/milestone).';
COMMENT ON FUNCTION public.claim_referral_bonus(UUID)  IS 'Referrer-only, idempotent. Credits both parties once the referred user has an approved/tracking clip.';
COMMENT ON FUNCTION public.claim_weekly_challenge(INT) IS 'Self-service, idempotent. Server-authoritative reward for a milestone reached this week.';
