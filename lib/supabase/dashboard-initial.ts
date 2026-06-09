import "server-only";

import { createClient } from "@/lib/supabase/server";
import { mergeProfileWithUser, PROFILE_PK_COLUMN } from "@/lib/supabase/profile";
import type { Profile } from "@/types";
import type { DbCampaign } from "@/types/database";
import type { CampaignMetrics } from "@/lib/supabase/metrics";

/**
 * Server-side initial data for the dashboard RSC shells.
 *
 * The dashboard pages are live client apps (realtime subscriptions, event
 * refresh); these loaders only remove the first-paint waterfall by fetching
 * the same RLS-scoped data the client would request on mount — in parallel,
 * before any JS ships. The shapes intentionally mirror the client loaders
 * (getClientProfile / getCampaignsAction / loadDashboardClips /
 * getCampaignMetricsAction) so the client component hydrates seamlessly.
 *
 * Every loader returns null on any failure: the client keeps its own fetch
 * path as fallback, so a server hiccup degrades to the old behavior instead
 * of breaking the page.
 */

export type DashboardCampaignRow = Omit<DbCampaign, "status"> & { status: string };

export interface BrandClipLite {
  id: string;
  campaign_id: string;
  status: string;
  current_views: number | null;
  counted_views: number | null;
  creator_id: string;
  platform: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessDashboardInitialData {
  profile: Profile | null;
  campaigns: DashboardCampaignRow[];
  clips: BrandClipLite[];
  campaignMetrics: Record<string, CampaignMetrics>;
}

export interface CreatorDashboardInitialData {
  profile: Profile | null;
}

const EMPTY_METRICS: CampaignMetrics = {
  clicks: 0,
  impressions: 0,
  conversions: 0,
  attributed_value: 0,
  budget_spent: 0,
};

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function loadProfile(supabase: ServerClient): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: userRow }] = await Promise.all([
    supabase.from("profiles").select("*").eq(PROFILE_PK_COLUMN, user.id).maybeSingle(),
    supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
  ]);

  if (!profile) return null;
  return mergeProfileWithUser(
    profile,
    userRow?.role ?? user.user_metadata?.role,
    user.email
  );
}

/**
 * Aggregate participation performance per campaign. Single query for all
 * campaigns — the client equivalent issues one query per campaign.
 */
async function loadCampaignMetrics(
  supabase: ServerClient,
  campaignIds: string[]
): Promise<Record<string, CampaignMetrics>> {
  const metrics = Object.fromEntries(
    campaignIds.map((id) => [id, { ...EMPTY_METRICS }])
  ) as Record<string, CampaignMetrics>;
  if (campaignIds.length === 0) return metrics;

  const { data, error } = await supabase
    .from("participations")
    .select("campaign_id, performance_data, actual_payout")
    .in("campaign_id", campaignIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const target = metrics[row.campaign_id as string];
    if (!target) continue;
    const perf = (row.performance_data ?? {}) as Record<string, unknown>;
    target.clicks += Number(perf.clicks || 0);
    target.impressions += Number(perf.impressions || 0);
    target.conversions += Number(perf.conversions || 0);
    target.attributed_value += Number(perf.attributed_value || 0);
    target.budget_spent += Number(perf.budget_spent || row.actual_payout || 0);
  }
  return metrics;
}

export async function getBusinessDashboardInitialData(): Promise<BusinessDashboardInitialData | null> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const [profile, campaignsResult] = await Promise.all([
      loadProfile(supabase),
      supabase
        .from("campaigns")
        .select("*")
        .eq("business_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    if (campaignsResult.error) throw campaignsResult.error;

    const campaigns = (campaignsResult.data ?? []) as DashboardCampaignRow[];
    const campaignIds = campaigns.map((campaign) => campaign.id);

    const [clipsResult, campaignMetrics] = await Promise.all([
      campaignIds.length > 0
        ? supabase
            .from("clips")
            .select(
              "id, campaign_id, status, current_views, counted_views, creator_id, platform, created_at, updated_at"
            )
            .in("campaign_id", campaignIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      loadCampaignMetrics(supabase, campaignIds),
    ]);
    if (clipsResult.error) throw clipsResult.error;

    return {
      profile,
      campaigns,
      clips: (clipsResult.data ?? []) as BrandClipLite[],
      campaignMetrics,
    };
  } catch (error) {
    console.error("business dashboard initial data failed; client will fetch:", error);
    return null;
  }
}

export async function getCreatorDashboardInitialData(): Promise<CreatorDashboardInitialData | null> {
  try {
    const supabase = await createClient();
    const profile = await loadProfile(supabase);
    if (!profile) return null;
    return { profile };
  } catch (error) {
    console.error("creator dashboard initial data failed; client will fetch:", error);
    return null;
  }
}
