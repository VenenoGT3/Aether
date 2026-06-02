import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { RejectClipBodySchema } from "@/lib/api/schemas";
import { parseUuidParam } from "@/lib/api/validate";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { disqualifyClip } from "@/lib/api/services/clip-moderation";
import { isMockMode } from "@/lib/env";

export const GET = () => methodNotAllowed(["POST"]);

/**
 * Disqualify a fraud-flagged clip (brand acting on a fraud-risk flag). Sets the
 * clip to 'disqualified' — it stops earning and accrued earnings are reversed.
 * Owner-only.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ clipId: string }> }
) {
  const { clipId: rawId } = await context.params;
  const clipId = parseUuidParam(rawId);
  if (!clipId) {
    return jsonError("Invalid clip ID.", 400);
  }

  const guarded = await guardApiPost(request, {
    schema: RejectClipBodySchema,
    rateLimit: "submit",
    routeKey: "clips/disqualify",
    auth: "business",
  });
  if (!guarded.ok) return guarded.response;

  if (isMockMode) {
    return jsonSuccess({
      clip: { id: clipId, status: "disqualified", reviewed_by: guarded.ctx.auth!.userId },
      mock: true,
    });
  }

  const result = await disqualifyClip(
    clipId,
    guarded.ctx.auth!.userId,
    guarded.ctx.data.reason
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonSuccess({ clip: result.clip });
}
