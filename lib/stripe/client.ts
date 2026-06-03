import "server-only";
import Stripe from "stripe";
import { getStripeSecretKey } from "@/lib/env.server";

export const stripeServer = new Stripe(getStripeSecretKey(), {
  // Pin a known-good API version. Cast the config through unknown since the
  // installed SDK types track a newer apiVersion literal union.
  apiVersion: "2023-10-16",
  typescript: true,
  // Per-request timeout (15s) + idempotent exponential-backoff retries handled by
  // the SDK. Safe for writes too: the SDK auto-attaches/forwards idempotency keys,
  // so a retried transfer/refund can't double-apply.
  timeout: 15_000,
  maxNetworkRetries: 2,
} as unknown as ConstructorParameters<typeof Stripe>[1]);

export interface EscrowPayment {
  id: string;
  campaignId: string;
  amount: number;
  status: "pending" | "escrowed" | "released" | "refunded";
  stripeTransferId?: string;
  createdAt: string;
}

// Escrow / Payout Mocks
export const MOCK_ESCROWS: EscrowPayment[] = [
  {
    id: "esc_1",
    campaignId: "camp_1",
    amount: 1500,
    status: "escrowed",
    createdAt: new Date().toISOString(),
  },
  {
    id: "esc_2",
    campaignId: "camp_2",
    amount: 800,
    status: "released",
    stripeTransferId: "tr_mock_123",
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  }
];
