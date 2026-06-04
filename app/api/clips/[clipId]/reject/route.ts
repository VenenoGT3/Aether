import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { RejectClipBodySchema } from "@/lib/api/schemas";
import { parseUuidParam } from "@/lib/api/validate";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { rejectClip } from "@/lib/api/services/clip-moderation";
import { endRequest } from "@/lib/logger";
import { getLimiter, busyResponse } from "@/lib/backpressure";

export const GET = () => methodNotAllowed(["POST"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ clipId: string }> }
): Promise<Response> {
  // Shared "clip-write" concurrency budget (see app/api/clips/route.ts).
  const slot = getLimiter("clip-write", 40).tryAcquire();
  if (!slot) return busyResponse();
  try {
    return await handleModeration(request, context);
  } finally {
    slot.release();
  }
}

async function handleModeration(
  request: Request,
  context: { params: Promise<{ clipId: string }> }
): Promise<Response> {
  const { clipId: rawId } = await context.params;
  const clipId = parseUuidParam(rawId);
  if (!clipId) {
    return jsonError("Invalid clip ID.", 400);
  }

  const guarded = await guardApiPost(request, {
    schema: RejectClipBodySchema,
    rateLimit: "submit",
    routeKey: "clips/reject",
    auth: "business",
  });
  if (!guarded.ok) return guarded.response;
  const { log, startTime } = guarded.ctx;

  const result = await rejectClip(
    clipId,
    guarded.ctx.auth!.userId,
    guarded.ctx.data.reason
  );
  if (!result.ok) {
    endRequest(log, { statusCode: result.status, startTime });
    return jsonError(result.error, result.status);
  }

  endRequest(log, { statusCode: 200, startTime });
  return jsonSuccess({ clip: result.clip });
}
