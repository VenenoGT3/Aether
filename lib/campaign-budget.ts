/**
 * Shared performance-campaign budget thresholds + usage math (pure, no React).
 *
 * Pool accounting: used = budget_reserved + budget_paid; remaining = pool - used.
 *   - At >= 90% used, new clip submissions are blocked (soft gate at submit).
 *   - At 100% used, the campaign auto-closes to 'exhausted' (enforced atomically
 *     in record_clip_earning under the campaign row lock — see the migration).
 */

export const BUDGET_BLOCK_PCT = 0.9; // block new submissions at/above this

export interface BudgetUsage {
  pool: number;
  reserved: number;
  paid: number;
  used: number;
  remaining: number;
  /** Fraction of the pool used, clamped to [0, 1]. */
  pct: number;
}

export function budgetUsage(c: {
  budget_pool?: number | null;
  budget_reserved?: number | null;
  budget_paid?: number | null;
}): BudgetUsage {
  const pool = Number(c.budget_pool ?? 0);
  const reserved = Number(c.budget_reserved ?? 0);
  const paid = Number(c.budget_paid ?? 0);
  const used = reserved + paid;
  const remaining = Math.max(pool - used, 0);
  const pct = pool > 0 ? Math.min(used / pool, 1) : 0;
  return { pool, reserved, paid, used, remaining, pct };
}

/** True once the pool is at/above the 90% submission-block threshold. */
export function isNearlyFull(u: BudgetUsage): boolean {
  return u.pool > 0 && u.pct >= BUDGET_BLOCK_PCT;
}
