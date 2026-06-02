import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { ClipSubmitBodySchema } from "@/lib/api/schemas";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { submitClip } from "@/lib/api/services/clip-submit";
import { isMockMode } from "@/lib/env";

export const GET = () => methodNotAllowed(["POST"]);

export async function POST(request: Request) {
  const guarded = await guardApiPost(request, {
    schema: ClipSubmitBodySchema,
    rateLimit: "submit",
    routeKey: "clips/submit",
    auth: "influencer",
  });
  if (!guarded.ok) return guarded.response;

  if (isMockMode) {
    return jsonSuccess({
      clip: {
        id: `clip_mock_${Date.now()}`,
        campaign_id: guarded.ctx.data.campaign_id,
        participation_id: `part_mock_${Date.now()}`,
        status: "pending",
      },
      mock: true,
    });
  }

  const result = await submitClip(guarded.ctx.auth!.userId, guarded.ctx.data);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonSuccess({ clip: result.clip });
}
