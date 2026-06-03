/**
 * Referral + weekly-challenge CORE LOGIC.
 *
 * PURE and DEPENDENCY-FREE (no Supabase / Sentry / env imports) so it is safe to
 * import from both Client and Server Components. Persistence and the actual money
 * crediting live in the SECURITY DEFINER RPCs (see the referral migration) and the
 * server actions in lib/actions/referral.ts + lib/actions/challenges.ts.
 *
 * The reward amounts here are for DISPLAY. The SQL RPCs are the AUTHORITATIVE
 * source for what is actually credited — keep the two in sync.
 */

// ---------------------------------------------------------------------------
// Referral codes
// ---------------------------------------------------------------------------

/** Unambiguous alphabet (no 0/1/I/O). Mirrors gen_referral_code() in SQL. */
export const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 8;

/** Generate a referral code. `rand` is injectable for deterministic tests. */
export function generateReferralCode(rand: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += REFERRAL_CODE_ALPHABET[Math.floor(rand() * REFERRAL_CODE_ALPHABET.length)];
  }
  return code;
}

/** Uppercase, strip non-alphanumerics, cap to code length (forgiving of user paste). */
export function normalizeReferralCode(input: string): string {
  return (input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, REFERRAL_CODE_LENGTH);
}

/** True when `input` normalizes to a full code drawn from the allowed alphabet. */
export function isValidReferralCode(input: string): boolean {
  const code = normalizeReferralCode(input);
  if (code.length !== REFERRAL_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!REFERRAL_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/** Build the shareable signup link for a code. */
export function buildReferralUrl(code: string, baseUrl: string): string {
  const base = (baseUrl ?? "").replace(/\/+$/, "");
  return `${base}/auth/signup?ref=${encodeURIComponent(normalizeReferralCode(code))}`;
}

// ---------------------------------------------------------------------------
// Referral rewards (display) — authoritative amounts live in claim_referral_bonus
// ---------------------------------------------------------------------------

export const REFERRAL_REWARD = { referrer: 5, referred: 5 } as const;

export function calculateReferralReward(): {
  referrer: number;
  referred: number;
  total: number;
} {
  const { referrer, referred } = REFERRAL_REWARD;
  return { referrer, referred, total: referrer + referred };
}

// ---------------------------------------------------------------------------
// Weekly challenge
// ---------------------------------------------------------------------------

export interface ChallengeMilestone {
  /** Clips that must be posted this week to unlock the reward. */
  clips: number;
  /** Bonus awarded when the milestone is reached. */
  reward: number;
}

/** Milestones, ascending. Mirrors weekly_challenge_reward() in SQL. */
export const WEEKLY_CHALLENGE_MILESTONES: readonly ChallengeMilestone[] = [
  { clips: 3, reward: 5 },
  { clips: 7, reward: 15 },
  { clips: 15, reward: 40 },
];

/**
 * Monday 00:00 UTC of the week containing `date`. Mirrors PostgreSQL
 * `date_trunc('week', ...)`, whose weeks are Monday-based.
 */
export function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

/** Milestones whose threshold has been met. */
export function reachedMilestones(clips: number): ChallengeMilestone[] {
  return WEEKLY_CHALLENGE_MILESTONES.filter((m) => clips >= m.clips);
}

/** The next milestone above the current clip count, or null if all are reached. */
export function nextMilestone(clips: number): ChallengeMilestone | null {
  return WEEKLY_CHALLENGE_MILESTONES.find((m) => clips < m.clips) ?? null;
}

/** Clips still needed to reach the next milestone (0 when none remain). */
export function clipsToNextMilestone(clips: number): number {
  const next = nextMilestone(clips);
  return next ? Math.max(0, next.clips - clips) : 0;
}

/** Total reward for reached milestones not present in `claimedThresholds`. */
export function claimableChallengeReward(
  clips: number,
  claimedThresholds: number[] = []
): number {
  const claimed = new Set(claimedThresholds);
  return reachedMilestones(clips)
    .filter((m) => !claimed.has(m.clips))
    .reduce((sum, m) => sum + m.reward, 0);
}

/** Reward for a specific milestone threshold (0 if it isn't a known milestone). */
export function challengeRewardFor(clipThreshold: number): number {
  return (
    WEEKLY_CHALLENGE_MILESTONES.find((m) => m.clips === clipThreshold)?.reward ?? 0
  );
}
