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

type ModerationAction = "approve" | "reject";

/**
 * Approving makes the clip eligible for the view-sync worker, which only
 * processes clips in 'tracking' (see record_clip_earning). So approval
 * transitions pending/rejected -> 'tracking'. ('approved' stays a reserved
 * status; collapsing it into 'tracking' keeps a single "eligible to earn"
 * source of truth.)
 */
const APPROVABLE_FROM = ["pending", "rejected"];
const REJECTABLE_FROM = ["pending", "approved", "tracking"];
/** Terminal clip states that can no longer be moderated. */
const TERMINAL_STATUSES = ["disqualified"];

async function moderateClip(
  clipId: string,
  brandUserId: string,
  action: ModerationAction,
  note?: string
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

  // State-transition guard.
  let nextStatus: string;
  if (action === "approve") {
    if (!APPROVABLE_FROM.includes(clip.status)) {
      return {
        ok: false,
        error: `Cannot approve a clip in '${clip.status}' state.`,
        status: 409,
      };
    }
    nextStatus = "tracking";
  } else {
    if (!REJECTABLE_FROM.includes(clip.status)) {
      return {
        ok: false,
        error: `Cannot reject a clip in '${clip.status}' state.`,
        status: 409,
      };
    }
    nextStatus = "rejected";
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("clips")
    .update({
      status: nextStatus,
      reviewed_at: nowIso,
      reviewed_by: brandUserId,
      review_note: action === "reject" ? note ?? null : null,
      // Explicit brand decision → record the timestamp and mark it non-automatic.
      approved_at: action === "approve" ? nowIso : null,
      rejected_at: action === "reject" ? nowIso : null,
      auto_approved: false,
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
  brandUserId: string
): Promise<ClipModerationResult> {
  return moderateClip(clipId, brandUserId, "approve");
}

/** Reject a clip → 'rejected' (no longer accrues earnings). */
export function rejectClip(
  clipId: string,
  brandUserId: string,
  reason?: string
): Promise<ClipModerationResult> {
  return moderateClip(clipId, brandUserId, "reject", reason);
}
