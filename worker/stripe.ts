import Stripe from "stripe";
import { isMockMode } from "./env";

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
  cached = new Stripe(key);
  return cached;
}

export interface TransferResult {
  transferId: string;
  mock: boolean;
}

export async function transferToCreator(
  amount: number,
  destinationAccountId: string,
  idempotencyKey: string,
  metadata: Record<string, string> = {}
): Promise<TransferResult> {
  // Mock mode (or a mock connected account) returns a simulated transfer.
  if (
    isMockMode ||
    !destinationAccountId ||
    destinationAccountId.startsWith("acct_mock_")
  ) {
    return {
      transferId: "tr_mock_" + Math.random().toString(36).substring(2, 11),
      mock: true,
    };
  }

  const transfer = await getStripe().transfers.create(
    {
      amount: Math.round(amount * 100),
      currency: "usd",
      destination: destinationAccountId,
      metadata,
    },
    { idempotencyKey }
  );

  return { transferId: transfer.id, mock: false };
}

/**
 * Read a PaymentIntent's current status (used by pool-funding reconciliation).
 * Mirrors lib/stripe/connect.retrievePaymentIntentStatus. Returns null on a
 * Stripe API error so the caller can log and retry next cycle (never throws).
 */
export async function retrievePaymentIntentStatus(
  paymentIntentId: string
): Promise<{ status: string } | null> {
  if (isMockMode || paymentIntentId.startsWith("pi_mock_")) {
    return { status: "succeeded" };
  }
  try {
    const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
    return { status: pi.status };
  } catch {
    return null;
  }
}
