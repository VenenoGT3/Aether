import type { UserRole } from "@/types";

/**
 * Authorization + verification helpers.
 *
 * - The escrow asserts below (fund / release / approve) belong to the LEGACY
 *   fixed-fee model and are still used by that flow (and reused by performance
 *   pool funding, which also requires the business role).
 * - verifyCronAuth / verifyStripeWebhookSignature are shared infrastructure used
 *   by BOTH models (metrics cron + Stripe webhooks).
 */

export type ParticipationStatus =
  | "applied"
  | "approved"
  | "escrowed"
  | "in_progress"
  | "submitted"
  | "completed"
  | "rejected";

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertBusinessCanFundEscrow(role: UserRole | undefined): void {
  if (role !== "business") {
    throw new AuthorizationError(
      "Unauthorized. Only business accounts can fund escrows."
    );
  }
}

export function assertBusinessCanReleaseEscrow(role: UserRole | undefined): void {
  if (role !== "business") {
    throw new AuthorizationError(
      "Unauthorized. Only business accounts can release escrows."
    );
  }
}

export function assertBusinessOwnsCampaign(
  actorId: string,
  businessId: string
): void {
  if (actorId !== businessId) {
    throw new AuthorizationError(
      "Unauthorized. You do not own this campaign."
    );
  }
}

export function assertInfluencerCanApply(
  actorId: string,
  influencerId: string
): void {
  if (actorId !== influencerId) {
    throw new AuthorizationError(
      "Unauthorized. You can only apply as yourself."
    );
  }
}

export function assertCanApprovePost(
  actorId: string,
  businessId: string,
  participationStatus: ParticipationStatus
): void {
  assertBusinessOwnsCampaign(actorId, businessId);
  const approvable: ParticipationStatus[] = [
    "submitted",
    "in_progress",
    "escrowed",
  ];
  if (!approvable.includes(participationStatus)) {
    throw new AuthorizationError(
      `Cannot approve post while participation is in status: ${participationStatus}`
    );
  }
}

export function verifyCronAuth(
  authHeader: string | null,
  cronSecret: string | undefined
): { authorized: boolean; error?: string } {
  if (!cronSecret?.trim()) {
    return {
      authorized: false,
      error: "CRON_SECRET is required.",
    };
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return { authorized: false, error: "Unauthorized" };
  }
  return { authorized: true };
}

export function verifyStripeWebhookSignature(
  hasSecret: boolean,
  hasSignature: boolean
): { valid: boolean; error?: string } {
  if (!hasSecret || !hasSignature) {
    return {
      valid: false,
      error:
        "Stripe webhook signature verification required. Set STRIPE_WEBHOOK_SECRET and send stripe-signature header.",
    };
  }
  return { valid: true };
}