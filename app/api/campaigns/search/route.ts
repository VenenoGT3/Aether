import { guardApiGet, methodNotAllowed } from "@/lib/api/guard";
import { CampaignSearchQuerySchema } from "@/lib/api/schemas";
import { jsonSuccess, jsonError } from "@/lib/api/response";
import { createClient } from "@/lib/supabase/server";
import { cached } from "@/lib/cache/swr-cache";
import { endRequest } from "@/lib/logger";
import { getCircuitBreaker } from "@/lib/circuit-breaker";
import { getLimiter, busyResponse } from "@/lib/backpressure";

/** Max concurrent discovery queries per instance — sheds excess load with a 503. */
const DISCOVERY_MAX_CONCURRENCY = 50;

/** Discovery returns the GLOBAL open-campaign list (same for every creator), so
 * it is cached fleet-wide keyed only by the query params — no per-user data. A
 * short TTL keeps it fresh; SWR + single-flight stop the thundering herd when it
 * expires. Tunable via DISCOVER_CACHE_TTL_MS (0 disables). */
const DISCOVER_TTL_MS = (() => {
  const raw = Number(process.env.DISCOVER_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30_000;
})();

interface DiscoveryCampaignRow {
  id: string;
  title: string;
  description: string | null;
  budget_total: number | string;
  target_niches: string[];
  deliverables: unknown;
  timeline: unknown;
  campaign_type: "fixed" | "performance" | string;
  campaign_category: "ugc" | "clipping" | null;
  brand_cpm_rate: number | string | null;
  cpm_rate: number | string | null;
  budget_pool: number | string | null;
  available_pool: number | string | null;
  budget_reserved: number | string | null;
  budget_paid: number | string | null;
  platforms: string[] | null;
  category_meta?: Record<string, unknown> | null;
  content_rules?: Record<string, unknown> | null;
  business_id: string;
  created_at: string;
}

interface BrandPublicProfileRow {
  business_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export const POST = () => methodNotAllowed(["GET"]);

export async function GET(request: Request): Promise<Response> {
  // Backpressure: shed load (503) when too many discovery queries are in flight,
  // protecting the DB/cache from a thundering herd. Slot released in finally.
  const slot = getLimiter("discovery", DISCOVERY_MAX_CONCURRENCY).tryAcquire();
  if (!slot) return busyResponse();
  try {
    return await handleSearch(request);
  } finally {
    slot.release();
  }
}

async function handleSearch(request: Request): Promise<Response> {
  const guarded = await guardApiGet(request, {
    schema: CampaignSearchQuerySchema,
    rateLimit: "search",
    routeKey: "campaigns/search",
    auth: true,
  });
  if (!guarded.ok) return guarded.response;
  const { log, startTime } = guarded.ctx;

  const { q, niche, category, page, limit } = guarded.ctx.data;
  const offset = (page - 1) * limit;

  const supabase = await createClient();

  const runQuery = async () => {
    // Breaker on this READ path only — safe to fail open because discovery is
    // cache-backed (stale data is served while Supabase recovers). Money-path
    // Supabase calls deliberately do NOT use a breaker: the DB is the system of
    // record, so they must surface a real error rather than proceed degraded.
    // (supabase-js resolves errors via { error } instead of throwing, so we
    // record outcomes manually rather than using breaker.exec().)
    const breaker = getCircuitBreaker("supabase-read", { failureThreshold: 5, openDurationMs: 30_000 });
    if (!breaker.allowRequest()) {
      throw new Error("supabase-read circuit open");
    }
    try {
      let query = supabase
        .from("campaigns")
        .select(
          "id, title, description, budget_total, target_niches, deliverables, timeline, status, business_id, created_at, campaign_type, campaign_category, brand_cpm_rate, cpm_rate, budget_pool, available_pool, budget_reserved, budget_paid, platforms, category_meta, content_rules",
          { count: "exact" }
        )
        .eq("status", "open")
        .eq("campaign_type", "performance")
        .contains("platforms", ["youtube"])
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
      if (niche) query = query.contains("target_niches", [niche]);
      if (category) query = query.eq("campaign_category", category);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message || "campaign search failed");

      const rows = (data ?? []) as DiscoveryCampaignRow[];
      const businessIds = [
        ...new Set(rows.map((campaign) => campaign.business_id).filter(Boolean)),
      ];
      const brandProfiles = new Map<string, BrandPublicProfileRow>();
      if (businessIds.length > 0) {
        const { data: brandRows, error: brandError } = await supabase
          .from("brand_public_profiles")
          .select("business_id, display_name, avatar_url")
          .in("business_id", businessIds);

        // The table is created by the latest migration. Until that migration is
        // applied in every environment, discovery still returns campaign rows.
        if (brandError && brandError.code !== "42P01") {
          throw new Error(brandError.message || "brand profile lookup failed");
        }
        for (const brand of (brandRows ?? []) as BrandPublicProfileRow[]) {
          brandProfiles.set(brand.business_id, brand);
        }
      }

      breaker.recordSuccess();
      return {
        campaigns: rows.map((campaign) => {
          const brand = brandProfiles.get(campaign.business_id);
          return {
            ...campaign,
            businessName: brand?.display_name ?? null,
            businessAvatarUrl: brand?.avatar_url ?? null,
          };
        }),
        total: count ?? 0,
      };
    } catch (err) {
      breaker.recordFailure(err);
      throw err;
    }
  };

  try {
    // Global discovery feed → fleet-wide cache keyed by the query signature.
    // SWR + single-flight prevent a thundering herd when the entry expires.
    const result =
      DISCOVER_TTL_MS > 0
        ? await cached({
            namespace: "discover",
            tenant: "_global_",
            key: `q=${q}|niche=${niche}|cat=${category ?? ""}|p=${page}|l=${limit}`,
            ttlMs: DISCOVER_TTL_MS,
            staleGraceMs: DISCOVER_TTL_MS * 4,
            compute: runQuery,
          })
        : await runQuery();

    endRequest(log, { statusCode: 200, startTime });
    return jsonSuccess({ campaigns: result.campaigns, page, limit, total: result.total });
  } catch (error) {
    log.error({ err: error }, "campaign_search.failed");
    endRequest(log, { statusCode: 500, startTime });
    return jsonError("Could not load campaigns. Please try again.", 500);
  }
}
