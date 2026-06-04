import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { ClipSubmitBody } from "@/lib/api/schemas";
import { budgetUsage, isNearlyFull, isPoolExhausted } from "@/lib/campaign-budget";
import { apiLog } from "@/lib/api/trace-log";
import {
  defaultViewProviderForPlatform,
  detectSocialPlatform,
  extractPlatformPostId,
} from "@/lib/social-post";

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
  const traceId = randomUUID();
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

  // Budget threshold gate (soft, best-effort): refuse new clips once a campaign
  // is closed or has used >= 90% of its pool. The hard overspend guard lives in
  // record_clip_earning; this just gives creators clear, early feedback.
  const { data: campaign } = await supabase
    .from("campaigns")
    .select(
      "status, campaign_type, campaign_category, platforms, budget_pool, available_pool, budget_reserved, budget_paid"
    )
    .eq("id", body.campaign_id)
    .maybeSingle();

  const platform = detectSocialPlatform(body.post_url, body.platform);
  const externalPostId = extractPlatformPostId(platform, body.post_url);
  const viewProvider = defaultViewProviderForPlatform(platform);

  if (campaign) {
    const usage =
      campaign.campaign_type === "performance" ? budgetUsage(campaign) : null;

    if (campaign.status !== "open" && campaign.status !== "in_progress") {
      return {
        ok: false,
        error: "This campaign is closed and is not accepting new clips.",
        status: 409,
      };
    }
    if (usage && isPoolExhausted(usage)) {
      apiLog("alert", "clip.submit.blocked_100pct", {
        traceId,
        campaignId: body.campaign_id,
        used: usage.used,
        pool: usage.pool,
      });
      return {
        ok: false,
        error: "This campaign has used its full budget and is closed to new clips.",
        status: 409,
      };
    }
    if (usage && isNearlyFull(usage)) {
      apiLog("warn", "clip.submit.blocked_90pct", {
        traceId,
        campaignId: body.campaign_id,
        usedPct: usage.pct,
      });
      return {
        ok: false,
        error:
          "This campaign has used most of its budget and is no longer accepting new clips. Try another campaign.",
        status: 409,
      };
    }
    const allowedPlatforms = (campaign.platforms as string[] | null) ?? [];
    if (
      campaign.campaign_type === "performance" &&
      allowedPlatforms.length > 0 &&
      !allowedPlatforms.includes(platform)
    ) {
      apiLog("warn", "clip.submit.platform_rejected", {
        traceId,
        campaignId: body.campaign_id,
        platform,
        allowed: allowedPlatforms,
        category: campaign.campaign_category,
      });
      return {
        ok: false,
        error: `This campaign only accepts clips on: ${allowedPlatforms.join(", ")}.`,
        status: 409,
      };
    }
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

  const { data: clip, error: insertErr } = await supabase
    .from("clips")
    .insert({
      campaign_id: body.campaign_id,
      participation_id: participation.id,
      creator_id: userId,
      platform,
      post_url: body.post_url,
      external_post_id: externalPostId,
      view_provider: viewProvider,
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
    if (insertErr.code === "23514") {
      const msg = insertErr.message ?? "";
      if (msg.includes("not accepting new clips") && msg.includes("closed")) {
        return {
          ok: false,
          error: "This campaign is closed and is not accepting new clips.",
          status: 409,
        };
      }
      if (msg.includes("full budget") || msg.includes("budget_exhausted")) {
        return {
          ok: false,
          error: "This campaign has used its full budget and is closed to new clips.",
          status: 409,
        };
      }
      if (msg.includes("most of its budget")) {
        return {
          ok: false,
          error:
            "This campaign has used most of its budget and is no longer accepting new clips. Try another campaign.",
          status: 409,
        };
      }
      if (msg.includes("platform is not allowed")) {
        return {
          ok: false,
          error: "This clip platform is not allowed for this campaign.",
          status: 409,
        };
      }
      if (msg.includes("not configured for clip")) {
        return {
          ok: false,
          error: "This campaign is not configured for clip submissions.",
          status: 409,
        };
      }
    }
    apiLog("alert", "clip.submit.failed", {
      traceId,
      campaignId: body.campaign_id,
      code: insertErr.code,
      error: insertErr.message,
    });
    // Full error already captured via the [ALERT] log above; never echo the raw
    // DB message to the user.
    return {
      ok: false,
      error: "Could not submit your clip. Please try again.",
      status: 500,
    };
  }

  apiLog("info", "clip.submit.ok", {
    traceId,
    clipId: clip.id,
    campaignId: body.campaign_id,
    platform,
  });
  return { ok: true, clip };
}
