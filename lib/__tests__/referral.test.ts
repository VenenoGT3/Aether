import { describe, it, expect } from "vitest";

import {
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  generateReferralCode,
  normalizeReferralCode,
  isValidReferralCode,
  buildReferralUrl,
  calculateReferralReward,
  WEEKLY_CHALLENGE_MILESTONES,
  getWeekStart,
  reachedMilestones,
  nextMilestone,
  clipsToNextMilestone,
  claimableChallengeReward,
  challengeRewardFor,
} from "@/lib/referral";

describe("referral codes", () => {
  it("generateReferralCode produces a full code from the allowed alphabet", () => {
    const code = generateReferralCode(() => 0.5);
    expect(code).toHaveLength(REFERRAL_CODE_LENGTH);
    for (const ch of code) expect(REFERRAL_CODE_ALPHABET).toContain(ch);
    // Deterministic for a fixed rand.
    expect(generateReferralCode(() => 0)).toBe("A".repeat(REFERRAL_CODE_LENGTH));
  });

  it("normalizeReferralCode upcases, strips junk, and caps length", () => {
    expect(normalizeReferralCode("  ab-cd ef!gh ij ")).toBe("ABCDEFGH");
    expect(normalizeReferralCode("aether42")).toBe("AETHER42");
  });

  it("isValidReferralCode rejects wrong length / ambiguous chars and accepts valid", () => {
    expect(isValidReferralCode("AETHER42")).toBe(true);
    expect(isValidReferralCode("short")).toBe(false);
    expect(isValidReferralCode("AAAAAAA0")).toBe(false); // 0 not in alphabet
    expect(isValidReferralCode("AAAAAAAI")).toBe(false); // I not in alphabet
  });

  it("buildReferralUrl yields a clean signup link with the normalized code", () => {
    expect(buildReferralUrl("aether42", "https://aether.app/")).toBe(
      "https://aether.app/auth/signup?ref=AETHER42"
    );
  });

  it("calculateReferralReward sums both sides", () => {
    const r = calculateReferralReward();
    expect(r.total).toBe(r.referrer + r.referred);
    expect(r.total).toBeGreaterThan(0);
  });
});

describe("weekly challenge", () => {
  it("getWeekStart returns the Monday 00:00 UTC of that week", () => {
    // 2026-06-03 is a Wednesday → week starts Monday 2026-06-01.
    const start = getWeekStart(new Date("2026-06-03T19:00:00Z"));
    expect(start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(start.getUTCDay()).toBe(1); // Monday

    // A Sunday belongs to the week that started the previous Monday.
    const sundayStart = getWeekStart(new Date("2026-06-07T23:59:00Z"));
    expect(sundayStart.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("reachedMilestones / nextMilestone / clipsToNextMilestone track progress", () => {
    expect(reachedMilestones(0)).toHaveLength(0);
    expect(reachedMilestones(8).map((m) => m.clips)).toEqual([3, 7]);
    expect(nextMilestone(5)?.clips).toBe(7);
    expect(clipsToNextMilestone(5)).toBe(2);
    // All milestones reached → no next.
    const max = WEEKLY_CHALLENGE_MILESTONES[WEEKLY_CHALLENGE_MILESTONES.length - 1].clips;
    expect(nextMilestone(max)).toBeNull();
    expect(clipsToNextMilestone(max)).toBe(0);
  });

  it("claimableChallengeReward sums reached-but-unclaimed milestones", () => {
    // 8 clips reaches the 3 and 7 milestones; 3 already claimed → only 7's reward remains.
    expect(claimableChallengeReward(8, [3])).toBe(challengeRewardFor(7));
    expect(claimableChallengeReward(8, [3, 7])).toBe(0);
    expect(claimableChallengeReward(2)).toBe(0);
  });

  it("challengeRewardFor returns 0 for unknown thresholds", () => {
    expect(challengeRewardFor(7)).toBeGreaterThan(0);
    expect(challengeRewardFor(999)).toBe(0);
  });
});
