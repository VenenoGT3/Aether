import { stripeServer } from "./client";
import { getCircuitBreaker } from "@/lib/circuit-breaker";

// All live Stripe API calls go through one breaker: 5 consecutive failures →
// OPEN 30s. When OPEN, exec() throws a safe "temporarily unavailable" error
// instead of piling requests onto a degraded Stripe — fail-fast, not fail-hang.
const stripeBreaker = getCircuitBreaker("stripe", { failureThreshold: 5, openDurationMs: 30_000 });

/**
 * Stripe Connect Marketplace onboarding, balance management, and transfer wrappers.
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

/** Retrieves the details of a Connected Stripe Account. */
export async function getConnectAccount(
  accountId: string
): Promise<ConnectAccount | null> {
  try {
    const account = await stripeBreaker.exec(() => stripeServer.accounts.retrieve(accountId));
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

/** Creates a Stripe Express account and generates an onboarding link. */
export async function createStripeExpressAccount(
  userId: string,
  role: "business" | "influencer",
  origin: string
) {
  try {
    const account = await stripeBreaker.exec(() =>
      stripeServer.accounts.create({
        type: "express",
        metadata: { userId, role },
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
      })
    );

    const accountLink = await stripeBreaker.exec(() =>
      stripeServer.accountLinks.create({
        account: account.id,
        refresh_url: `${origin}/stripe/callback?action=refresh&role=${role}&accountId=${account.id}`,
        return_url: `${origin}/stripe/callback?action=return&role=${role}&accountId=${account.id}`,
        type: "account_onboarding",
      })
    );

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
  try {
    const paymentIntent = await stripeBreaker.exec(() =>
      stripeServer.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "usd",
        metadata,
      })
    );

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
 * Transfers funds from the platform Stripe balance to the Creator's Connected Account.
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
  try {
    const transfer = await stripeBreaker.exec(() =>
      stripeServer.transfers.create(
        {
          amount: Math.round(amount * 100),
          currency: "usd",
          destination: influencerStripeAccountId,
          metadata: { campaignId },
        },
        idempotencyKey ? { idempotencyKey } : undefined
      )
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
  try {
    const pi = await stripeBreaker.exec(() =>
      stripeServer.paymentIntents.retrieve(paymentIntentId)
    );
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
  const pi = await stripeBreaker.exec(() =>
    stripeServer.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    })
  );

  const charge = pi.latest_charge;
  if (charge && typeof charge !== "string" && charge.refunded) {
    return { refunded: false, alreadyRefunded: true };
  }

  if (pi.status === "succeeded") {
    const refund = await stripeBreaker.exec(() =>
      stripeServer.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey })
    );
    return { refunded: true, refundId: refund.id };
  }

  if (
    pi.status === "requires_payment_method" ||
    pi.status === "requires_confirmation" ||
    pi.status === "requires_action"
  ) {
    await stripeBreaker.exec(() => stripeServer.paymentIntents.cancel(paymentIntentId));
    return { refunded: false, cancelled: true };
  }

  // "processing" (cannot refund yet) or "canceled" (nothing to do).
  return { refunded: false };
}
