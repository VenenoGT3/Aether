"use server";

import { z } from "zod";
import { getServerUser, createClient } from "@/lib/supabase/server";
import { safeParse } from "@/lib/validate";
import { toActionError, reportError, UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  WEEKLY_CHALLENGE_MILESTONES,
  getWeekStart,
  nextMilestone,
  clipsToNextMilestone,
} from "@/lib/referral";
import type { WeeklyChallenge, ChallengeMilestoneStatus } from "@/types/referral";

const milestoneField = z
  .number()
  .int("Invalid milestone.")
  .refine(
    (n) => WEEKLY_CHALLENGE_MILESTONES.some((m) => m.clips === n),
    "Unknown challenge milestone."
  );

/** Assemble the UI challenge shape from a clip count + already-claimed thresholds. */
function buildChallenge(
  clips: number,
  claimedThresholds: number[],
  periodStart: string
): WeeklyChallenge {
  const claimed = new Set(claimedThresholds);
  const milestones: ChallengeMilestoneStatus[] = WEEKLY_CHALLENGE_MILESTONES.map((m) => {
    const reached = clips >= m.clips;
    const claimedM = claimed.has(m.clips);
    return { clips: m.clips, reward: m.reward, reached, claimed: claimedM, claimable: reached && !claimedM };
  });
  const next = nextMilestone(clips);
  return {
    period_start: periodStart,
    clips_this_week: clips,
    next_milestone: next?.clips ?? null,
    clips_to_next: clipsToNextMilestone(clips),
    total_claimable: milestones.filter((m) => m.claimable).reduce((s, m) => s + m.reward, 0),
    milestones,
  };
}

/** Current user's weekly challenge progress (clips posted this week + milestones). */
export async function getWeeklyChallengeAction(): Promise<{
  success: boolean;
  error?: string;
  challenge?: WeeklyChallenge;
}> {
  try {
    const weekStart = getWeekStart();
    const periodStart = weekStart.toISOString().slice(0, 10);

    const me = await getServerUser();
    if (!me) throw new UnauthorizedError();
    const supabase = await createClient();

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const { count } = await supabase
      .from("clips")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", me.user_id)
      .gte("submitted_at", weekStart.toISOString())
      .lt("submitted_at", weekEnd.toISOString());

    const { data: claims } = await supabase
      .from("challenge_claims")
      .select("milestone")
      .eq("user_id", me.user_id)
      .eq("period_start", periodStart);

    const claimed = ((claims ?? []) as Array<{ milestone: number }>).map((c) => Number(c.milestone));

    return { success: true, challenge: buildChallenge(Number(count ?? 0), claimed, periodStart) };
  } catch (error) {
    reportError(error, { action: "getWeeklyChallenge" });
    return { success: false, error: "Could not load this week's challenge." };
  }
}

/**
 * Claim the bonus for a milestone reached this week. Server-authoritative
 * (the RPC recomputes the clip count + reward) and idempotent (one claim per
 * user/week/milestone).
 */
export async function claimWeeklyChallengeRewardAction(
  milestoneClips: number
): Promise<{ success: boolean; error?: string; reward?: number }> {
  try {
    const parsed = safeParse(milestoneField, milestoneClips);
    if (!parsed.ok) return { success: false, error: parsed.error };

    const me = await getServerUser();
    if (!me) throw new UnauthorizedError();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("claim_weekly_challenge", {
      p_milestone: parsed.data,
    });
    if (error) throw error;

    const res = (data ?? {}) as { ok?: boolean; reason?: string; amount?: number };
    if (!res.ok) {
      const messages: Record<string, string> = {
        invalid_milestone: "Unknown challenge milestone.",
        not_reached: "You haven't reached this milestone yet.",
        already_claimed: "You've already claimed this reward this week.",
      };
      return { success: false, error: messages[res.reason ?? ""] ?? "Could not claim this reward." };
    }

    logger.info(
      { event: "challenge.reward.claimed", userId: me.user_id, milestone: parsed.data },
      "challenge reward claimed"
    );
    return { success: true, reward: res.amount };
  } catch (error) {
    return toActionError(error, { action: "claimWeeklyChallengeReward" });
  }
}
