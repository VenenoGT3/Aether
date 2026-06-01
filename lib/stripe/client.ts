import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";

export const stripeServer = new Stripe(stripeSecretKey, {
  apiVersion: "2023-10-16" as any, // fallback standard API version
  typescript: true,
});

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
