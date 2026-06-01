"use server";

import { getServerUser, createClient } from "@/lib/supabase/server";
import {
  createStripeExpressAccount,
  createEscrowPaymentIntent,
  releaseEscrowPayment,
  getIsStripeMockMode,
} from "./connect";
import { isMockMode } from "@/lib/env";
import {
  assertBusinessCanFundEscrow,
  assertBusinessCanReleaseEscrow,
  AuthorizationError,
} from "@/lib/campaign-lifecycle";

/**
 * Server Action: Initialize Stripe Onboarding for Business or Influencer
 */
export async function startStripeOnboardingAction(
  role: "business" | "influencer",
  origin: string
) {
  try {
    const isMock = isMockMode || getIsStripeMockMode();

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
        .eq("user_id", userId);
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
    const isMock = isMockMode || getIsStripeMockMode();

    if (isMock) {
      return { success: true, isMock: true };
    }

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
 * Server Action: Approve work and release funds from escrow to influencer
 */
export async function releaseEscrowAction(participationId: string) {
  try {
    const isMock = isMockMode || getIsStripeMockMode();

    if (isMock) {
      return { success: true, isMock: true };
    }

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
      .eq("user_id", participation.influencer_id)
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
    const isMock = isMockMode || getIsStripeMockMode();

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
 * Server Action: Fetch transaction ledger and compute pending & available balances
 */
export async function getTransactionLedgerAction() {
  try {
    const isMock = isMockMode || getIsStripeMockMode();

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