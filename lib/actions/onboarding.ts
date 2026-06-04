"use server";

import { getServerUser, createClient } from "@/lib/supabase/server";
import { toActionError, reportError, UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { OnboardingProgress } from "@/types/onboarding";

const FIRST_CLIP_BONUS = 10;

function assemble(
  partial: Omit<OnboardingProgress, "completedCount" | "totalCount" | "allComplete">
): OnboardingProgress {
  const steps = [
    partial.profileComplete,
    partial.firstClipApproved,
    partial.invitedFriend,
    partial.payoutsConnected,
  ];
  const completedCount = steps.filter(Boolean).length;
  return {
    ...partial,
    completedCount,
    totalCount: steps.length,
    // Don't hide the checklist while a bonus is still waiting to be claimed.
    allComplete: completedCount === steps.length && !partial.firstClipBonus.claimable,
  };
}

/** Activation progress for the current creator (drives the quick-wins checklist). */
export async function getOnboardingProgressAction(): Promise<{
  success: boolean;
  error?: string;
  progress?: OnboardingProgress;
}> {
  try {
    const me = await getServerUser();
    if (!me) throw new UnauthorizedError();
    const supabase = await createClient();

    const [userRow, postedRes, approvedRes, referralRes] = await Promise.all([
      supabase.from("users").select("first_clip_bonus_at").eq("id", me.user_id).single(),
      supabase
        .from("clips")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", me.user_id),
      supabase
        .from("clips")
        .select("id", { count: "exact", head: true })
        .eq("creator_id", me.user_id)
        .in("status", ["approved", "tracking"]),
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", me.user_id),
    ]);

    const firstClipPosted = Number(postedRes.count ?? 0) > 0;
    const firstClipApproved = Number(approvedRes.count ?? 0) > 0;
    const bonusClaimed = !!(userRow.data as { first_clip_bonus_at?: string | null } | null)
      ?.first_clip_bonus_at;

    return {
      success: true,
      progress: assemble({
        profileComplete: !!me.onboarded,
        firstClipPosted,
        firstClipApproved,
        firstClipBonus: {
          amount: FIRST_CLIP_BONUS,
          claimable: firstClipApproved && !bonusClaimed,
          claimed: bonusClaimed,
        },
        invitedFriend: Number(referralRes.count ?? 0) > 0,
        payoutsConnected: !!me.stripe_connect_id && !!me.stripe_onboarding_completed,
      }),
    };
  } catch (error) {
    reportError(error, { action: "getOnboardingProgress" });
    return { success: false, error: "Could not load your getting-started checklist." };
  }
}

/** Claim the one-time first-clip welcome bonus (idempotent, server-authoritative). */
export async function claimFirstClipBonusAction(): Promise<{
  success: boolean;
  error?: string;
  reward?: number;
}> {
  try {
    const me = await getServerUser();
    if (!me) throw new UnauthorizedError();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("claim_first_clip_bonus");
    if (error) throw error;

    const res = (data ?? {}) as { ok?: boolean; reason?: string; amount?: number };
    if (!res.ok) {
      const messages: Record<string, string> = {
        already_claimed: "You've already claimed your first-clip bonus.",
        not_qualified: "Post your first clip and get it approved to unlock this bonus.",
      };
      return { success: false, error: messages[res.reason ?? ""] ?? "Could not claim the bonus." };
    }

    logger.info({ event: "bonus.first_clip.claimed", userId: me.user_id }, "first clip bonus claimed");
    return { success: true, reward: res.amount };
  } catch (error) {
    return toActionError(error, { action: "claimFirstClipBonus" });
  }
}
