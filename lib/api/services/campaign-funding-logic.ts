/**
 * Pure decision logic for pool-funding reconciliation + cancel/refund.
 *
 * Kept free of Supabase/Stripe imports (those are server-only) so it can be
 * unit-tested directly. The async service (campaign-funding.ts) loads the
 * campaign + talks to Stripe, then defers the "what should happen" calls here.
 */

export interface FundingCampaignState {
  campaign_type: string;
  status: string;
  funded_at: string | null;
  funding_payment_intent_id: string | null;
}

/** A funding PaymentIntent has cleared → the campaign should go live. */
export function shouldActivateFromPaymentStatus(paymentStatus: string): boolean {
  return paymentStatus === "succeeded";
}

export type ReconcilePlan =
  | { action: "already_active" } // funded / not draft → nothing to do (idempotent)
  | { action: "no_payment" } // no PaymentIntent was ever started
  | { action: "check_stripe" }; // draft + has PI → verify with Stripe

/** Decide reconciliation BEFORE hitting Stripe (idempotent on re-run). */
export function planReconciliation(c: FundingCampaignState): ReconcilePlan {
  if (c.funded_at || c.status !== "draft") return { action: "already_active" };
  if (!c.funding_payment_intent_id) return { action: "no_payment" };
  return { action: "check_stripe" };
}

export type CancelPlan =
  | { ok: true; needsRefund: boolean }
  | { ok: false; reason: "already_cancelled" | "not_draft" };

/**
 * Only a still-draft campaign may be cancelled with a refund (it hasn't gone
 * live, so no earnings have accrued). Cancelling an already-cancelled campaign
 * is an idempotent no-op upstream.
 */
export function planCancellation(c: FundingCampaignState): CancelPlan {
  if (c.status === "cancelled") return { ok: false, reason: "already_cancelled" };
  if (c.status !== "draft") return { ok: false, reason: "not_draft" };
  return { ok: true, needsRefund: !!c.funding_payment_intent_id };
}
