import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { RequestChangesClipBodySchema } from "@/lib/api/schemas";
import { parseUuidParam } from "@/lib/api/validate";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { requestChangesClip } from "@/lib/api/services/clip-moderation";
import { isMockMode } from "@/lib/env";

export const GET = () => methodNotAllowed(["POST"]);

/**
 * Quality control: brand requests changes on a pending clip. The clip leaves the
 * review queue (quality_status='changes_requested') and the creator sees the
 * feedback so they can resubmit an improved clip. Owner-only.
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
    schema: RequestChangesClipBodySchema,
    rateLimit: "submit",
    routeKey: "clips/request-changes",
    auth: "business",
  });
  if (!guarded.ok) return guarded.response;

  if (isMockMode) {
    return jsonSuccess({
      clip: {
        id: clipId,
        status: "pending",
        reviewed_at: new Date().toISOString(),
        reviewed_by: guarded.ctx.auth!.userId,
      },
      mock: true,
    });
  }

  const result = await requestChangesClip(
    clipId,
    guarded.ctx.auth!.userId,
    guarded.ctx.data.reason,
    guarded.ctx.data.quality_score
  );
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonSuccess({ clip: result.clip });
}
