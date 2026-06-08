import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "./supabase";
import { transferToCreator } from "./stripe";
import {
  autoPayoutsEnabled,
  getMinPayoutThreshold,
  getViewHoldbackHours,
  getWithdrawalReconcileStuckMinutes,
  payoutSafetyBlocked,
} from "./env";
import { log, errMessage } from "./logger";
import { recordPayoutFailures } from "./metrics";
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
 * Unknown transfer outcome = the transfer MAY have applied (network/timeout/API
 * error). We must not release the claim into a possible double-pay; leave it for
 * the next reconcile pass instead. Definitive errors are safe to release.
 */
function isUnknownTransferOutcome(err: unknown): boolean {
  const type = (err as { type?: string } | null)?.type;
  return !type || type === "StripeConnectionError" || type === "StripeAPIError";
}

/**
 * Recover withdrawal payouts stuck in 'processing' (transfer outcome unknown, or
 * the transfer succeeded but the synchronous settle failed). Re-issues the
 * transfer with the STABLE idempotency key withdrawal_<payoutId> — Stripe
 * returns the original transfer if it already happened, so this can never
 * double-pay — then settles, or releases the claim on a definitive failure.
 * Idempotent and safe to run at the start of every payout batch.
 */
export async function reconcileStuckWithdrawals(
  client?: SupabaseClient
): Promise<number> {
  const supabase = client ?? getServiceClient();
  const cutoff = new Date(
    Date.now() - getWithdrawalReconcileStuckMinutes() * 60_000
  ).toISOString();

  const { data: stuck, error } = await supabase
    .from("payouts")
    .select("id, creator_id, amount")
    .eq("status", "processing")
    .not("fee_amount", "is", null) // manual withdrawals carry a fee
    .lt("created_at", cutoff)
    .limit(100);
  if (error) {
    log.warn("withdrawal.reconcile.query_error", { error: error.message });
    return 0;
  }

  let recovered = 0;
  for (const p of (stuck ?? []) as {
    id: string;
    creator_id: string;
    amount: number | string;
  }[]) {
    const payoutId = p.id;
    const amount = Number(p.amount);

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_connect_id")
      .eq("user_id", p.creator_id)
      .maybeSingle();
    const account = (profile as { stripe_connect_id?: string | null } | null)
      ?.stripe_connect_id;
    if (!account) {
      await supabase.rpc("mark_payout_failed", { p_payout_id: payoutId });
      log.alert("withdrawal.reconcile.no_account", { payoutId, creatorId: p.creator_id });
      continue;
    }

    try {
      const { transferId } = await transferToCreator(amount, account, `withdrawal_${payoutId}`, {
        payoutId,
        kind: "withdrawal_reconcile",
      });
      const { error: paidErr } = await supabase.rpc("mark_payout_paid", {
        p_payout_id: payoutId,
        p_transfer_id: transferId,
      });
      if (paidErr) {
        // A terminal-state guard rejection here means the payout was already
        // failed/settled elsewhere — surface it, but do not release (money moved).
        log.alert("withdrawal.reconcile.settle_rejected", {
          payoutId,
          transferId,
          code: (paidErr as { code?: string }).code,
          error: paidErr.message,
        });
        throw new Error(`mark_payout_paid failed: ${paidErr.message}`);
      }
      recovered += 1;
      log.info("withdrawal.reconcile.settled", {
        payoutId,
        amount: amount.toFixed(2),
        transferId,
      });
    } catch (err) {
      if (isUnknownTransferOutcome(err)) {
        // Still unknown — leave 'processing'; the next pass retries idempotently.
        log.alert("withdrawal.reconcile.still_unknown", { payoutId, error: errMessage(err) });
      } else {
        const { error: failErr } = await supabase.rpc("mark_payout_failed", {
          p_payout_id: payoutId,
        });
        if (failErr) {
          log.alert("withdrawal.reconcile.release_failed", { payoutId, error: failErr.message });
        }
        log.alert("withdrawal.reconcile.failed_released", { payoutId, error: errMessage(err) });
      }
    }
  }

  if (recovered > 0) log.info("withdrawal.reconcile.done", { recovered });
  return recovered;
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

  // SAFETY GUARD (defense-in-depth): refuse to run real payouts without a
  // trusted live view source. Startup already hard-fails when none are
  // configured; this also halts the batch if providers are removed at runtime.
  if (payoutSafetyBlocked()) {
    log.alert("payout.blocked.no_view_source", {
      reason: "no trusted view provider configured — refusing to run real payouts on unverified views",
      hint: "configure YOUTUBE_DATA_API_KEY to restore YouTube-only live view tracking",
    });
    return summary; // all zeros — nothing promoted, claimed, or transferred
  }

  const threshold = getMinPayoutThreshold();
  const holdback = getViewHoldbackHours();
  log.info("payout.batch.start", { threshold, holdbackHours: holdback });

  // 0. Recover any creator-initiated withdrawals stuck in 'processing' (transfer
  //    outcome unknown / settle failed). Idempotent; never blocks the batch.
  try {
    await reconcileStuckWithdrawals(supabase);
  } catch (err) {
    log.error("withdrawal.reconcile.error", { error: errMessage(err) });
  }

  // 1. Promote earnings past their holdback window.
  const { data: promoted, error: promoteErr } = await supabase.rpc(
    "promote_due_earnings",
    { p_default_holdback_hours: holdback }
  );
  if (promoteErr) {
    throw new Error(`[payout] promote_due_earnings failed: ${promoteErr.message}`);
  }
  summary.promoted = Number(promoted ?? 0);

  // Payouts are creator-initiated by default (manual withdrawals). The batch
  // still promotes accrued→approved above so balances become withdrawable, but
  // it only auto-pays when explicitly enabled.
  if (!autoPayoutsEnabled()) {
    log.info("payout.auto_disabled", {
      promoted: summary.promoted,
      note: "manual withdrawals enabled (set WORKER_AUTO_PAYOUTS=true to auto-pay)",
    });
    return summary;
  }

  // 2. Candidate creators with unclaimed approved earnings.
  const { data: rows, error: rowsErr } = await supabase
    .from("earnings")
    .select("creator_id, amount")
    .eq("status", "approved")
    .is("payout_id", null);
  if (rowsErr) {
    throw new Error(`[payout] failed to load approved earnings: ${rowsErr.message}`);
  }

  const payable = selectPayableCreators((rows ?? []) as EarningAmountRow[], threshold);
  summary.creatorsConsidered = payable.length;
  log.info("payout.candidates", {
    promoted: summary.promoted,
    payableCreators: payable.length,
  });

  for (const { creatorId } of payable) {
    // 3. Atomically claim this creator's earnings into a payout.
    const { data: claimData, error: claimErr } = await supabase.rpc(
      "create_payout_for_creator",
      { p_creator_id: creatorId, p_min_threshold: threshold }
    );
    if (claimErr) {
      log.error("payout.claim.error", { creatorId, error: claimErr.message });
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
      log.warn("payout.no_account", { creatorId, payoutId, amount });
      continue;
    }

    // 5. Transfer (idempotent on payout id), then settle or fail.
    try {
      const { transferId } = await transferToCreator(amount, account, payoutId, {
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
      log.info("payout.paid", {
        creatorId,
        payoutId,
        amount: amount.toFixed(2),
        transferId,
      });
    } catch (err) {
      if (isUnknownTransferOutcome(err)) {
        log.alert("payout.transfer.unknown", {
          creatorId,
          payoutId,
          amount: amount.toFixed(2),
          note: "leaving payout processing for idempotent reconciliation; claim was not released",
          error: errMessage(err),
        });
      } else {
        await supabase.rpc("mark_payout_failed", { p_payout_id: payoutId });
        summary.payoutsFailed += 1;
        log.error("payout.transfer.error", {
          creatorId,
          payoutId,
          amount: amount.toFixed(2),
          error: errMessage(err),
        });
      }
    }
  }

  // Any failed payout in a batch is alert-worthy (creator went unpaid: no Stripe
  // account, transfer error, or settlement failure). The claim was released so
  // the next batch retries, but someone should look.
  if (summary.payoutsFailed > 0) {
    recordPayoutFailures(summary.payoutsFailed);
    log.alert("payout.batch.failures", {
      payoutsFailed: summary.payoutsFailed,
      payoutsPaid: summary.payoutsPaid,
      creatorsConsidered: summary.creatorsConsidered,
    });
  }

  log.info("payout.batch.done", { ...summary, totalPaid: summary.totalPaid.toFixed(2) });
  return summary;
}
