import { createClient } from "@/lib/supabase/server";

export type ModeratedClip = {
  id: string;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export type ClipModerationResult =
  | { ok: true; clip: ModeratedClip }
  | { ok: false; error: string; status: number };

type ModerationAction = "approve" | "reject" | "request_changes" | "disqualify";

/**
 * Quality control: a brand decision moves both the operational `status` and the
 * `quality_status` together, preserving the invariant tracking <=> approved:
 *   approve         -> status=tracking,  quality_status=approved   (earns)
 *   reject          -> status=rejected,  quality_status=rejected   (terminal)
 *   request_changes -> status=pending,   quality_status=changes_requested
 *                      (leaves the brand queue; creator resubmits an improved clip)
 *
 * The worker only pays 'tracking' clips, and record_clip_earning also guards on
 * quality_status='approved', so only quality-approved clips ever earn.
 */
const APPROVABLE_FROM = ["pending", "rejected"];
const REJECTABLE_FROM = ["pending", "approved", "tracking"];
/** Terminal clip states that can no longer be moderated. */
const TERMINAL_STATUSES = ["disqualified"];

async function moderateClip(
  clipId: string,
  brandUserId: string,
  action: ModerationAction,
  note?: string,
  qualityScore?: number
): Promise<ClipModerationResult> {
  const supabase = await createClient();

  const { data: clip, error: clipErr } = await supabase
    .from("clips")
    .select("id, status, campaign_id")
    .eq("id", clipId)
    .maybeSingle();

  if (clipErr) {
    return { ok: false, error: "Could not load the clip.", status: 500 };
  }
  if (!clip) {
    return { ok: false, error: "Clip not found.", status: 404 };
  }

  // Authorization: only the brand that owns the campaign may moderate.
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("business_id")
    .eq("id", clip.campaign_id)
    .maybeSingle();

  if (campErr || !campaign) {
    return { ok: false, error: "Campaign not found.", status: 404 };
  }
  if (campaign.business_id !== brandUserId) {
    return {
      ok: false,
      error: "You can only moderate clips on your own campaigns.",
      status: 403,
    };
  }

  // Terminal-state guard.
  if (TERMINAL_STATUSES.includes(clip.status)) {
    return {
      ok: false,
      error: `This clip is '${clip.status}' and can no longer be moderated.`,
      status: 409,
    };
  }

  // Financial final-state guard: never re-moderate a clip with paid earnings.
  const { count: paidCount, error: paidErr } = await supabase
    .from("earnings")
    .select("id", { count: "exact", head: true })
    .eq("clip_id", clipId)
    .eq("status", "paid");

  if (paidErr) {
    return { ok: false, error: "Could not verify clip earnings.", status: 500 };
  }
  if ((paidCount ?? 0) > 0) {
    return {
      ok: false,
      error: "This clip already has paid earnings and cannot be moderated.",
      status: 409,
    };
  }

  // State-transition guard + status/quality_status mapping per action.
  let nextStatus: string;
  let nextQuality: string;
  if (action === "approve") {
    if (!APPROVABLE_FROM.includes(clip.status)) {
      return { ok: false, error: `Cannot approve a clip in '${clip.status}' state.`, status: 409 };
    }
    nextStatus = "tracking";
    nextQuality = "approved";
  } else if (action === "request_changes") {
    // Only a not-yet-tracking clip can be sent back for changes.
    if (clip.status !== "pending") {
      return {
        ok: false,
        error: `Cannot request changes on a clip in '${clip.status}' state.`,
        status: 409,
      };
    }
    nextStatus = "pending"; // stays out of tracking; creator resubmits
    nextQuality = "changes_requested";
  } else if (action === "disqualify") {
    // Fraud removal (e.g. brand actioning a flagged clip): stop it earning.
    if (!REJECTABLE_FROM.includes(clip.status)) {
      return { ok: false, error: `Cannot disqualify a clip in '${clip.status}' state.`, status: 409 };
    }
    nextStatus = "disqualified";
    nextQuality = "rejected";
  } else {
    if (!REJECTABLE_FROM.includes(clip.status)) {
      return { ok: false, error: `Cannot reject a clip in '${clip.status}' state.`, status: 409 };
    }
    nextStatus = "rejected";
    nextQuality = "rejected";
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("clips")
    .update({
      status: nextStatus,
      reviewed_at: nowIso,
      reviewed_by: brandUserId,
      review_note: action === "approve" ? null : note ?? null,
      approved_at: action === "approve" ? nowIso : null,
      rejected_at: action === "reject" || action === "disqualify" ? nowIso : null,
      auto_approved: false,
      // Quality control fields.
      quality_status: nextQuality,
      quality_reviewed_at: nowIso,
      quality_reviewed_by: brandUserId,
      quality_notes: action === "approve" ? null : note ?? null,
      quality_score: qualityScore ?? null,
    })
    .eq("id", clipId)
    .select("id, status, reviewed_at, reviewed_by")
    .single();

  if (updErr) {
    return {
      ok: false,
      error: updErr.message || "Could not update the clip.",
      status: 500,
    };
  }

  return { ok: true, clip: updated };
}

/** Approve a clip → 'tracking' (eligible for the view-sync worker). */
export function approveClip(
  clipId: string,
  brandUserId: string,
  qualityScore?: number
): Promise<ClipModerationResult> {
  return moderateClip(clipId, brandUserId, "approve", undefined, qualityScore);
}

/** Reject a clip → 'rejected' (no longer accrues earnings). */
export function rejectClip(
  clipId: string,
  brandUserId: string,
  reason?: string
): Promise<ClipModerationResult> {
  return moderateClip(clipId, brandUserId, "reject", reason);
}

/** Request changes → 'changes_requested' (creator resubmits an improved clip). */
export function requestChangesClip(
  clipId: string,
  brandUserId: string,
  reason: string,
  qualityScore?: number
): Promise<ClipModerationResult> {
  return moderateClip(clipId, brandUserId, "request_changes", reason, qualityScore);
}

/** Disqualify → 'disqualified' (fraud removal; stops earning, reverses accrued). */
export function disqualifyClip(
  clipId: string,
  brandUserId: string,
  reason?: string
): Promise<ClipModerationResult> {
  return moderateClip(clipId, brandUserId, "disqualify", reason);
}
