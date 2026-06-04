import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { CampaignApplyBodySchema } from "@/lib/api/schemas";
import { parseUuidParam } from "@/lib/api/validate";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { applyToCampaign } from "@/lib/api/services/campaign-apply";
import { endRequest } from "@/lib/logger";

export const GET = () => methodNotAllowed(["POST"]);

export async function POST(
  request: Request,
  context: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId: rawId } = await context.params;
  const campaignId = parseUuidParam(rawId);
  if (!campaignId) {
    return jsonError("Invalid campaign ID.", 400);
  }

  const guarded = await guardApiPost(request, {
    schema: CampaignApplyBodySchema,
    rateLimit: "apply",
    routeKey: "campaigns/apply",
    auth: "influencer",
  });
  if (!guarded.ok) return guarded.response;
  const { log, startTime } = guarded.ctx;

  const result = await applyToCampaign(
    campaignId,
    guarded.ctx.auth!.userId,
    guarded.ctx.data
  );

  if (!result.ok) {
    endRequest(log, { statusCode: result.status, startTime });
    return jsonError(result.error, result.status);
  }

  endRequest(log, { statusCode: 200, startTime });
  return jsonSuccess({ participation: result.participation });
}