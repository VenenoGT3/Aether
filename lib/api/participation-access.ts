import { createClient } from "@/lib/supabase/server";
import {
  canReadParticipation,
  canInsertPost,
} from "@/lib/rls-policies";
import { forbiddenError } from "@/lib/api/response";

/**
 * Verifies the authenticated user may read/write data for a participation.
 * Uses RLS-aligned rules before DB operations in API routes.
 */
export async function assertParticipationAccess(
  userId: string,
  participationId: string,
  intent: "read" | "submit_post"
): Promise<
  | {
      ok: true;
      participation: {
        id: string;
        influencer_id: string;
        campaign_id: string;
        status: string;
      };
      campaignBusinessId: string;
    }
  | { ok: false; response: Response }
> {
  const supabase = await createClient();

  const { data: participation, error } = await supabase
    .from("participations")
    .select("id, influencer_id, campaign_id, status")
    .eq("id", participationId)
    .single();

  if (error || !participation) {
    return { ok: false, response: forbiddenError("Participation not found") };
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("business_id")
    .eq("id", participation.campaign_id)
    .single();

  const businessId = campaign?.business_id ?? "";

  if (
    !canReadParticipation(
      userId,
      participation.influencer_id,
      businessId
    )
  ) {
    return { ok: false, response: forbiddenError() };
  }

  if (
    intent === "submit_post" &&
    !canInsertPost(userId, participation.influencer_id)
  ) {
    return { ok: false, response: forbiddenError("Only the creator can submit posts") };
  }

  return {
    ok: true,
    participation,
    campaignBusinessId: businessId,
  };
}