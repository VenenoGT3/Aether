import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { CampaignFundingBodySchema } from "@/lib/api/schemas";
import { parseUuidParam } from "@/lib/api/validate";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { cancelFundedDraft } from "@/lib/api/services/campaign-funding";
import { isMockMode } from "@/lib/env";

export const GET = () => methodNotAllowed(["POST"]);

/**
 * Cancel a still-DRAFT performance campaign and refund its pool funding.
 * Owner-only; refund is idempotent. Live (already 'open') campaigns are rejected.
 */
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
    schema: CampaignFundingBodySchema,
    rateLimit: "apply",
    routeKey: "campaigns/cancel",
    auth: "business",
  });
  if (!guarded.ok) return guarded.response;

  if (isMockMode) {
    return jsonSuccess({ cancelled: true, refunded: true, mock: true });
  }

  const result = await cancelFundedDraft(campaignId, guarded.ctx.auth!.userId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return jsonSuccess(result);
}
