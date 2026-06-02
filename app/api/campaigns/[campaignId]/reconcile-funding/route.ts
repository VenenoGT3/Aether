import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { CampaignFundingBodySchema } from "@/lib/api/schemas";
import { parseUuidParam } from "@/lib/api/validate";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { reconcileFunding } from "@/lib/api/services/campaign-funding";
import { isMockMode } from "@/lib/env";

export const GET = () => methodNotAllowed(["POST"]);

/**
 * Reconcile a performance campaign's pool funding when the
 * payment_intent.succeeded webhook was missed/failed. Owner-only; activates the
 * campaign only if Stripe confirms the funding PaymentIntent has succeeded.
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
    routeKey: "campaigns/reconcile-funding",
    auth: "business",
  });
  if (!guarded.ok) return guarded.response;

  if (isMockMode) {
    return jsonSuccess({ activated: true, mock: true });
  }

  const result = await reconcileFunding(campaignId, guarded.ctx.auth!.userId);
  if (!result.ok) {
    return jsonError(result.error, result.status);
  }
  return jsonSuccess(result);
}
