import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "./supabase";
import { transferToCreator } from "./stripe";
import { getMinPayoutThreshold, getViewHoldbackHours } from "./env";
import {
  selectPayableCreators,
  type EarningAmountRow,
} from "./payout-logic";

export interface PayoutBatchSummary {
  promoted: number;
  creatorsConsidered: number;
  payoutsCreated: number;
  payoutsPaid: number;
  payoutsFailed: number;
  totalPaid: number;
}

interface PayoutClaim {
  out_payout_id: string;
  out_amount: number | string;
}

/**
 * One payout batch:
 *   1. promote 'accrued' -> 'approved' past each campaign's holdback
 *   2. group unclaimed approved earnings by creator (>= threshold)
 *   3. per creator: atomically claim into a payout, transfer, settle/fail
 *
 * Safe to run repeatedly: claiming sets earnings.payout_id (no double-batch),
 * the Stripe transfer is idempotent on the payout id, and a failed transfer
 * releases the claim for the next run.
 */
export async function runPayoutBatch(
  client?: SupabaseClient
): Promise<PayoutBatchSummary> {
  const supabase = client ?? getServiceClient();
  const summary: PayoutBatchSummary = {
    promoted: 0,
    creatorsConsidered: 0,
    payoutsCreated: 0,
    payoutsPaid: 0,
    payoutsFailed: 0,
    totalPaid: 0,
  };

  // 1. Promote earnings past their holdback window.
  const { data: promoted, error: promoteErr } = await supabase.rpc(
    "promote_due_earnings",
    { p_default_holdback_hours: getViewHoldbackHours() }
  );
  if (promoteErr) {
    throw new Error(`[payout] promote_due_earnings failed: ${promoteErr.message}`);
  }
  summary.promoted = Number(promoted ?? 0);

  // 2. Candidate creators with unclaimed approved earnings.
  const { data: rows, error: rowsErr } = await supabase
    .from("earnings")
    .select("creator_id, amount")
    .eq("status", "approved")
    .is("payout_id", null);
  if (rowsErr) {
    throw new Error(`[payout] failed to load approved earnings: ${rowsErr.message}`);
  }

  const threshold = getMinPayoutThreshold();
  const payable = selectPayableCreators((rows ?? []) as EarningAmountRow[], threshold);
  summary.creatorsConsidered = payable.length;

  for (const { creatorId } of payable) {
    // 3. Atomically claim this creator's earnings into a payout.
    const { data: claimData, error: claimErr } = await supabase.rpc(
      "create_payout_for_creator",
      { p_creator_id: creatorId, p_min_threshold: threshold }
    );
    if (claimErr) {
      console.error(`[payout] claim failed for ${creatorId}: ${claimErr.message}`);
      continue;
    }

    const claim = (Array.isArray(claimData) ? claimData[0] : claimData) as
      | PayoutClaim
      | undefined;
    if (!claim?.out_payout_id) {
      continue; // fell below threshold between query and claim
    }

    const payoutId = claim.out_payout_id;
    const amount = Number(claim.out_amount);
    summary.payoutsCreated += 1;

    // 4. Resolve the creator's connected Stripe account.
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_connect_id")
      .eq("user_id", creatorId)
      .maybeSingle();

    const account = (profile as { stripe_connect_id?: string | null } | null)
      ?.stripe_connect_id;
    if (!account) {
      // Can't pay without a payout account — release the claim to retry later.
      await supabase.rpc("mark_payout_failed", { p_payout_id: payoutId });
      summary.payoutsFailed += 1;
      console.warn(
        `[payout] creator ${creatorId} has no Stripe account; payout released`
      );
      continue;
    }

    // 5. Transfer (idempotent on payout id), then settle or fail.
    try {
      const { transferId, mock } = await transferToCreator(amount, account, payoutId, {
        payoutId,
        creatorId,
      });
      const { error: paidErr } = await supabase.rpc("mark_payout_paid", {
        p_payout_id: payoutId,
        p_transfer_id: transferId,
      });
      if (paidErr) {
        throw new Error(`mark_payout_paid failed: ${paidErr.message}`);
      }
      summary.payoutsPaid += 1;
      summary.totalPaid += amount;
      console.log(
        `[payout] paid ${creatorId} $${amount.toFixed(2)}${mock ? " (mock)" : ""} -> ${transferId}`
      );
    } catch (err) {
      await supabase.rpc("mark_payout_failed", { p_payout_id: payoutId });
      summary.payoutsFailed += 1;
      console.error(
        `[payout] transfer/settle failed for ${creatorId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log("[payout] batch complete:", summary);
  return summary;
}
