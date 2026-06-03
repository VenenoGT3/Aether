"use server";

import { randomUUID } from "crypto";
import { getServerUser, createClient } from "@/lib/supabase/server";
import {
  createStripeExpressAccount,
  createEscrowPaymentIntent,
  releaseEscrowPayment,
} from "./connect";
import { isMockMode } from "@/lib/env";
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

    const isMock = isMockMode;

    let userId = "mock-user-id";
    if (!isMock) {
      const user = await getServerUser();
      if (!user) throw new Error("Unauthorized");
      userId = user.user_id;
    }

    const { url, accountId } = await createStripeExpressAccount(
      userId,
      role,
      origin
    );

    if (!isMock) {
      const supabase = await createClient();
      await supabase
        .from("profiles")
        .update({
          stripe_connect_id: accountId,
          stripe_onboarding_completed: false,
        })
        .eq(PROFILE_PK_COLUMN, userId);
    }

    return { success: true, url, accountId };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to start onboarding";
    console.error("Error in startStripeOnboardingAction:", error);
    return { success: false, error: message };
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
    // Amount is mode-agnostic; validate it always. (Mock ids aren't UUIDs, so
    // the UUID check runs only in real mode, after the mock early-return.)
    const amountCheck = safeParse(moneyAmountField, amount);
    if (!amountCheck.ok) return { success: false, error: amountCheck.error };
    amount = amountCheck.data;

    const isMock = isMockMode;

    if (isMock) {
      return { success: true, isMock: true };
    }

    const idCheck = safeParse(uuidField, participationId);
    if (!idCheck.ok) return { success: false, error: idCheck.error };
    participationId = idCheck.data;

    const user = await getServerUser();
    assertBusinessCanFundEscrow(user?.role);

    const supabase = await createClient();

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
      isMock: false,
    };
  } catch (error: unknown) {
    const message =
      error instanceof AuthorizationError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fund escrow";
    console.error("Error in fundEscrowAction:", error);
    return { success: false, error: message };
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
    if (isMockMode) {
      // Mock: no real charge; the client simulates activation. (Mock ids are not
      // UUIDs, so the UUID check below runs in real mode only.)
      return { success: true, isMock: true as const };
    }

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
      throw new Error("Campaign not found.");
    }
    if (campaign.business_id !== user!.user_id) {
      throw new Error("You can only fund your own campaigns.");
    }
    if (campaign.campaign_type !== "performance") {
      throw new Error("Only performance campaigns are funded via a budget pool.");
    }
    if (campaign.funded_at) {
      throw new Error("This campaign pool is already funded.");
    }

    const amount = Number(campaign.budget_pool || 0);
    if (amount <= 0) {
      throw new Error("Campaign budget pool must be greater than zero.");
    }

    const { clientSecret, paymentIntentId } = await createEscrowPaymentIntent(
      amount,
      { campaignId, kind: "pool_funding" }
    );

    await supabase
      .from("campaigns")
      .update({ funding_payment_intent_id: paymentIntentId })
      .eq("id", campaignId);

    return {
      success: true,
      clientSecret,
      paymentIntentId,
      amount,
      isMock: false as const,
    };
  } catch (error: unknown) {
    const message =
      error instanceof AuthorizationError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to fund campaign pool";
    console.error("Error in fundCampaignPoolAction:", error);
    return { success: false, error: message };
  }
}

/**
 * Server Action: Approve work and release funds from escrow to influencer
 */
export async function releaseEscrowAction(participationId: string) {
  try {
    const isMock = isMockMode;

    if (isMock) {
      return { success: true, isMock: true };
    }

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
      throw new Error("Participation agreement not found.");
    }

    const { data: influencerProfile, error: profError } = await supabase
      .from("profiles")
      .select("stripe_connect_id, stripe_onboarding_completed")
      .eq(PROFILE_PK_COLUMN, participation.influencer_id)
      .single();

    if (profError || !influencerProfile?.stripe_connect_id) {
      throw new Error("Influencer has not linked a Stripe payout account yet.");
    }

    const amount = Number(participation.proposed_payout);
    const { success, transferId } = await releaseEscrowPayment(
      amount,
      influencerProfile.stripe_connect_id,
      participation.campaign_id
    );

    if (!success) throw new Error("Stripe Connect transfer failed.");

    await supabase.from("transactions").insert({
      participation_id: participationId,
      user_id: user!.user_id,
      amount,
      type: "release",
      status: "succeeded",
      stripe_payment_intent_id: transferId,
    });

    await supabase
      .from("participations")
      .update({
        status: "completed",
        actual_payout: amount,
      })
      .eq("id", participationId);

    await supabase
      .from("campaigns")
      .update({ status: "completed" })
      .eq("id", participation.campaign_id);

    return { success: true, transferId, isMock: false };
  } catch (error: unknown) {
    const message =
      error instanceof AuthorizationError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to release escrow";
    console.error("Error in releaseEscrowAction:", error);
    return { success: false, error: message };
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

    const isMock = isMockMode;

    if (isMock) {
      return { success: true, isMock: true };
    }

    const user = await getServerUser();
    if (!user || user.role !== "influencer") {
      throw new Error("Unauthorized. Only creator accounts can withdraw funds.");
    }

    const supabase = await createClient();

    const ledger = await getTransactionLedgerAction();
    if (!ledger.success || (ledger.availableBalance || 0) < amount) {
      throw new Error("Insufficient available balance.");
    }

    const { error: txError } = await supabase.from("transactions").insert({
      user_id: user.user_id,
      amount,
      type: "payout",
      status: "succeeded",
    });

    if (txError) throw txError;

    return { success: true, isMock: false };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to withdraw funds";
    console.error("Error in withdrawFundsAction:", error);
    return { success: false, error: message };
  }
}

/**
 * Server Action: creator withdraws their available (approved, cleared-holdback)
 * performance earnings. Atomically claims them into a payout (net = gross - 7%
 * fee), transfers the net to the creator's connected Stripe account, then
 * settles. On transfer failure the claim is released so the balance returns.
 *
 * Safety: request_withdrawal()/settle_withdrawal()/fail_withdrawal() are
 * auth.uid()-scoped, so this only ever touches the caller's own earnings, and
 * the earnings.payout_id claim makes double-withdrawal impossible.
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
  // Mock mode is handled client-side (balances live in localStorage).
  if (isMockMode) {
    return { success: true, isMock: true } as const;
  }

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
      const transfer = await releaseEscrowPayment(net, account, idempotencyKey, idempotencyKey);
      const { error: settleErr } = await supabase.rpc("settle_withdrawal", {
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
          isMock: false,
          gross,
          net,
          fee,
          pending: true,
        };
      }
      apiLog("info", "withdrawal.paid", { traceId, payoutId, gross, fee, net });
      endRequest(log, { statusCode: 200, startTime, msg: "withdrawal.completed" });
      return { success: true, isMock: false, gross, net, fee };
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
      const { error: failErr } = await supabase.rpc("fail_withdrawal", { p_payout_id: payoutId });
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to withdraw funds";
    apiLog("alert", "withdrawal.unexpected", {
      traceId,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * Server Action: Fetch transaction ledger and compute pending & available balances
 */
export async function getTransactionLedgerAction() {
  try {
    const isMock = isMockMode;

    if (isMock) {
      return {
        success: true,
        transactions: [],
        availableBalance: 5800,
        pendingBalance: 4500,
        isMock: true,
      };
    }

    const user = await getServerUser();
    if (!user) throw new Error("Unauthorized");

    const supabase = await createClient();

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
      .order("created_at", { ascending: false });

    if (error) throw error;

    let availableBalance = 0;
    let pendingBalance = 0;

    transactions?.forEach((tx) => {
      const amt = Number(tx.amount);
      if (tx.status !== "succeeded") return;

      // LEGACY (fixed-fee) wallet. Performance-clipping payouts are written by
      // the worker (mark_payout_paid) and carry a payout_id; they represent
      // earnings already paid out and are surfaced on the creator's
      // "Clips & Earnings" page. Exclude them here so they don't get counted as
      // fixed-fee wallet withdrawals (which would drive the balance negative).
      if ((tx as { payout_id?: string | null }).payout_id) return;

      if (user.role === "influencer") {
        if (tx.type === "release" || tx.type === "bonus") {
          availableBalance += amt;
        } else if (tx.type === "payout") {
          availableBalance -= amt;
        } else if (tx.type === "escrow") {
          const hasRelease = transactions.some(
            (t) =>
              t.participation_id === tx.participation_id &&
              t.type === "release" &&
              t.status === "succeeded"
          );
          if (!hasRelease) {
            pendingBalance += amt;
          }
        }
      } else {
        if (tx.type === "escrow") {
          const hasRelease = transactions.some(
            (t) =>
              t.participation_id === tx.participation_id &&
              t.type === "release" &&
              t.status === "succeeded"
          );
          if (!hasRelease) {
            pendingBalance += amt;
          }
        } else if (tx.type === "release") {
          availableBalance += amt;
        }
      }
    });

    return {
      success: true,
      transactions,
      availableBalance,
      pendingBalance,
      isMock: false,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch ledger";
    console.error("Error in getTransactionLedgerAction:", error);
    return { success: false, error: message };
  }
}