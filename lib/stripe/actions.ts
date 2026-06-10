"use server";

import { randomUUID } from "crypto";
import { getServerUser, createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { centsEqual, centsGte, fromCents, sumMoney, toCents } from "@/lib/money";
import {
  createStripeExpressAccount,
  createEscrowPaymentIntent,
  releaseEscrowPayment,
} from "./connect";
import { PROFILE_PK_COLUMN } from "@/lib/supabase/profile";
import { WITHDRAWAL_MIN, WITHDRAWAL_FEE_PCT } from "@/lib/withdrawal";
import {
  assertBusinessCanFundEscrow,
  assertBusinessCanReleaseEscrow,
  AuthorizationError,
} from "@/lib/campaign-lifecycle";
import { apiLog } from "@/lib/api/trace-log";
import { requestLogger, endRequest } from "@/lib/logger";
import {
  safeParse,
  uuidField,
  moneyAmountField,
  originUrlField,
  roleField,
} from "@/lib/validate";
import { z } from "zod";
import {
  toActionError,
  reportError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  AppError,
} from "@/lib/errors";

/**
 * Server Action: Initialize Stripe Onboarding for Business or Influencer
 */
export async function startStripeOnboardingAction(
  role: "business" | "influencer",
  origin: string
) {
  try {
    // Validate untrusted client input before any Stripe / DB work.
    const input = safeParse(
      z.object({ role: roleField, origin: originUrlField }),
      { role, origin }
    );
    if (!input.ok) return { success: false, error: input.error };
    role = input.data.role;
    origin = input.data.origin;

    const user = await getServerUser();
    if (!user) throw new UnauthorizedError();
    const userId = user.user_id;

    const { url, accountId } = await createStripeExpressAccount(
      userId,
      role,
      origin
    );

    const supabase = await createClient();
    const { error: accountErr } = await supabase.rpc("set_stripe_connect_account", {
      p_account_id: accountId,
    });
    if (accountErr) throw accountErr;

    return { success: true, url, accountId };
  } catch (error) {
    return toActionError(error, { action: "startStripeOnboarding" });
  }
}

/**
 * Server Action: Fund campaign escrow
 */
export async function fundEscrowAction(
  participationId: string,
  amount: number
) {
  try {
    const amountCheck = safeParse(moneyAmountField, amount);
    if (!amountCheck.ok) return { success: false, error: amountCheck.error };
    amount = amountCheck.data;

    const idCheck = safeParse(uuidField, participationId);
    if (!idCheck.ok) return { success: false, error: idCheck.error };
    participationId = idCheck.data;

    const user = await getServerUser();
    assertBusinessCanFundEscrow(user?.role);

    const supabase = await createClient();

    const { data: participation, error: partErr } = await supabase
      .from("participations")
      .select("id, proposed_payout, status, campaign:campaign_id(id, business_id, status, campaign_type)")
      .eq("id", participationId)
      .single();

    if (partErr || !participation) {
      throw new NotFoundError("Participation agreement not found.", partErr);
    }

    const campaign = Array.isArray(participation.campaign)
      ? participation.campaign[0]
      : participation.campaign;
    if (!campaign || campaign.business_id !== user!.user_id) {
      throw new ForbiddenError("You can only fund escrow for your own campaigns.");
    }

    const requiredAmount = Number(participation.proposed_payout ?? 0);
    if (!Number.isFinite(requiredAmount) || requiredAmount <= 0) {
      throw new ConflictError("This participation does not have a valid payout amount.");
    }
    if (!centsEqual(amount, requiredAmount)) {
      throw new ConflictError("Escrow amount must match the agreed participation payout.");
    }
    amount = requiredAmount;

    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        participation_id: participationId,
        user_id: user!.user_id,
        amount,
        type: "escrow",
        status: "pending",
      })
      .select()
      .single();

    if (txError) throw txError;

    const { clientSecret, paymentIntentId } = await createEscrowPaymentIntent(
      amount,
      {
        participationId,
        transactionId: transaction.id,
      }
    );

    await supabase
      .from("transactions")
      .update({ stripe_payment_intent_id: paymentIntentId })
      .eq("id", transaction.id);

    return {
      success: true,
      clientSecret,
      paymentIntentId,
      transactionId: transaction.id,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { success: false, error: error.message };
    }
    return toActionError(error, { action: "fundEscrow" });
  }
}

/**
 * Server Action: Fund a performance campaign's budget pool.
 *
 * Creates a Stripe PaymentIntent for the full budget_pool and stores it on the
 * campaign. The campaign stays 'draft' (not joinable) until the
 * payment_intent.succeeded webhook flips it to 'open' and sets funded_at — so a
 * performance campaign can never go live without a successful payment.
 */
export async function fundCampaignPoolAction(campaignId: string) {
  try {
    const id = safeParse(uuidField, campaignId);
    if (!id.ok) return { success: false, error: id.error };
    campaignId = id.data;

    const user = await getServerUser();
    assertBusinessCanFundEscrow(user?.role);

    const supabase = await createClient();

    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select("id, business_id, campaign_type, budget_pool, funded_at")
      .eq("id", campaignId)
      .single();

    if (campErr || !campaign) {
      throw new NotFoundError("Campaign not found.", campErr);
    }
    if (campaign.business_id !== user!.user_id) {
      throw new ForbiddenError("You can only fund your own campaigns.");
    }
    if (campaign.campaign_type !== "performance") {
      throw new ConflictError("Only performance campaigns are funded via a budget pool.");
    }
    if (campaign.funded_at) {
      throw new ConflictError("This campaign pool is already funded.");
    }

    const amount = Number(campaign.budget_pool || 0);
    if (amount <= 0) {
      throw new AppError("Campaign budget pool must be greater than zero.", { code: "validation" });
    }

    const { clientSecret, paymentIntentId } = await createEscrowPaymentIntent(
      amount,
      { campaignId, kind: "pool_funding" }
    );

    const { error: fundingErr } = await supabase.rpc("record_pool_funding_intent", {
      p_campaign_id: campaignId,
      p_payment_intent_id: paymentIntentId,
    });

    if (fundingErr) throw fundingErr;

    return {
      success: true,
      clientSecret,
      paymentIntentId,
      amount,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { success: false, error: error.message };
    }
    return toActionError(error, { action: "fundCampaignPool" });
  }
}

/**
 * Server Action: Approve work and release funds from escrow to influencer
 */
export async function releaseEscrowAction(participationId: string) {
  try {
    const id = safeParse(uuidField, participationId);
    if (!id.ok) return { success: false, error: id.error };
    participationId = id.data;

    const user = await getServerUser();
    assertBusinessCanReleaseEscrow(user?.role);

    const supabase = await createClient();

    const { data: participation, error: partError } = await supabase
      .from("participations")
      .select(
        `
        *,
        campaign:campaign_id (*),
        influencer:influencer_id (*)
      `
      )
      .eq("id", participationId)
      .single();

    if (partError || !participation) {
      throw new NotFoundError("Participation agreement not found.", partError);
    }

    const { data: influencerProfile, error: profError } = await supabase
      .from("profiles")
      .select("stripe_connect_id, stripe_onboarding_completed")
      .eq(PROFILE_PK_COLUMN, participation.influencer_id)
      .single();

    if (profError || !influencerProfile?.stripe_connect_id) {
      throw new ConflictError("Influencer has not linked a Stripe payout account yet.", profError);
    }

    const amount = Number(participation.proposed_payout);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ConflictError("This participation does not have a valid payout amount.");
    }

    const { data: releases, error: releaseQueryErr } = await supabase
      .from("transactions")
      .select("id")
      .eq("participation_id", participationId)
      .eq("type", "release")
      .eq("status", "succeeded")
      .limit(1);
    if (releaseQueryErr) throw releaseQueryErr;
    if ((releases ?? []).length > 0) {
      throw new ConflictError("Escrow has already been released for this participation.");
    }

    const { data: escrows, error: escrowQueryErr } = await supabase
      .from("transactions")
      .select("amount")
      .eq("participation_id", participationId)
      .eq("type", "escrow")
      .eq("status", "succeeded");
    if (escrowQueryErr) throw escrowQueryErr;
    const funded = sumMoney((escrows ?? []).map((tx) => Number(tx.amount ?? 0)));
    if (!centsGte(funded, amount)) {
      throw new ConflictError("Escrow must be fully funded before release.");
    }

    const admin = createAdminClient();

    const { success, transferId } = await releaseEscrowPayment(
      amount,
      influencerProfile.stripe_connect_id,
      {
        kind: "escrow_release",
        campaignId: participation.campaign_id,
        participationId,
      },
      `escrow_release_${participationId}`
    );

    if (!success) {
      throw new ExternalServiceError("The payout transfer could not be completed. Please try again.");
    }

    // Ledger row + participation + campaign completion in ONE transaction —
    // a failure can no longer leave money state half-updated.
    const { data: completed, error: completeErr } = await admin.rpc(
      "complete_escrow_release",
      {
        p_participation_id: participationId,
        p_business_user_id: user!.user_id,
        p_amount: amount,
        p_transfer_id: transferId,
      }
    );
    if (completeErr) {
      // 23505 = the partial unique index caught a concurrent release. The
      // transfer is idempotent (stable key), so the money moved exactly once —
      // the other writer owns the ledger row and the completion updates.
      if (completeErr.code === "23505") {
        throw new ConflictError("Escrow has already been released for this participation.");
      }
      throw completeErr;
    }
    if (completed !== true) {
      throw new NotFoundError("Participation agreement not found.");
    }

    return { success: true, transferId };
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { success: false, error: error.message };
    }
    return toActionError(error, { action: "releaseEscrow" });
  }
}

/**
 * Server Action: Creator requests withdrawal/payout of available funds
 */
export async function withdrawFundsAction(amount: number) {
  try {
    const parsed = safeParse(moneyAmountField, amount);
    if (!parsed.ok) return { success: false, error: parsed.error };
    amount = parsed.data;

    const user = await getServerUser();
    if (!user || user.role !== "influencer") {
      throw new ForbiddenError("Only creator accounts can withdraw funds.");
    }

    const supabase = await createClient();

    const ledger = await getTransactionLedgerAction();
    if (!ledger.success || (ledger.availableBalance || 0) < amount) {
      throw new ConflictError("Insufficient available balance.");
    }

    const { error: txError } = await supabase.from("transactions").insert({
      user_id: user.user_id,
      amount,
      type: "payout",
      status: "succeeded",
    });

    if (txError) throw txError;

    return { success: true };
  } catch (error) {
    return toActionError(error, { action: "withdrawFunds" });
  }
}

/**
 * Server Action: creator withdraws their available (approved, cleared-holdback)
 * performance earnings. Atomically claims them into a payout (net = gross - 7%
 * fee), transfers the net to the creator's connected Stripe account, then
 * settles. On transfer failure the claim is released so the balance returns.
 *
 * Safety: request_withdrawal() is auth.uid()-scoped, so this only ever touches
 * the caller's own earnings. Stripe settlement/failure is service-role only and
 * happens after the trusted server observes the transfer outcome.
 */
/**
 * Classify a Stripe transfer error. A DEFINITIVE failure (the transfer was not
 * created — bad account, insufficient platform balance, validation) is safe to
 * release and retry. An UNKNOWN outcome (network/timeout/API error: the transfer
 * MAY have gone through) must NOT release — leave the payout 'processing' for the
 * worker reconciler, which re-issues with the stable idempotency key.
 */
function isUnknownTransferOutcome(err: unknown): boolean {
  const type = (err as { type?: string } | null)?.type;
  // No Stripe error type => raw network/timeout. StripeConnectionError /
  // StripeAPIError => request may or may not have reached/applied at Stripe.
  return !type || type === "StripeConnectionError" || type === "StripeAPIError";
}

export async function requestWithdrawalAction() {
  const traceId = randomUUID();
  // Server action (no proxy/guard): build a request-scoped logger ourselves and
  // measure end-to-end latency from action entry. requestId == traceId so this
  // correlates with the apiLog [ALERT] lines below.
  const startTime = Date.now();

  try {
    const user = await getServerUser();
    if (!user || user.role !== "influencer") {
      return { success: false, error: "Only creator accounts can withdraw." };
    }
    const log = requestLogger({ requestId: traceId, userId: user.user_id }).child({
      route: "withdrawal.request",
    });

    const supabase = await createClient();

    // Must have a connected, onboarded payout account.
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_connect_id, stripe_onboarding_completed")
      .eq(PROFILE_PK_COLUMN, user.user_id)
      .maybeSingle();

    const account = (profile as { stripe_connect_id?: string | null } | null)?.stripe_connect_id;
    const onboarded = (profile as { stripe_onboarding_completed?: boolean } | null)
      ?.stripe_onboarding_completed;
    if (!account || !onboarded) {
      return {
        success: false,
        error: "Connect your payout account with Stripe before withdrawing.",
      };
    }

    const admin = createAdminClient();

    // 1) Atomically claim approved+unclaimed earnings into a payout (advisory
    //    locked + claim-by-id-set in SQL; impossible to double-claim).
    const { data: claimData, error: claimErr } = await supabase.rpc("request_withdrawal", {
      p_min_threshold: WITHDRAWAL_MIN,
      p_fee_pct: WITHDRAWAL_FEE_PCT,
    });
    if (claimErr) {
      apiLog("alert", "withdrawal.claim_failed", {
        traceId,
        userId: user.user_id,
        code: (claimErr as { code?: string }).code,
        error: claimErr.message,
      });
      return { success: false, error: claimErr.message || "Could not start the withdrawal." };
    }
    const claim = (Array.isArray(claimData) ? claimData[0] : claimData) as
      | { out_payout_id: string; out_gross: number | string; out_net: number | string; out_fee: number | string }
      | undefined;
    if (!claim?.out_payout_id) {
      return {
        success: false,
        error: `You need at least $${WITHDRAWAL_MIN} available to withdraw.`,
      };
    }

    const payoutId = claim.out_payout_id;
    const gross = Number(claim.out_gross);
    const net = Number(claim.out_net);
    const fee = Number(claim.out_fee);
    // Stable idempotency key: a retry/reconcile of THIS payout reuses it, so
    // Stripe returns the original transfer instead of paying twice.
    const idempotencyKey = `withdrawal_${payoutId}`;

    // 2) Transfer the NET, then settle. On a DEFINITIVE failure release the
    //    claim (balance returns). On an UNKNOWN outcome leave it 'processing'
    //    for the reconciler — never release into a possible double-pay.
    try {
      const transfer = await releaseEscrowPayment(
        net,
        account,
        { kind: "withdrawal", payoutId },
        idempotencyKey
      );
      const { error: settleErr } = await admin.rpc("mark_payout_paid", {
        p_payout_id: payoutId,
        p_transfer_id: transfer.transferId,
      });
      if (settleErr) {
        // Money moved but the DB didn't record it — leave 'processing' for the
        // reconciler (which re-issues with the same key, gets the same transfer,
        // and settles). Do NOT release.
        apiLog("alert", "withdrawal.settle_failed", {
          traceId,
          payoutId,
          transferId: transfer.transferId,
          error: settleErr.message,
        });
        endRequest(log, { statusCode: 202, startTime, msg: "withdrawal.pending" });
        return {
          success: true,
          gross,
          net,
          fee,
          pending: true,
        };
      }
      apiLog("info", "withdrawal.paid", { traceId, payoutId, gross, fee, net });
      endRequest(log, { statusCode: 200, startTime, msg: "withdrawal.completed" });
      return { success: true, gross, net, fee };
    } catch (transferErr) {
      if (isUnknownTransferOutcome(transferErr)) {
        // Unknown: the transfer may have succeeded. Leave the payout claimed +
        // 'processing'; the worker reconciler resolves it idempotently.
        apiLog("alert", "withdrawal.transfer_unknown", {
          traceId,
          payoutId,
          error: transferErr instanceof Error ? transferErr.message : String(transferErr),
        });
        return {
          success: false,
          error: "Your withdrawal is processing. We'll confirm it shortly — please don't retry yet.",
        };
      }
      // Definitive failure: nothing was transferred — safe to release & retry.
      const { error: failErr } = await admin.rpc("mark_payout_failed", { p_payout_id: payoutId });
      if (failErr) {
        apiLog("alert", "withdrawal.release_failed", {
          traceId,
          payoutId,
          error: failErr.message,
        });
      }
      apiLog("warn", "withdrawal.transfer_failed", {
        traceId,
        payoutId,
        error: transferErr instanceof Error ? transferErr.message : String(transferErr),
      });
      return {
        success: false,
        error: "The payout failed and your balance was released — please try again.",
      };
    }
  } catch (error) {
    // Keep the [ALERT] paging signal, but return a safe (generic) message and
    // let toActionError capture the full error to Sentry.
    apiLog("alert", "withdrawal.unexpected", {
      traceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return toActionError(error, { action: "requestWithdrawal", traceId });
  }
}

/**
 * Server Action: Fetch transaction ledger and compute pending & available balances
 */
export async function getTransactionLedgerAction() {
  try {
    const user = await getServerUser();
    if (!user) throw new UnauthorizedError();

    const supabase = await createClient();

    // RLS scopes rows to the caller. Capped: an unbounded ledger fetch grows
    // linearly with account age and this action runs on every wallet view.
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        participation:participation_id (
          *,
          campaign:campaign_id (*)
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    // One pass to index released participations — the per-row `.some()` scan
    // this replaces was O(n²) over the ledger.
    const releasedParticipations = new Set<string>();
    transactions?.forEach((tx) => {
      if (tx.type === "release" && tx.status === "succeeded" && tx.participation_id) {
        releasedParticipations.add(tx.participation_id as string);
      }
    });

    // Accumulate in integer cents so a long ledger can't drift the balance.
    let availableCents = 0;
    let pendingCents = 0;

    transactions?.forEach((tx) => {
      const amt = toCents(Number(tx.amount));
      if (!Number.isFinite(amt)) return;
      if (tx.status !== "succeeded") return;

      // LEGACY (fixed-fee) wallet. Performance-clipping payouts are written by
      // the worker (mark_payout_paid) and carry a payout_id; they represent
      // earnings already paid out and are surfaced on the creator's
      // "Clips & Earnings" page. Exclude them here so they don't get counted as
      // fixed-fee wallet withdrawals (which would drive the balance negative).
      if ((tx as { payout_id?: string | null }).payout_id) return;

      if (user.role === "influencer") {
        if (tx.type === "release" || tx.type === "bonus") {
          availableCents += amt;
        } else if (tx.type === "payout") {
          availableCents -= amt;
        } else if (tx.type === "escrow") {
          if (!releasedParticipations.has(tx.participation_id as string)) {
            pendingCents += amt;
          }
        }
      } else {
        if (tx.type === "escrow") {
          if (!releasedParticipations.has(tx.participation_id as string)) {
            pendingCents += amt;
          }
        } else if (tx.type === "release") {
          availableCents += amt;
        }
      }
    });

    return {
      success: true,
      transactions,
      availableBalance: fromCents(availableCents),
      pendingBalance: fromCents(pendingCents),
    };
  } catch (error) {
    // Capture full detail internally; return a safe message. (Keep this action's
    // existing return shape — its consumer reads fields without a success guard.)
    reportError(error, { action: "getTransactionLedger" });
    return { success: false, error: "Could not load your wallet. Please try again." };
  }
}
