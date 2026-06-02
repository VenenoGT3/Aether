import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { ApproveClipBodySchema } from "@/lib/api/schemas";
import { parseUuidParam } from "@/lib/api/validate";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { approveClip } from "@/lib/api/services/clip-moderation";
import { isMockMode } from "@/lib/env";

export const GET = () => methodNotAllowed(["POST"]);

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
    schema: ApproveClipBodySchema,
    rateLimit: "submit",
    routeKey: "clips/approve",
    auth: "business",
  });
  if (!guarded.ok) return guarded.response;

  if (isMockMode) {
    return jsonSuccess({
      clip: {
        id: clipId,
        status: "tracking",
        reviewed_at: new Date().toISOString(),
        reviewed_by: guarded.ctx.auth!.userId,
      },
      mock: true,
    });
  }

  const result = await approveClip(clipId, guarded.ctx.auth!.userId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonSuccess({ clip: result.clip });
}
