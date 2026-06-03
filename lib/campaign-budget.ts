/**
 * Shared performance-campaign budget thresholds + usage math (pure, no React).
 *
 * Pool accounting: used = budget_reserved + budget_paid; remaining = pool - used.
 *   - At >= 90% used, new clip submissions are blocked (soft gate: API pre-check
 *     + DB BEFORE INSERT trigger trg_clips_submission_gates).
 *   - At 100% used, the campaign auto-closes to 'exhausted' (atomic in
 *     close_performance_campaign_if_exhausted; also reconciled on rollup UPDATE
 *     and via reconcile_exhausted_performance_campaigns worker sweep).
 */

export const BUDGET_BLOCK_PCT = 0.9; // block new submissions at/above this

/** Epsilon for pool exhaustion (matches SQL 0.005). */
export const BUDGET_EXHAUSTED_EPSILON = 0.005;

/** Platform's cut of a performance pool. The remaining (1 - fee) funds creators. */
export const PLATFORM_FEE_PCT = 0.1;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Split a brand's total funding into platform fee + creator-available pool. */
export function feeBreakdown(
  total: number,
  feePct: number = PLATFORM_FEE_PCT
): { total: number; fee: number; creators: number; feePct: number } {
  const t = Math.max(Number(total) || 0, 0);
  const fee = round2(t * feePct);
  return { total: t, fee, creators: round2(t - fee), feePct };
}

export interface BudgetUsage {
  /** Effective pool creators can earn from (available_pool when set, else budget_pool). */
  pool: number;
  /** Total the brand funded (budget_pool). */
  totalFunded: number;
  /** Platform fee retained from the funded amount. */
  platformFee: number;
  reserved: number;
  paid: number;
  used: number;
  remaining: number;
  /** Fraction of the (effective) creator pool used, clamped to [0, 1]. */
  pct: number;
}

export function budgetUsage(c: {
  budget_pool?: number | null;
  budget_reserved?: number | null;
  budget_paid?: number | null;
  available_pool?: number | null;
}): BudgetUsage {
  const totalFunded = Number(c.budget_pool ?? 0);
  // Creators earn from available_pool (post-fee) when present; legacy campaigns
  // without it fall back to the full budget_pool (no retroactive fee).
  const pool = c.available_pool != null ? Number(c.available_pool) : totalFunded;
  const platformFee = Math.max(round2(totalFunded - pool), 0);
  const reserved = Number(c.budget_reserved ?? 0);
  const paid = Number(c.budget_paid ?? 0);
  const used = reserved + paid;
  const remaining = Math.max(pool - used, 0);
  const pct = pool > 0 ? Math.min(used / pool, 1) : 0;
  return { pool, totalFunded, platformFee, reserved, paid, used, remaining, pct };
}

/** True once the pool is at/above the 90% submission-block threshold. */
export function isNearlyFull(u: BudgetUsage): boolean {
  return u.pool > 0 && u.pct >= BUDGET_BLOCK_PCT;
}

/** True when the creator pool is fully consumed (100% hard gate). */
export function isPoolExhausted(u: BudgetUsage): boolean {
  return u.pool > 0 && u.remaining <= BUDGET_EXHAUSTED_EPSILON;
}

/** True when new clip submissions must be blocked (90% soft or 100% hard). */
export function blocksClipSubmission(u: BudgetUsage, status?: string | null): boolean {
  if (status && status !== "open" && status !== "in_progress") return true;
  return isPoolExhausted(u) || isNearlyFull(u);
}
