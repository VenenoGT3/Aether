/**
 * Types for the referral + weekly-challenge (Phase 4) features.
 * Zod schemas mirror the DB rows; the *Overview / *Challenge interfaces are the
 * UI-facing shapes returned by the server actions in lib/actions/.
 */

import { z } from "zod";

export const ReferralStatusSchema = z.enum(["pending", "qualified", "rewarded"]);
export type ReferralStatus = z.infer<typeof ReferralStatusSchema>;

export const ReferralSchema = z.object({
  id: z.string().uuid(),
  referrer_id: z.string().uuid(),
  referred_id: z.string().uuid(),
  referral_code: z.string(),
  status: ReferralStatusSchema,
  referrer_amount: z.number().nonnegative(),
  referred_amount: z.number().nonnegative(),
  created_at: z.union([z.date(), z.string()]),
  qualified_at: z.union([z.date(), z.string()]).nullable().optional(),
  rewarded_at: z.union([z.date(), z.string()]).nullable().optional(),
});
export type Referral = z.infer<typeof ReferralSchema>;

/** A single person the current user referred (UI row). */
export interface ReferredUser {
  referred_id: string;
  name: string;
  status: ReferralStatus;
  /** The referred user has produced a qualifying (approved/tracking) clip. */
  qualified: boolean;
  /** Qualified and not yet rewarded → the referrer can claim now. */
  claimable: boolean;
  created_at: string;
}

/** Everything the referral dashboard needs. */
export interface ReferralOverview {
  code: string;
  link: string;
  referral_count: number;
  total_earned: number;
  pending_count: number;
  referrals: ReferredUser[];
}

export interface ChallengeMilestoneStatus {
  /** Clip threshold for the milestone. */
  clips: number;
  reward: number;
  reached: boolean;
  claimed: boolean;
  claimable: boolean;
}

/** Weekly challenge progress for the current user. */
export interface WeeklyChallenge {
  /** ISO date (YYYY-MM-DD) of the Monday that starts this challenge week. */
  period_start: string;
  clips_this_week: number;
  next_milestone: number | null;
  clips_to_next: number;
  total_claimable: number;
  milestones: ChallengeMilestoneStatus[];
}
