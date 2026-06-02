import { guardApiGet, methodNotAllowed } from "@/lib/api/guard";
import { CampaignSearchQuerySchema } from "@/lib/api/schemas";
import { jsonSuccess, jsonError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { isMockMode } from "@/lib/env";

export const POST = () => methodNotAllowed(["GET"]);

export async function GET(request: Request) {
  const guarded = await guardApiGet(request, {
    schema: CampaignSearchQuerySchema,
    rateLimit: "search",
    routeKey: "campaigns/search",
    auth: true,
  });
  if (!guarded.ok) return guarded.response;

  const { q, niche, page, limit } = guarded.ctx.data;
  const offset = (page - 1) * limit;

  if (isMockMode) {
    return jsonSuccess({
      campaigns: [],
      page,
      limit,
      total: 0,
      mock: true,
    });
  }

  const supabase = await createClient();

  let query = supabase
    .from("campaigns")
    .select(
      "id, title, description, budget_total, target_niches, status, business_id, created_at, campaign_type, campaign_category, cpm_rate, budget_pool",
      { count: "exact" }
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }

  if (niche) {
    query = query.contains("target_niches", [niche]);
  }

  const { data, error, count } = await query;

  if (error) {
    return jsonError("Could not load campaigns. Please try again.", 500);
  }

  return jsonSuccess({
    campaigns: data ?? [],
    page,
    limit,
    total: count ?? 0,
  });
}