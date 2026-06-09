import Stripe from "stripe";
import { getCircuitBreaker } from "./circuit-breaker";
import { getStripeCurrency } from "../lib/currency";

// All live worker Stripe calls go through one breaker: 5 consecutive failures →
// OPEN 30s. When OPEN, exec() throws — the payout batch treats that as a transient
// failure (mark_payout_failed releases the claim, retried next batch), so we stop
// hammering a degraded Stripe instead of failing every payout in the batch.
const stripeBreaker = getCircuitBreaker("stripe", { failureThreshold: 5, openDurationMs: 30_000 });

/**
 * Worker-local Stripe client. The Next.js Stripe client (lib/stripe/client.ts)
 * is `server-only`, so the worker cannot import it. This mirrors
 * lib/stripe/connect.releaseEscrowPayment: transfer platform balance to a
 * creator's connected account. A Stripe idempotency key (the payout id) makes
 * retries safe — Stripe will not create a second transfer for the same key.
 */
let cached: Stripe | null = null;

function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("[worker] STRIPE_SECRET_KEY is required for live payouts.");
  }
  // 15s per-request timeout + idempotent SDK retries. The payout transfer carries
  // a stable idempotency key (the payout id), so a retried transfer never double-pays.
  cached = new Stripe(key, { timeout: 15_000, maxNetworkRetries: 2 });
  return cached;
}

export interface TransferResult {
  transferId: string;
}

export async function transferToCreator(
  amount: number,
  destinationAccountId: string,
  idempotencyKey: string,
  metadata: Record<string, string> = {}
): Promise<TransferResult> {
  if (!destinationAccountId) {
    throw new Error(
      "[worker] transferToCreator requires a connected Stripe account id."
    );
  }

  const transfer = await stripeBreaker.exec(() =>
    getStripe().transfers.create(
      {
        amount: Math.round(amount * 100),
        currency: getStripeCurrency(),
        destination: destinationAccountId,
        metadata,
      },
      { idempotencyKey }
    )
  );

  return { transferId: transfer.id };
}

/**
 * Read a PaymentIntent's current status (used by pool-funding reconciliation).
 * Mirrors lib/stripe/connect.retrievePaymentIntentStatus. Returns null on a
 * Stripe API error so the caller can log and retry next cycle (never throws).
 */
export async function retrievePaymentIntentStatus(
  paymentIntentId: string
): Promise<{ status: string } | null> {
  try {
    const pi = await stripeBreaker.exec(() =>
      getStripe().paymentIntents.retrieve(paymentIntentId)
    );
    return { status: pi.status };
  } catch {
    return null;
  }
}
