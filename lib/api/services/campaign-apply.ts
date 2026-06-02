import { createClient } from "@/lib/supabase/server";
import {
  assertInfluencerCanApply,
  AuthorizationError,
} from "@/lib/campaign-lifecycle";
import type { CampaignApplyBody } from "@/lib/api/schemas";

export type ApplyResult =
  | {
      ok: true;
      participation: {
        id: string;
        campaign_id: string;
        influencer_id: string;
        status: string;
        proposed_payout: number;
      };
    }
  | { ok: false; error: string; status: number };

export async function applyToCampaign(
  campaignId: string,
  userId: string,
  body: CampaignApplyBody
): Promise<ApplyResult> {
  try {
    assertInfluencerCanApply(userId, userId);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      return { ok: false, error: e.message, status: 403 };
    }
    throw e;
  }

  const supabase = await createClient();

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count: recentApplications, error: countErr } = await supabase
    .from("participations")
    .select("id", { count: "exact", head: true })
    .eq("influencer_id", userId)
    .gte("applied_at", dayAgo);

  if (countErr) {
    return {
      ok: false,
      error: "Could not verify application limits. Please try again.",
      status: 500,
    };
  }

  if ((recentApplications ?? 0) >= 20) {
    return {
      ok: false,
      error:
        "Daily application limit reached (20 per day). Please try again tomorrow.",
      status: 429,
    };
  }

  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, status, business_id, budget_total")
    .eq("id", campaignId)
    .single();

  if (campErr || !campaign) {
    return { ok: false, error: "Campaign not found.", status: 404 };
  }

  if (campaign.status !== "open") {
    return {
      ok: false,
      error: "This campaign is not accepting applications.",
      status: 409,
    };
  }

  if (body.proposed_payout > Number(campaign.budget_total)) {
    return {
      ok: false,
      error: "Proposed payout cannot exceed the campaign budget.",
      status: 400,
    };
  }

  const { data: existing } = await supabase
    .from("participations")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("influencer_id", userId)
    .maybeSingle();

  if (existing) {
    return {
      ok: false,
      error: "You have already applied to this campaign.",
      status: 409,
    };
  }

  const performance_data = body.pitch?.trim()
    ? { pitch: body.pitch.trim() }
    : {};

  const { data: participation, error: insertErr } = await supabase
    .from("participations")
    .insert({
      campaign_id: campaignId,
      influencer_id: userId,
      status: "applied",
      proposed_payout: body.proposed_payout,
      performance_data,
    })
    .select("id, campaign_id, influencer_id, status, proposed_payout")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      return {
        ok: false,
        error: "You have already applied to this campaign.",
        status: 409,
      };
    }
    return {
      ok: false,
      error: insertErr.message || "Could not submit application.",
      status: 500,
    };
  }

  return { ok: true, participation };
}