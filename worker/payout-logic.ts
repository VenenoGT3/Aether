/**
 * Pure, side-effect-free payout/reversal helpers. The authoritative money
 * mutations live in SQL (create_payout_for_creator, mark_payout_paid, the
 * reverse_earnings_on_clip_block trigger); these helpers cover the decision
 * logic that's cheap to unit-test and document the policy.
 */

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface EarningAmountRow {
  creator_id: string;
  amount: number | string;
}

export interface PayableCreator {
  creatorId: string;
  total: number;
  count: number;
}

/**
 * Group unclaimed approved earnings by creator and keep only those whose total
 * meets the minimum payout threshold.
 */
export function selectPayableCreators(
  rows: EarningAmountRow[],
  minThreshold: number
): PayableCreator[] {
  const byCreator = new Map<string, { total: number; count: number }>();

  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    const current = byCreator.get(row.creator_id) ?? { total: 0, count: 0 };
    current.total += amount;
    current.count += 1;
    byCreator.set(row.creator_id, current);
  }

  const payable: PayableCreator[] = [];
  for (const [creatorId, { total, count }] of byCreator) {
    if (round2(total) >= minThreshold) {
      payable.push({ creatorId, total: round2(total), count });
    }
  }
  return payable;
}

export interface EarningStatusRow {
  status: string;
  amount: number | string;
}

/**
 * Reversal policy mirror: only UNPAID ('accrued') earnings are reversible when
 * a clip is rejected/disqualified. 'approved' (in payout pipeline) and 'paid'
 * are never reversed. Matches the reverse_earnings_on_clip_block trigger.
 */
export function sumReversibleAmount(rows: EarningStatusRow[]): number {
  return round2(
    rows
      .filter((r) => r.status === "accrued")
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  );
}
