import { createClient } from "@/lib/supabase/server";
import {
  retrievePaymentIntentStatus,
  refundPoolPayment,
} from "@/lib/stripe/connect";
import {
  planReconciliation,
  planCancellation,
  shouldActivateFromPaymentStatus,
  type FundingCampaignState,
} from "./campaign-funding-logic";

type LoadedCampaign = FundingCampaignState & { id: string; business_id: string };

export type FundingResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string; status: number };

/**
 * Load a campaign and assert the caller owns it AND it's a performance campaign.
 * Ownership is the security boundary — only the owning brand may reconcile or
 * cancel funding (RLS also restricts campaign reads/updates to the owner).
 */
async function loadOwnedPerformanceCampaign(
  campaignId: string,
  userId: string
): Promise<
  | { ok: true; campaign: LoadedCampaign }
  | { ok: false; error: string; status: number }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, business_id, campaign_type, status, funded_at, funding_payment_intent_id"
    )
    .eq("id", campaignId)
    .single();

  if (error || !data) {
    return { ok: false, error: "Campaign not found.", status: 404 };
  }
  const campaign = data as LoadedCampaign;
  if (campaign.business_id !== userId) {
    return { ok: false, error: "You can only manage your own campaigns.", status: 403 };
  }
  if (campaign.campaign_type !== "performance") {
    return {
      ok: false,
      error: "Only performance campaigns use pool funding.",
      status: 400,
    };
  }
  return { ok: true, campaign };
}

/**
 * Reconcile a possibly-stuck performance campaign: if its funding PaymentIntent
 * has actually succeeded in Stripe, activate the campaign (status 'open',
 * funded_at). Safe to call repeatedly — it only activates when Stripe confirms
 * payment, and is a no-op once the campaign is already live.
 */
export async function reconcileFunding(
  campaignId: string,
  userId: string
): Promise<FundingResult> {
  const loaded = await loadOwnedPerformanceCampaign(campaignId, userId);
  if (!loaded.ok) return loaded;
  const { campaign } = loaded;

  const plan = planReconciliation(campaign);
  if (plan.action === "already_active") {
    return { ok: true, activated: false, alreadyActive: true };
  }
  if (plan.action === "no_payment") {
    return {
      ok: false,
      error: "No funding payment has been started for this campaign.",
      status: 409,
    };
  }

  const pi = await retrievePaymentIntentStatus(campaign.funding_payment_intent_id!);
  if (!pi) {
    return {
      ok: false,
      error: "Could not retrieve the funding payment from Stripe. Try again.",
      status: 502,
    };
  }

  if (!shouldActivateFromPaymentStatus(pi.status)) {
    console.log(
      `[funding] reconcile ${campaignId}: payment not settled (status=${pi.status})`
    );
    return { ok: true, activated: false, paymentStatus: pi.status };
  }

  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from("campaigns")
    .update({ status: "open", funded_at: new Date().toISOString() })
    .eq("id", campaignId)
    // Guard against racing the webhook: only activate while still draft.
    .eq("status", "draft");

  if (updErr) {
    return { ok: false, error: updErr.message, status: 500 };
  }

  console.log(`[funding] reconcile ${campaignId}: activated from succeeded PI`);
  return { ok: true, activated: true };
}

/**
 * Cancel a still-draft performance campaign and refund its pool funding.
 * Idempotent: re-cancelling a cancelled campaign is a no-op; the Stripe refund
 * uses a deterministic idempotency key so retries can't double-refund.
 */
export async function cancelFundedDraft(
  campaignId: string,
  userId: string
): Promise<FundingResult> {
  const loaded = await loadOwnedPerformanceCampaign(campaignId, userId);
  if (!loaded.ok) return loaded;
  const { campaign } = loaded;

  const plan = planCancellation(campaign);
  if (!plan.ok) {
    if (plan.reason === "already_cancelled") {
      return { ok: true, cancelled: true, alreadyCancelled: true };
    }
    return {
      ok: false,
      error:
        "Only draft campaigns can be cancelled with a refund. This campaign is already live.",
      status: 409,
    };
  }

  // Refund first (idempotent). If it throws, surface the error and DO NOT mark
  // cancelled — the brand's money state must stay consistent.
  let refund: { refunded: boolean; refundId?: string; alreadyRefunded?: boolean; cancelled?: boolean } = {
    refunded: false,
  };
  if (plan.needsRefund && campaign.funding_payment_intent_id) {
    try {
      refund = await refundPoolPayment(
        campaign.funding_payment_intent_id,
        `pool_refund_${campaignId}`
      );
    } catch (err) {
      console.error(`[funding] refund failed for ${campaignId}:`, err);
      return {
        ok: false,
        error: "Refund failed. The campaign was not cancelled — please retry.",
        status: 502,
      };
    }
  }

  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from("campaigns")
    .update({ status: "cancelled" })
    .eq("id", campaignId)
    .eq("status", "draft");

  if (updErr) {
    return { ok: false, error: updErr.message, status: 500 };
  }

  console.log(
    `[funding] cancelled draft ${campaignId} (refunded=${refund.refunded}, alreadyRefunded=${!!refund.alreadyRefunded})`
  );
  return { ok: true, cancelled: true, ...refund };
}
