import "server-only";
import { createClient } from "@/lib/supabase/server";

export type LandingStats = {
  openCampaigns: number | null;
  activeCreators: number | null;
  verifiedViews: number | null;
  creatorEarnings: number | null;
  fundedPool: number | null;
};

const EMPTY_STATS: LandingStats = {
  openCampaigns: null,
  activeCreators: null,
  verifiedViews: null,
  creatorEarnings: null,
  fundedPool: null,
};

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function settledData<T>(result: PromiseSettledResult<{ data: T | null; error: unknown }>): T | null {
  if (result.status !== "fulfilled" || result.value.error) return null;
  return result.value.data ?? null;
}

function settledCount(result: PromiseSettledResult<{ count: number | null; error: unknown }>): number | null {
  if (result.status !== "fulfilled" || result.value.error) return null;
  return result.value.count ?? 0;
}

/**
 * Public homepage aggregates. These use the normal Supabase anon/RLS path, not
 * service role. If RLS does not expose a table publicly, the related stat stays
 * null and the landing page renders a non-numeric readiness state instead.
 */
export async function getLandingStats(): Promise<LandingStats> {
  try {
    const supabase = await createClient();

    const [
      openCampaigns,
      activeCreators,
      clips,
      earnings,
      campaigns,
    ] = await Promise.allSettled([
      supabase
        .from("campaigns")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .eq("campaign_type", "performance"),
      supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("role", "influencer"),
      supabase
        .from("clips")
        .select("current_views")
        .in("status", ["approved", "tracking"]),
      supabase
        .from("earnings")
        .select("amount")
        .in("status", ["approved", "paid"]),
      supabase
        .from("campaigns")
        .select("budget_pool")
        .eq("campaign_type", "performance")
        .in("status", ["open", "in_progress", "completed", "exhausted"]),
    ]);

    const clipRows = settledData<Array<{ current_views: number | null }>>(clips);
    const earningRows = settledData<Array<{ amount: number | null }>>(earnings);
    const campaignRows = settledData<Array<{ budget_pool: number | null }>>(campaigns);

    return {
      openCampaigns: settledCount(openCampaigns),
      activeCreators: settledCount(activeCreators),
      verifiedViews: clipRows
        ? clipRows.reduce((sum, row) => sum + numeric(row.current_views), 0)
        : null,
      creatorEarnings: earningRows
        ? earningRows.reduce((sum, row) => sum + numeric(row.amount), 0)
        : null,
      fundedPool: campaignRows
        ? campaignRows.reduce((sum, row) => sum + numeric(row.budget_pool), 0)
        : null,
    };
  } catch {
    return EMPTY_STATS;
  }
}
