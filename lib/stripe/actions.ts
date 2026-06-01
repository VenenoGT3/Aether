"use server";

import { getServerUser, createClient } from "@/lib/supabase/server";
import { 
  createStripeExpressAccount, 
  createEscrowPaymentIntent, 
  releaseEscrowPayment 
} from "./connect";
import { getIsStripeMockMode } from "./connect";

const isSupabaseMockMode = 
  !process.env.NEXT_PUBLIC_SUPABASE_URL || 
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder-url") ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project-id");

/**
 * Server Action: Initialize Stripe Onboarding for Business or Influencer
 */
export async function startStripeOnboardingAction(role: "business" | "influencer", origin: string) {
  try {
    const isMock = isSupabaseMockMode || getIsStripeMockMode();
    
    let userId = "mock-user-id";
    if (!isMock) {
      const user = await getServerUser();
      if (!user) throw new Error("Unauthorized");
      userId = user.id;
    }

    const { url, accountId } = await createStripeExpressAccount(userId, role, origin);

    if (!isMock) {
      const supabase = await createClient();
      await supabase
        .from("profiles")
        .update({
          stripe_connect_id: accountId,
          stripe_onboarding_completed: false
        })
        .eq("id", userId);
    }

    return { success: true, url, accountId };
  } catch (error: any) {
    console.error("Error in startStripeOnboardingAction:", error);
    return { success: false, error: error.message || "Failed to start onboarding" };
  }
}

/**
 * Server Action: Fund campaign escrow
 */
export async function fundEscrowAction(participationId: string, amount: number) {
  try {
    const isMock = isSupabaseMockMode || getIsStripeMockMode();

    if (isMock) {
      return { success: true, isMock: true };
    }

    const user = await getServerUser();
    if (!user || user.role !== "business") {
      throw new Error("Unauthorized. Only business accounts can fund escrows.");
    }

    const supabase = await createClient();

    // 1. Create a pending transaction record
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        participation_id: participationId,
        user_id: user.id,
        amount,
        type: "escrow",
        status: "pending"
      })
      .select()
      .single();

    if (txError) throw txError;

    // 2. Create Stripe PaymentIntent
    const { clientSecret, paymentIntentId } = await createEscrowPaymentIntent(amount, {
      participationId,
      transactionId: transaction.id
    });

    // 3. Update transaction with Stripe reference ID
    await supabase
      .from("transactions")
      .update({ stripe_payment_intent_id: paymentIntentId })
      .eq("id", transaction.id);

    return { 
      success: true, 
      clientSecret, 
      paymentIntentId, 
      transactionId: transaction.id,
      isMock: false 
    };
  } catch (error: any) {
    console.error("Error in fundEscrowAction:", error);
    return { success: false, error: error.message || "Failed to fund escrow" };
  }
}

/**
 * Server Action: Approve work and release funds from escrow to influencer
 */
export async function releaseEscrowAction(participationId: string) {
  try {
    const isMock = isSupabaseMockMode || getIsStripeMockMode();

    if (isMock) {
      return { success: true, isMock: true };
    }

    const user = await getServerUser();
    if (!user || user.role !== "business") {
      throw new Error("Unauthorized. Only business accounts can release escrows.");
    }

    const supabase = await createClient();

    // Fetch the participation and influencer profile
    const { data: participation, error: partError } = await supabase
      .from("participations")
      .select(`
        *,
        campaign:campaign_id (*),
        influencer:influencer_id (*)
      `)
      .eq("id", participationId)
      .single();

    if (partError || !participation) {
      throw new Error("Participation agreement not found.");
    }

    // Get influencer stripe connect ID from profile table
    const { data: influencerProfile, error: profError } = await supabase
      .from("profiles")
      .select("stripe_connect_id, stripe_onboarding_completed")
      .eq("id", participation.influencer_id)
      .single();

    if (profError || !influencerProfile || !influencerProfile.stripe_connect_id) {
      throw new Error("Influencer has not linked a Stripe payout account yet.");
    }

    // Call Stripe to transfer funds
    const amount = Number(participation.proposed_payout);
    const { success, transferId } = await releaseEscrowPayment(
      amount, 
      influencerProfile.stripe_connect_id,
      participation.campaign_id
    );

    if (!success) throw new Error("Stripe Connect transfer failed.");

    // Record the release transaction
    await supabase
      .from("transactions")
      .insert({
        participation_id: participationId,
        user_id: user.id,
        amount,
        type: "release",
        status: "succeeded",
        stripe_payment_intent_id: transferId
      });

    // Update participation status
    await supabase
      .from("participations")
      .update({
        status: "completed",
        actual_payout: amount
      })
      .eq("id", participationId);

    // Update campaign status if all participations are completed
    // (For this mock setup, we can do it directly or check count)
    await supabase
      .from("campaigns")
      .update({ status: "completed" })
      .eq("id", participation.campaign_id);

    return { success: true, transferId, isMock: false };
  } catch (error: any) {
    console.error("Error in releaseEscrowAction:", error);
    return { success: false, error: error.message || "Failed to release escrow" };
  }
}

/**
 * Server Action: Creator requests withdrawal/payout of available funds
 */
export async function withdrawFundsAction(amount: number) {
  try {
    const isMock = isSupabaseMockMode || getIsStripeMockMode();

    if (isMock) {
      return { success: true, isMock: true };
    }

    const user = await getServerUser();
    if (!user || user.role !== "influencer") {
      throw new Error("Unauthorized. Only creator accounts can withdraw funds.");
    }

    const supabase = await createClient();

    // Verify they have enough balance
    const ledger = await getTransactionLedgerAction();
    if (!ledger.success || (ledger.availableBalance || 0) < amount) {
      throw new Error("Insufficient available balance.");
    }

    // Insert payout transaction record
    const { error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: user.id,
        amount,
        type: "payout",
        status: "succeeded"
      });

    if (txError) throw txError;

    return { success: true, isMock: false };
  } catch (error: any) {
    console.error("Error in withdrawFundsAction:", error);
    return { success: false, error: error.message || "Failed to withdraw funds" };
  }
}

/**
 * Server Action: Fetch transaction ledger and compute pending & available balances
 */
export async function getTransactionLedgerAction() {
  try {
    const isMock = isSupabaseMockMode || getIsStripeMockMode();

    if (isMock) {
      // In mock mode, we let the client-side compute from localStorage
      // But we will return default mock values for SSR and first load
      return {
        success: true,
        transactions: [],
        availableBalance: 5800,
        pendingBalance: 4500,
        isMock: true
      };
    }

    const user = await getServerUser();
    if (!user) throw new Error("Unauthorized");

    const supabase = await createClient();

    let query = supabase
      .from("transactions")
      .select(`
        *,
        participation:participation_id (
          *,
          campaign:campaign_id (*)
        )
      `)
      .order("created_at", { ascending: false });

    // Filter transactions relevant to this user
    if (user.role === "influencer") {
      // Creator sees releases, payouts, and escrows related to their participations
      // Note: withdrawals (type payout) don't have a participation_id, they belong directly to the creator
      // We can query all transactions. Since RLS is enabled, the policy:
      // "Allow read access to transactions" checks if the influencer_id = auth.uid()
      // Let's execute the query. RLS automatically filters!
    } else {
      // Business sees escrows and releases they funded
    }

    const { data: transactions, error } = await query;
    if (error) throw error;

    // Calculate balances
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
          // If escrow exists but no release exists for this participation, it is pending
          const hasRelease = transactions.some(
            (t) => t.participation_id === tx.participation_id && t.type === "release" && t.status === "succeeded"
          );
          if (!hasRelease) {
            pendingBalance += amt;
          }
        }
      } else {
        // Business view
        if (tx.type === "escrow") {
          const hasRelease = transactions.some(
            (t) => t.participation_id === tx.participation_id && t.type === "release" && t.status === "succeeded"
          );
          if (!hasRelease) {
            pendingBalance += amt;
          }
        } else if (tx.type === "release") {
          availableBalance += amt; // represents completed payouts
        }
      }
    });

    return {
      success: true,
      transactions,
      availableBalance,
      pendingBalance,
      isMock: false
    };
  } catch (error: any) {
    console.error("Error in getTransactionLedgerAction:", error);
    return { success: false, error: error.message || "Failed to fetch ledger" };
  }
}
