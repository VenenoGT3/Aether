-- ============================================================================
-- Phase 4 (cont.): First Clip Bonus — a one-time welcome reward (10) credited
-- after a creator's first APPROVED/tracking clip. Drives activation + retention.
--
-- Reuses the platform-bonus rail from 20260603150000 (award_platform_bonus →
-- transactions type 'bonus'). Server-authoritative amount, idempotent via a
-- one-shot flag on public.users + row lock. Additive / backward compatible.
-- ============================================================================

-- One-shot flag: when the bonus was granted (NULL = never).
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS first_clip_bonus_at TIMESTAMPTZ;

-- ----------------------------------------------------------------------------
-- claim_first_clip_bonus — self-service, idempotent, qualifies on first
-- approved/tracking clip. Returns { ok, reason? , amount? }.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_first_clip_bonus()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_me        UUID := auth.uid();
    v_bonus     CONSTANT NUMERIC := 10.00;
    v_already   TIMESTAMPTZ;
    v_qualified BOOLEAN;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'claim_first_clip_bonus: not authenticated';
    END IF;

    -- Lock the user row to serialize concurrent claims (idempotency anchor).
    SELECT first_clip_bonus_at INTO v_already
        FROM public.users WHERE id = v_me FOR UPDATE;
    IF v_already IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_claimed');
    END IF;

    v_qualified := EXISTS (
        SELECT 1 FROM public.clips
        WHERE creator_id = v_me AND status IN ('approved', 'tracking')
    );
    IF NOT v_qualified THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_qualified');
    END IF;

    PERFORM public.award_platform_bonus(v_me, v_bonus, 'first_clip');
    UPDATE public.users SET first_clip_bonus_at = now() WHERE id = v_me;

    INSERT INTO public.notifications (user_id, title, content, type)
    VALUES (
        v_me,
        'First clip bonus earned!',
        'Your first approved clip earned you a welcome bonus. Keep posting to earn more.',
        'reward'
    );

    RAISE LOG 'bonus.first_clip user=% amount=%', v_me, v_bonus;
    RETURN jsonb_build_object('ok', true, 'amount', v_bonus);
END;
$$;

-- ----------------------------------------------------------------------------
-- Privilege lockdown
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.claim_first_clip_bonus() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_first_clip_bonus() TO authenticated;

COMMENT ON COLUMN public.users.first_clip_bonus_at IS
    'When the one-time first-clip welcome bonus was granted (NULL = never).';
COMMENT ON FUNCTION public.claim_first_clip_bonus() IS
    'Self-service, idempotent. Grants a one-time welcome bonus once the creator has an approved/tracking clip.';
