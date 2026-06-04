import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { ClipSubmitBodySchema } from "@/lib/api/schemas";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { submitClip } from "@/lib/api/services/clip-submit";
import { endRequest } from "@/lib/logger";
import { getLimiter, busyResponse } from "@/lib/backpressure";

/** Shared concurrency budget for clip writes (submission + moderation). */
const CLIP_WRITE_MAX_CONCURRENCY = 40;

export const GET = () => methodNotAllowed(["POST"]);

export async function POST(request: Request): Promise<Response> {
  const slot = getLimiter("clip-write", CLIP_WRITE_MAX_CONCURRENCY).tryAcquire();
  if (!slot) return busyResponse();
  try {
    return await handleClipSubmit(request);
  } finally {
    slot.release();
  }
}

async function handleClipSubmit(request: Request): Promise<Response> {
  const guarded = await guardApiPost(request, {
    schema: ClipSubmitBodySchema,
    rateLimit: "submit",
    routeKey: "clips/submit",
    auth: "influencer",
  });
  if (!guarded.ok) return guarded.response;
  const { log, startTime } = guarded.ctx;

  const result = await submitClip(guarded.ctx.auth!.userId, guarded.ctx.data);
  if (!result.ok) {
    endRequest(log, { statusCode: result.status, startTime });
    return jsonError(result.error, result.status);
  }

  endRequest(log, { statusCode: 200, startTime });
  return jsonSuccess({ clip: result.clip });
}
