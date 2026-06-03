/**
 * Creator onboarding / activation progress (Phase 4).
 * UI-facing shape returned by getOnboardingProgressAction — drives the
 * "Getting started" quick-wins checklist on the creator dashboard.
 */

export interface FirstClipBonusState {
  amount: number;
  /** Eligible to claim now (first clip approved + not yet granted). */
  claimable: boolean;
  /** Already granted. */
  claimed: boolean;
}

export interface OnboardingProgress {
  profileComplete: boolean;
  firstClipPosted: boolean;
  firstClipApproved: boolean;
  firstClipBonus: FirstClipBonusState;
  invitedFriend: boolean;
  payoutsConnected: boolean;
  /** Count of the 4 quick-win steps completed. */
  completedCount: number;
  totalCount: number;
  /** All steps done AND no pending bonus to claim → safe to hide the checklist. */
  allComplete: boolean;
  isMock?: boolean;
}
