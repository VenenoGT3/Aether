"use server";

import { cookies as getCookies } from "next/headers";
import { z } from "zod";
import { createClient, getServerUser } from "@/lib/supabase/server";
import {
  toActionError,
  reportError,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/errors";
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

const SocialHandlesSchema = z.object({
  instagram: z.string().trim().max(100).optional(),
  tiktok: z.string().trim().max(100).optional(),
  youtube: z.string().trim().max(100).optional(),
});

const RateCardSchema = z.object({
  post: z.number().finite().nonnegative().max(1_000_000),
  video: z.number().finite().nonnegative().max(1_000_000),
  story: z.number().finite().nonnegative().max(1_000_000),
});

const CreatorOnboardingSchema = z.object({
  bio: z.string().trim().min(1).max(500),
  niche: z.string().trim().min(1).max(120),
  followerCount: z.number().int().nonnegative().max(1_000_000_000),
  engagementRate: z.number().finite().nonnegative().max(100),
  socialHandles: SocialHandlesSchema,
  rateCard: RateCardSchema,
});

export type CompleteCreatorOnboardingInput = z.input<typeof CreatorOnboardingSchema>;

export async function completeCreatorOnboardingAction(
  input: CompleteCreatorOnboardingInput
) {
  try {
    const parsed = CreatorOnboardingSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Check your creator profile details and try again." };
    }

    const user = await getServerUser();
    if (!user) throw new UnauthorizedError();
    if (user.role !== "influencer") {
      throw new ForbiddenError("Only creator accounts can complete creator onboarding.");
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("complete_creator_onboarding", {
      p_bio: parsed.data.bio,
      p_niches: [parsed.data.niche],
      p_follower_count: parsed.data.followerCount,
      p_engagement_rate: parsed.data.engagementRate,
      p_social_handles: parsed.data.socialHandles,
      p_rate_card: parsed.data.rateCard,
    });

    if (error) throw error;

    const cookieStore = await getCookies();
    cookieStore.set("aether-onboarded", "true", {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    });

    return { success: true, profile: data };
  } catch (error) {
    return toActionError(error, { action: "completeCreatorOnboarding" });
  }
}
