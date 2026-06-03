import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { RejectClipBodySchema } from "@/lib/api/schemas";
import { parseUuidParam } from "@/lib/api/validate";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { overrideClipFraud } from "@/lib/api/services/clip-moderation";
import { isMockMode } from "@/lib/env";

export const GET = () => methodNotAllowed(["POST"]);

/**
 * Brand override of a fraud flag: clears the flag and keeps the clip earning.
 * The worker will stop soft-score flagging/disqualifying it (hard velocity-cap
 * breaches still disqualify). Owner-only.
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
    routeKey: "clips/fraud-override",
    auth: "business",
  });
  if (!guarded.ok) return guarded.response;

  if (isMockMode) {
    return jsonSuccess({
      clip: { id: clipId, fraud_overridden: true, fraud_flagged: false },
      mock: true,
    });
  }

  const result = await overrideClipFraud(clipId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return jsonSuccess({ clip: result.clip });
}
