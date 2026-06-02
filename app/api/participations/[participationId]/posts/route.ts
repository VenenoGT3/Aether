import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { PostSubmitBodySchema } from "@/lib/api/schemas";
import { parseUuidParam } from "@/lib/api/validate";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { submitParticipationPost } from "@/lib/api/services/post-submit";
import { isMockMode } from "@/lib/env";

export const GET = () => methodNotAllowed(["POST"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ participationId: string }> }
) {
  const { participationId: rawId } = await context.params;
  const participationId = parseUuidParam(rawId);
  if (!participationId) {
    return jsonError("Invalid participation ID.", 400);
  }

  const guarded = await guardApiPost(request, {
    schema: PostSubmitBodySchema,
    rateLimit: "submit",
    routeKey: "participations/posts",
    auth: "influencer",
  });
  if (!guarded.ok) return guarded.response;

  if (isMockMode) {
    return jsonSuccess({
      post: {
        id: `post_mock_${Date.now()}`,
        participation_id: participationId,
      },
      mock: true,
    });
  }

  const result = await submitParticipationPost(
    participationId,
    guarded.ctx.auth!.userId,
    guarded.ctx.data
  );

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonSuccess({ post: result.post });
}