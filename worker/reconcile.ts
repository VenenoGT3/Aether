import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "./supabase";
import { retrievePaymentIntentStatus } from "./stripe";
import { getFundingStuckAlertMinutes } from "./env";
import { log } from "./logger";

/**
 * Safety-net reconciliation for performance campaigns stuck in 'draft' after
 * pool funding — i.e. the `payment_intent.succeeded` webhook was missed or
 * delayed, so the campaign never went live despite the brand having paid.
 *
 * Mirrors lib/api/services/campaign-funding.reconcileFunding (the manual,
 * owner-triggered endpoint), but runs automatically in the background for ALL
 * affected campaigns using the service role.
 *
 * For each draft performance campaign that has a funding PaymentIntent, we ask
 * Stripe for the PI's real status and:
 *   - succeeded -> activate ('open' + funded_at), idempotently
 *   - canceled  -> leave in draft (decision below), counted as failed
 *   - otherwise -> still pending; leave in draft
 *
 * DECISION — canceled/failed PIs are LEFT IN DRAFT, not auto-cancelled.
 * Auto-cancelling is destructive (it refunds and closes the campaign) and the
 * brand may simply retry payment; cancellation stays an explicit owner action
 * (cancelFundedDraft / the cancel endpoint). We surface it via logs.
 *
 * Idempotent + safe: the activate UPDATE is guarded on status='draft', so it
 * only ever touches still-draft campaigns and can't race the webhook into a
 * double activation. Stripe errors are logged and skipped (retried next cycle).
 */

export interface ReconcileSummary {
  scanned: number;
  activated: number;
  pending: number; // PI not yet settled — left in draft
  failed: number; // PI canceled — left in draft (see decision above)
  errors: number; // Stripe retrieval or DB update errors (retried next cycle)
}

interface DraftFundingCampaign {
  id: string;
  funding_payment_intent_id: string | null;
  status: string;
  updated_at: string | null;
}

/** A funding PaymentIntent that has cleared → the campaign should go live. */
function isPaymentSucceeded(status: string): boolean {
  return status === "succeeded";
}

/** Terminal failure for a PaymentIntent (Stripe's only canceled state). */
function isPaymentCanceled(status: string): boolean {
  return status === "canceled";
}

// Campaigns we've already alerted on as "stuck"; re-armed once they leave draft.
const stuckAlerts = new Set<string>();

export async function runPoolFundingReconciliation(
  client?: SupabaseClient
): Promise<ReconcileSummary> {
  const supabase = client ?? getServiceClient();
  const summary: ReconcileSummary = {
    scanned: 0,
    activated: 0,
    pending: 0,
    failed: 0,
    errors: 0,
  };

  // Only performance campaigns still in draft that actually started funding.
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, funding_payment_intent_id, status, updated_at")
    .eq("campaign_type", "performance")
    .eq("status", "draft")
    .not("funding_payment_intent_id", "is", null);

  if (error) {
    throw new Error(`[reconcile] failed to load draft funded campaigns: ${error.message}`);
  }

  const campaigns = (data ?? []) as DraftFundingCampaign[];
  summary.scanned = campaigns.length;
  if (campaigns.length === 0) {
    log.debug("reconcile.none");
    return summary;
  }
  log.info("reconcile.start", { candidates: campaigns.length });

  const stuckMs = getFundingStuckAlertMinutes() * 60_000;

  for (const c of campaigns) {
    const pi = await retrievePaymentIntentStatus(c.funding_payment_intent_id!);
    if (!pi) {
      summary.errors += 1;
      log.warn("reconcile.stripe_error", {
        campaignId: c.id,
        paymentIntent: c.funding_payment_intent_id,
        note: "could not retrieve PaymentIntent; retrying next cycle",
      });
      continue;
    }

    if (isPaymentSucceeded(pi.status)) {
      const { error: updErr } = await supabase
        .from("campaigns")
        .update({ status: "open", funded_at: new Date().toISOString() })
        .eq("id", c.id)
        .eq("status", "draft"); // idempotent guard; won't race the webhook
      if (updErr) {
        summary.errors += 1;
        log.error("reconcile.activate_error", { campaignId: c.id, error: updErr.message });
        continue;
      }
      summary.activated += 1;
      stuckAlerts.delete(c.id);
      log.info("reconcile.activated", {
        campaignId: c.id,
        paymentIntent: c.funding_payment_intent_id,
      });
      continue;
    }

    if (isPaymentCanceled(pi.status)) {
      summary.failed += 1;
      log.warn("reconcile.payment_canceled", {
        campaignId: c.id,
        note: "left in draft — refund/cancel is an explicit owner action",
      });
      continue;
    }

    // Still pending (requires_payment_method / requires_action / processing / ...).
    summary.pending += 1;
    log.debug("reconcile.pending", { campaignId: c.id, paymentStatus: pi.status });

    // Stuck-too-long alert (once per campaign; re-armed when it leaves draft).
    const ageMs = c.updated_at ? Date.now() - new Date(c.updated_at).getTime() : 0;
    if (ageMs >= stuckMs && !stuckAlerts.has(c.id)) {
      stuckAlerts.add(c.id);
      log.alert("campaign.funding_stuck", {
        campaignId: c.id,
        paymentStatus: pi.status,
        stuckForMin: Math.round(ageMs / 60_000),
        paymentIntent: c.funding_payment_intent_id,
      });
    }
  }

  log.info("reconcile.done", { ...summary });
  return summary;
}
