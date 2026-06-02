import { createClient } from "@/lib/supabase/server";
import type { ClipSubmitBody } from "@/lib/api/schemas";

function detectPlatform(
  postUrl: string,
  explicit?: "instagram" | "tiktok" | "youtube"
): "instagram" | "tiktok" | "youtube" {
  if (explicit) return explicit;
  const lower = postUrl.toLowerCase();
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  return "instagram";
}

export type SubmittedClip = {
  id: string;
  campaign_id: string;
  participation_id: string;
  status: string;
};

export type ClipSubmitResult =
  | { ok: true; clip: SubmittedClip }
  | { ok: false; error: string; status: number };

/**
 * Submit a clip (post URL) for a performance campaign the creator has joined.
 * Requires an active participation; the unique (campaign_id, post_url)
 * constraint blocks duplicate submissions. New clips start as 'pending' and
 * are moved to 'tracking' by brand moderation (later phase) before they accrue.
 */
export async function submitClip(
  userId: string,
  body: ClipSubmitBody
): Promise<ClipSubmitResult> {
  const supabase = await createClient();

  // The creator must already participate in this campaign.
  const { data: participation, error: partErr } = await supabase
    .from("participations")
    .select("id, status")
    .eq("campaign_id", body.campaign_id)
    .eq("influencer_id", userId)
    .maybeSingle();

  if (partErr) {
    return {
      ok: false,
      error: "Could not verify your campaign participation.",
      status: 500,
    };
  }

  if (!participation) {
    return {
      ok: false,
      error: "Join this campaign before submitting clips.",
      status: 403,
    };
  }

  if (participation.status !== "active") {
    return {
      ok: false,
      error: "Your participation in this campaign is not active.",
      status: 409,
    };
  }

  // Anti-fraud: the same post can't be reused across campaigns to double-dip a
  // single video's views against multiple pools. The per-campaign unique
  // constraint already blocks same-campaign dupes; this catches the same URL
  // still active in *another* campaign. (RLS scopes this to the caller's own
  // clips, so it stops a creator reusing their own post; terminal-state clips
  // — rejected/disqualified — are excluded so a clean re-submission is allowed.)
  const { data: reused } = await supabase
    .from("clips")
    .select("id")
    .eq("post_url", body.post_url)
    .neq("campaign_id", body.campaign_id)
    .in("status", ["pending", "approved", "tracking"])
    .limit(1)
    .maybeSingle();

  if (reused) {
    return {
      ok: false,
      error: "This post has already been submitted to another campaign.",
      status: 409,
    };
  }

  const platform = detectPlatform(body.post_url, body.platform);

  const { data: clip, error: insertErr } = await supabase
    .from("clips")
    .insert({
      campaign_id: body.campaign_id,
      participation_id: participation.id,
      creator_id: userId,
      platform,
      post_url: body.post_url,
      status: "pending",
    })
    .select("id, campaign_id, participation_id, status")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      return {
        ok: false,
        error: "This clip has already been submitted to this campaign.",
        status: 409,
      };
    }
    return {
      ok: false,
      error: insertErr.message || "Could not submit your clip.",
      status: 500,
    };
  }

  return { ok: true, clip };
}
