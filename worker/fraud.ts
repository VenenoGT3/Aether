/**
 * Basic anti-fraud velocity check (simple Phase 4 version).
 *
 * View counts that jump implausibly between syncs are the cheapest fraud signal
 * (bot farms, re-uploaded viral clips, manipulated counters). This is a pure
 * function so it can be unit-tested without Redis/Supabase. A flagged clip is
 * later set to 'disqualified' by the worker, which stops it accruing earnings
 * (record_clip_earning only pays 'tracking' clips).
 */

/** A single sync may not multiply views by more than this factor. */
export const MAX_GROWTH_FACTOR = 50;
/** A single sync may not add more than this many absolute views. */
export const MAX_ABSOLUTE_JUMP = 5_000_000;
/** Don't apply the factor check below this baseline (early small counts are noisy). */
const FACTOR_CHECK_MIN_BASELINE = 1_000;

export interface VelocityResult {
  suspicious: boolean;
  reason?: string;
}

export function checkVelocity(
  previousViews: number,
  newViews: number
): VelocityResult {
  const delta = newViews - previousViews;

  // Counts should never decrease materially; a large drop signals a bad read.
  if (delta < 0) {
    return {
      suspicious: false, // not fraud, just a noisy/declining read — ignore the delta
      reason: "view count decreased; ignoring",
    };
  }

  if (delta > MAX_ABSOLUTE_JUMP) {
    return {
      suspicious: true,
      reason: `absolute view jump ${delta.toLocaleString()} exceeds ${MAX_ABSOLUTE_JUMP.toLocaleString()}`,
    };
  }

  if (
    previousViews >= FACTOR_CHECK_MIN_BASELINE &&
    newViews > previousViews * MAX_GROWTH_FACTOR
  ) {
    return {
      suspicious: true,
      reason: `views grew ${(newViews / previousViews).toFixed(1)}x in one sync (max ${MAX_GROWTH_FACTOR}x)`,
    };
  }

  return { suspicious: false };
}
