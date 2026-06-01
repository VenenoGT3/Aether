import { guardApiGet } from "@/lib/api/guard";
import { CampaignSearchQuerySchema } from "@/lib/api/schemas";
import { jsonSuccess, jsonError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { isMockMode } from "@/lib/env";

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
      "id, title, description, budget_total, target_niches, status, business_id, created_at",
      { count: "exact" }
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    const safe = q.replace(/[%_]/g, "");
    query = query.or(
      `title.ilike.%${safe}%,description.ilike.%${safe}%`
    );
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