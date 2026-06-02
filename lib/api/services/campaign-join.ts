import { createClient } from "@/lib/supabase/server";
import { PROFILE_PK_COLUMN } from "@/lib/supabase/profile";

export type JoinedParticipation = {
  id: string;
  campaign_id: string;
  influencer_id: string;
  status: string;
};

export type JoinResult =
  | { ok: true; alreadyJoined: boolean; participation: JoinedParticipation }
  | { ok: false; error: string; status: number };

/**
 * Open join: a creator joins a performance campaign directly — no pitch, no
 * brand approval. Idempotent (re-joining returns the existing participation).
 * The DB enforce_open_join trigger pins status='active' and zeroes the rollups.
 */
export async function joinCampaign(
  campaignId: string,
  userId: string
): Promise<JoinResult> {
  const supabase = await createClient();

  // Only onboarded creators may join.
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("onboarded")
    .eq(PROFILE_PK_COLUMN, userId)
    .single();

  if (profErr || !profile?.onboarded) {
    return {
      ok: false,
      error: "Complete your creator onboarding before joining campaigns.",
      status: 403,
    };
  }

  // Campaign must exist, be a performance campaign, and be accepting creators.
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, status, campaign_type")
    .eq("id", campaignId)
    .single();

  if (campErr || !campaign) {
    return { ok: false, error: "Campaign not found.", status: 404 };
  }

  if (campaign.campaign_type !== "performance") {
    return {
      ok: false,
      error: "This campaign does not support open joining.",
      status: 400,
    };
  }

  if (campaign.status !== "open" && campaign.status !== "in_progress") {
    return {
      ok: false,
      error: "This campaign is not currently accepting creators.",
      status: 409,
    };
  }

  // Idempotent: if already joined, return the existing participation.
  const { data: existing } = await supabase
    .from("participations")
    .select("id, campaign_id, influencer_id, status")
    .eq("campaign_id", campaignId)
    .eq("influencer_id", userId)
    .maybeSingle();

  if (existing) {
    return { ok: true, alreadyJoined: true, participation: existing };
  }

  // Insert. enforce_open_join pins status='active' for performance campaigns.
  const { data: participation, error: insertErr } = await supabase
    .from("participations")
    .insert({
      campaign_id: campaignId,
      influencer_id: userId,
      status: "active",
      proposed_payout: 0,
    })
    .select("id, campaign_id, influencer_id, status")
    .single();

  if (insertErr) {
    // Unique constraint backstop (race / double-click).
    if (insertErr.code === "23505") {
      const { data: raced } = await supabase
        .from("participations")
        .select("id, campaign_id, influencer_id, status")
        .eq("campaign_id", campaignId)
        .eq("influencer_id", userId)
        .maybeSingle();
      if (raced) {
        return { ok: true, alreadyJoined: true, participation: raced };
      }
      return {
        ok: false,
        error: "You have already joined this campaign.",
        status: 409,
      };
    }
    return {
      ok: false,
      error: insertErr.message || "Could not join the campaign.",
      status: 500,
    };
  }

  return { ok: true, alreadyJoined: false, participation };
}
