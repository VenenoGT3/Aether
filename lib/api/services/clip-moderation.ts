import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { apiLog } from "@/lib/api/trace-log";

export type ModeratedClip = {
  id: string;
  status: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export type ClipModerationResult =
  | { ok: true; clip: ModeratedClip; idempotent?: boolean }
  | { ok: false; error: string; status: number };

type RpcPayload = {
  ok?: boolean;
  clip_id?: string;
  status?: string;
  reviewed_at?: string;
  reviewed_by?: string;
  idempotent?: boolean;
};

function mapRpcError(message: string): { error: string; status: number } {
  const m = message.toLowerCase();
  if (m.includes("authentication required") || m.includes("not_authenticated")) {
    return { error: "Authentication required.", status: 401 };
  }
  if (m.includes("own campaigns") || m.includes("forbidden")) {
    return { error: "You can only moderate clips on your own campaigns.", status: 403 };
  }
  if (m.includes("not found")) {
    return { error: message, status: 404 };
  }
  if (
    m.includes("cannot ") ||
    m.includes("state changed") ||
    m.includes("paid earnings") ||
    m.includes("disqualified") ||
    m.includes("tell the creator")
  ) {
    return { error: message, status: 409 };
  }
  return { error: message, status: 500 };
}

async function callModerationRpc(
  rpcName: string,
  params: Record<string, unknown>,
  traceId: string
): Promise<ClipModerationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpcName, params);

  if (error) {
    apiLog("alert", `clip.moderation.rpc_failed`, {
      traceId,
      rpc: rpcName,
      code: (error as { code?: string }).code,
      error: error.message,
    });
    const mapped = mapRpcError(error.message);
    return { ok: false, ...mapped };
  }

  const payload = (data ?? {}) as RpcPayload;
  if (!payload.ok) {
    apiLog("alert", `clip.moderation.unexpected_payload`, { traceId, rpc: rpcName, data });
    return { ok: false, error: "Moderation failed.", status: 500 };
  }

  if (payload.idempotent) {
    apiLog("info", `clip.moderation.idempotent`, { traceId, rpc: rpcName, clipId: payload.clip_id });
  } else {
    apiLog("info", `clip.moderation.ok`, { traceId, rpc: rpcName, clipId: payload.clip_id, status: payload.status });
  }

  return {
    ok: true,
    idempotent: payload.idempotent === true,
    clip: {
      id: payload.clip_id ?? String(params.p_clip_id),
      status: payload.status ?? "unknown",
      reviewed_at: payload.reviewed_at ?? null,
      reviewed_by: payload.reviewed_by ?? null,
    },
  };
}

/** Approve a clip → 'tracking' (eligible for view-sync / earnings). */
export function approveClip(
  clipId: string,
  _brandUserId: string,
  qualityScore?: number
): Promise<ClipModerationResult> {
  const traceId = randomUUID();
  return callModerationRpc("approve_clip", {
    p_clip_id: clipId,
    p_quality_score: qualityScore ?? null,
    p_trace_id: traceId,
  }, traceId);
}

/** Reject a clip → 'rejected' (terminal; reverses accrued earnings via trigger). */
export function rejectClip(
  clipId: string,
  _brandUserId: string,
  reason?: string
): Promise<ClipModerationResult> {
  const traceId = randomUUID();
  return callModerationRpc("reject_clip", {
    p_clip_id: clipId,
    p_reason: reason ?? null,
    p_trace_id: traceId,
  }, traceId);
}

/** Request changes → stays pending, quality_status=changes_requested. */
export function requestChangesClip(
  clipId: string,
  _brandUserId: string,
  reason: string,
  qualityScore?: number
): Promise<ClipModerationResult> {
  const traceId = randomUUID();
  return callModerationRpc("request_changes_clip", {
    p_clip_id: clipId,
    p_reason: reason,
    p_quality_score: qualityScore ?? null,
    p_trace_id: traceId,
  }, traceId);
}

/** Disqualify → 'disqualified' (fraud / policy; stops earning). */
export function disqualifyClip(
  clipId: string,
  _brandUserId: string,
  reason?: string
): Promise<ClipModerationResult> {
  const traceId = randomUUID();
  return callModerationRpc("disqualify_clip", {
    p_clip_id: clipId,
    p_reason: reason ?? null,
    p_trace_id: traceId,
  }, traceId);
}

/**
 * Brand override of a fraud flag: clears the flag and marks the clip so the
 * worker stops soft-score flagging/disqualifying it (hard velocity still applies).
 * Does NOT change clip status. Routed through the atomic override_clip_fraud RPC
 * (owner-checked + per-clip locked); a direct authenticated write is blocked by
 * check_clip_update, so the RPC is the only valid path.
 */
export function overrideClipFraud(clipId: string): Promise<ClipModerationResult> {
  const traceId = randomUUID();
  return callModerationRpc("override_clip_fraud", {
    p_clip_id: clipId,
    p_trace_id: traceId,
  }, traceId);
}
