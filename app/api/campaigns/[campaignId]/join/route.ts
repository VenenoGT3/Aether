import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { CampaignJoinBodySchema } from "@/lib/api/schemas";
import { parseUuidParam } from "@/lib/api/validate";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { joinCampaign } from "@/lib/api/services/campaign-join";
import { isMockMode } from "@/lib/env";

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
    schema: CampaignJoinBodySchema,
    rateLimit: "apply",
    routeKey: "campaigns/join",
    auth: "influencer",
  });
  if (!guarded.ok) return guarded.response;

  if (isMockMode) {
    return jsonSuccess({
      participation: {
        id: `part_mock_${Date.now()}`,
        campaign_id: campaignId,
        influencer_id: guarded.ctx.auth!.userId,
        status: "active",
      },
      alreadyJoined: false,
      mock: true,
    });
  }

  const result = await joinCampaign(campaignId, guarded.ctx.auth!.userId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return jsonSuccess({
    participation: result.participation,
    alreadyJoined: result.alreadyJoined,
  });
}
