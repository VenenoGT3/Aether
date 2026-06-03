import { isMockMode } from "@/lib/env";
import { stripeServer } from "./client";

/**
 * Stripe Connect Marketplace onboarding, balance management, and transfer wrappers
 */

export interface ConnectAccount {
  id: string;
  userId: string;
  isOnboarded: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  country: string;
  currency: string;
}

/** @deprecated Use `isMockMode` from `@/lib/env` — Stripe mock follows AETHER_MOCK_MODE only */
export function getIsStripeMockMode(): boolean {
  return isMockMode;
}

/**
 * Retrieves the details of a Connected Stripe Account
 */
export async function getConnectAccount(
  accountId: string
): Promise<ConnectAccount | null> {
  if (isMockMode || accountId.startsWith("acct_mock_")) {
    return {
      id: accountId,
      userId: "mock-user-id",
      isOnboarded: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      country: "US",
      currency: "usd",
    };
  }

  try {
    const account = await stripeServer.accounts.retrieve(accountId);
    return {
      id: account.id,
      userId: account.metadata?.userId || "",
      isOnboarded: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      country: account.country || "US",
      currency: account.default_currency || "usd",
    };
  } catch (error) {
    console.error("Error retrieving Stripe account:", error);
    return null;
  }
}

/**
 * Creates a Stripe Express account and generates an onboarding link
 */
export async function createStripeExpressAccount(
  userId: string,
  role: "business" | "influencer",
  origin: string
) {
  if (isMockMode) {
    const mockAccountId =
      "acct_mock_" + Math.random().toString(36).substring(2, 10);
    const url = `${origin}/stripe/callback?action=return&role=${role}&accountId=${mockAccountId}&mock=true`;
    return {
      url,
      accountId: mockAccountId,
    };
  }

  try {
    const account = await stripeServer.accounts.create({
      type: "express",
      metadata: { userId, role },
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
    });

    const accountLink = await stripeServer.accountLinks.create({
      account: account.id,
      refresh_url: `${origin}/stripe/callback?action=refresh&role=${role}&accountId=${account.id}`,
      return_url: `${origin}/stripe/callback?action=return&role=${role}&accountId=${account.id}`,
      type: "account_onboarding",
    });

    return {
      url: accountLink.url,
      accountId: account.id,
    };
  } catch (error) {
    console.error("Error creating Express account onboarding session:", error);
    throw error;
  }
}

/**
 * Creates a Stripe PaymentIntent. Used for BOTH models:
 *  - Fixed-fee escrow funding (legacy): metadata carries participationId/transactionId.
 *  - Performance budget-pool funding (new): metadata carries { campaignId, kind: 'pool_funding' }.
 * The webhook routes the succeeded event based on that metadata.
 */
export async function createEscrowPaymentIntent(
  amount: number,
  metadata: Record<string, string>
) {
  if (isMockMode) {
    const mockIntentId = "pi_mock_" + Math.random().toString(36).substring(2, 11);
    return {
      clientSecret: `${mockIntentId}_secret_${Math.random().toString(36).substring(2, 6)}`,
      paymentIntentId: mockIntentId,
    };
  }

  try {
    const paymentIntent = await stripeServer.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      metadata,
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
  } catch (error) {
    console.error("Error creating Escrow PaymentIntent:", error);
    throw error;
  }
}

/**
 * Transfers funds from the platform Stripe balance to the Creator's Connected Account
 */
export async function releaseEscrowPayment(
  amount: number,
  influencerStripeAccountId: string,
  campaignId: string,
  /**
   * Stable Stripe idempotency key. CRITICAL for withdrawals: re-issuing the
   * same transfer (retry / reconcile) returns the original transfer instead of
   * creating a second one, so a network timeout can never double-pay.
   */
  idempotencyKey?: string
) {
  if (isMockMode || influencerStripeAccountId.startsWith("acct_mock_")) {
    console.log(
      `[MOCK] Releasing escrow payment of $${amount} to Connected Account ${influencerStripeAccountId} for Campaign ${campaignId}`
    );
    return {
      success: true,
      transferId: "tr_mock_" + Math.random().toString(36).substring(2, 11),
    };
  }

  try {
    const transfer = await stripeServer.transfers.create(
      {
        amount: Math.round(amount * 100),
        currency: "usd",
        destination: influencerStripeAccountId,
        metadata: { campaignId },
      },
      idempotencyKey ? { idempotencyKey } : undefined
    );

    return {
      success: true,
      transferId: transfer.id,
    };
  } catch (error) {
    console.error("Error releasing escrow payment:", error);
    throw error;
  }
}

/**
 * Reads the live status of a PaymentIntent (used to reconcile pool funding when
 * the webhook is missed). Returns null if Stripe can't be reached.
 */
export async function retrievePaymentIntentStatus(
  paymentIntentId: string
): Promise<{ status: string } | null> {
  if (isMockMode || paymentIntentId.startsWith("pi_mock_")) {
    return { status: "succeeded" };
  }
  try {
    const pi = await stripeServer.paymentIntents.retrieve(paymentIntentId);
    return { status: pi.status };
  } catch (error) {
    console.error("Error retrieving PaymentIntent:", error);
    return null;
  }
}

export interface RefundResult {
  refunded: boolean;
  refundId?: string;
  alreadyRefunded?: boolean;
  cancelled?: boolean;
}

/**
 * Refunds a pool-funding PaymentIntent (cancel-with-refund of a draft campaign).
 * Idempotent + safe:
 *  - if the charge is already refunded → no-op (alreadyRefunded).
 *  - if succeeded → create a refund with a deterministic idempotency key, so a
 *    retry returns the SAME refund instead of charging again.
 *  - if not yet captured (requires_*) → cancel the PaymentIntent (nothing to refund).
 *  - if processing/canceled → no-op.
 */
export async function refundPoolPayment(
  paymentIntentId: string,
  idempotencyKey: string
): Promise<RefundResult> {
  if (isMockMode || paymentIntentId.startsWith("pi_mock_")) {
    return { refunded: true, refundId: "re_mock_" + Math.random().toString(36).substring(2, 11) };
  }

  const pi = await stripeServer.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });

  const charge = pi.latest_charge;
  if (charge && typeof charge !== "string" && charge.refunded) {
    return { refunded: false, alreadyRefunded: true };
  }

  if (pi.status === "succeeded") {
    const refund = await stripeServer.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey }
    );
    return { refunded: true, refundId: refund.id };
  }

  if (
    pi.status === "requires_payment_method" ||
    pi.status === "requires_confirmation" ||
    pi.status === "requires_action"
  ) {
    await stripeServer.paymentIntents.cancel(paymentIntentId);
    return { refunded: false, cancelled: true };
  }

  // "processing" (cannot refund yet) or "canceled" (nothing to do).
  return { refunded: false };
}