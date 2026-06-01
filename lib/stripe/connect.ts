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

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const isStripeMockMode = 
  !stripeSecretKey || 
  stripeSecretKey.includes("placeholder") ||
  stripeSecretKey.includes("sk_test_...");

export function getIsStripeMockMode() {
  return isStripeMockMode;
}

/**
 * Retrieves the details of a Connected Stripe Account
 */
export async function getConnectAccount(accountId: string): Promise<ConnectAccount | null> {
  if (isStripeMockMode || accountId.startsWith("acct_mock_")) {
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
export async function createStripeExpressAccount(userId: string, role: "business" | "influencer", origin: string) {
  if (isStripeMockMode) {
    // Generate a callback URL that redirects to our mock callback page
    const mockAccountId = "acct_mock_" + Math.random().toString(36).substring(2, 10);
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
        card_payments: { requested: true }
      }
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
 * Creates a PaymentIntent for campaign escrow funding
 */
export async function createEscrowPaymentIntent(amount: number, metadata: Record<string, string>) {
  if (isStripeMockMode) {
    const mockIntentId = "pi_mock_" + Math.random().toString(36).substring(2, 11);
    return {
      clientSecret: `${mockIntentId}_secret_${Math.random().toString(36).substring(2, 6)}`,
      paymentIntentId: mockIntentId,
    };
  }

  try {
    const paymentIntent = await stripeServer.paymentIntents.create({
      amount: Math.round(amount * 100), // convert to cents
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
export async function releaseEscrowPayment(amount: number, influencerStripeAccountId: string, campaignId: string) {
  if (isStripeMockMode || influencerStripeAccountId.startsWith("acct_mock_")) {
    console.log(`[MOCK] Releasing escrow payment of $${amount} to Connected Account ${influencerStripeAccountId} for Campaign ${campaignId}`);
    return {
      success: true,
      transferId: "tr_mock_" + Math.random().toString(36).substring(2, 11),
    };
  }

  try {
    const transfer = await stripeServer.transfers.create({
      amount: Math.round(amount * 100),
      currency: "usd",
      destination: influencerStripeAccountId,
      metadata: { campaignId },
    });

    return {
      success: true,
      transferId: transfer.id,
    };
  } catch (error) {
    console.error("Error releasing escrow payment:", error);
    throw error;
  }
}
