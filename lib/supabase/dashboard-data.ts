import "server-only";

import { createClient, getServerUser } from "@/lib/supabase/server";
import type { Profile } from "@/types";

type CampaignStatus =
  | "draft"
  | "open"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "exhausted";

type CampaignType = "fixed" | "performance";
type CampaignCategory = "ugc" | "clipping";
type ParticipationStatus =
  | "applied"
  | "offered"
  | "accepted"
  | "declined"
  | "completed"
  | "cancelled"
  | "active"
  | "banned";
type ClipStatus = "pending" | "approved" | "rejected" | "tracking" | "disqualified";
type EarningStatus = "accrued" | "approved" | "paid" | "reversed";
type PayoutStatus = "pending" | "processing" | "paid" | "failed";

type JsonRecord = Record<string, unknown>;

interface CampaignRow {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  campaign_type: CampaignType | null;
  campaign_category: CampaignCategory | null;
  budget_total: number | string | null;
  budget_pool: number | string | null;
  available_pool: number | string | null;
  budget_reserved: number | string | null;
  budget_paid: number | string | null;
  brand_cpm_rate: number | string | null;
  cpm_rate: number | string | null;
  target_niches: string[] | null;
  platforms: string[] | null;
  deliverables: unknown[] | null;
  timeline: JsonRecord | null;
  funded_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ParticipationRow {
  id: string;
  campaign_id: string;
  influencer_id: string;
  status: ParticipationStatus;
  proposed_payout: number | string | null;
  actual_payout: number | string | null;
  total_views: number | string | null;
  total_earned: number | string | null;
  total_paid: number | string | null;
  creator_cpm_rate: number | string | null;
  performance_data: JsonRecord | null;
  joined_at: string | null;
  applied_at: string | null;
  updated_at: string | null;
}

interface ClipRow {
  id: string;
  campaign_id: string;
  creator_id: string;
  participation_id: string;
  platform: string;
  post_url: string;
  status: ClipStatus;
  current_views: number | string | null;
  counted_views: number | string | null;
  view_provider: string | null;
  quality_status: string | null;
  quality_score: number | string | null;
  quality_notes: string | null;
  fraud_flagged: boolean | null;
  fraud_score: number | string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface EarningRow {
  id: string;
  clip_id: string;
  participation_id: string;
  campaign_id: string;
  creator_id: string;
  billable_views: number | string | null;
  effective_cpm: number | string | null;
  amount: number | string | null;
  status: EarningStatus;
  payout_id: string | null;
  accrued_at: string;
}

interface PayoutRow {
  id: string;
  creator_id: string;
  amount: number | string | null;
  status: PayoutStatus;
  stripe_transfer_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CreatorProfileRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  niches: string[] | null;
  follower_count: number | string | null;
  engagement_rate: number | string | null;
  social_handles: JsonRecord | null;
}

export interface MoneyByStatus {
  accrued: number;
  approved: number;
  paid: number;
  reversed: number;
}

export interface BusinessCampaignSummary {
  id: string;
  title: string;
  description: string;
  status: CampaignStatus;
  campaignType: CampaignType;
  campaignCategory: CampaignCategory | null;
  targetNiches: string[];
  platforms: string[];
  createdAt: string;
  fundedAt: string | null;
  cpmRate: number | null;
  budget: {
    total: number;
    pool: number;
    available: number;
    reserved: number;
    paid: number;
    remaining: number;
  };
  creators: {
    total: number;
    active: number;
    applied: number;
  };
  clips: {
    total: number;
    pendingReview: number;
    tracking: number;
    flagged: number;
    totalViews: number;
  };
  earnings: MoneyByStatus;
}

export interface CreatorSummary {
  userId: string;
  name: string;
  avatarUrl: string | null;
  niches: string[];
  followerCount: number;
  engagementRate: number;
}

export interface BusinessClipSummary {
  id: string;
  campaignId: string;
  campaignTitle: string;
  creator: CreatorSummary | null;
  platform: string;
  postUrl: string;
  status: ClipStatus;
  qualityStatus: string | null;
  currentViews: number;
  estimatedEarnings: number;
  fraudFlagged: boolean;
  submittedAt: string;
}

export interface BusinessDashboardData {
  profile: Profile;
  totals: {
    campaigns: number;
    activeCampaigns: number;
    draftCampaigns: number;
    creators: number;
    pendingReviewClips: number;
    trackingClips: number;
    flaggedClips: number;
    totalViews: number;
    budgetPool: number;
    availablePool: number;
    reservedPool: number;
    paidPool: number;
    earnings: MoneyByStatus;
  };
  campaigns: BusinessCampaignSummary[];
  recentClips: BusinessClipSummary[];
}

export interface CreatorCampaignSummary {
  id: string;
  participationId: string;
  title: string;
  description: string;
  status: CampaignStatus;
  participationStatus: ParticipationStatus;
  campaignType: CampaignType;
  campaignCategory: CampaignCategory | null;
  targetNiches: string[];
  platforms: string[];
  cpmRate: number | null;
  joinedAt: string | null;
  appliedAt: string | null;
  clips: {
    total: number;
    pendingReview: number;
    tracking: number;
    totalViews: number;
  };
  earnings: MoneyByStatus;
}

export interface CreatorDashboardData {
  profile: Profile;
  totals: {
    joinedCampaigns: number;
    activeCampaigns: number;
    clips: number;
    trackingClips: number;
    totalViews: number;
    earnings: MoneyByStatus;
    payoutRequests: number;
    paidPayouts: number;
  };
  campaigns: CreatorCampaignSummary[];
  clips: Array<{
    id: string;
    campaignId: string;
    campaignTitle: string;
    platform: string;
    postUrl: string;
    status: ClipStatus;
    currentViews: number;
    estimatedEarnings: number;
    submittedAt: string;
  }>;
  payouts: Array<{
    id: string;
    amount: number;
    status: PayoutStatus;
    createdAt: string;
    stripeTransferId: string | null;
  }>;
}

export interface CampaignInsightsData {
  campaign: BusinessCampaignSummary;
  creatorLeaderboard: Array<{
    creator: CreatorSummary;
    participationId: string;
    status: ParticipationStatus;
    clips: number;
    trackingClips: number;
    views: number;
    earnings: MoneyByStatus;
  }>;
  recentClips: BusinessClipSummary[];
}

function money(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function int(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function emptyMoney(): MoneyByStatus {
  return { accrued: 0, approved: 0, paid: 0, reversed: 0 };
}

function addMoney(target: MoneyByStatus, row: EarningRow): void {
  target[row.status] += money(row.amount);
}

function normalizeMoney(value: MoneyByStatus): MoneyByStatus {
  return {
    accrued: money(value.accrued),
    approved: money(value.approved),
    paid: money(value.paid),
    reversed: money(value.reversed),
  };
}

function dateValue(value: string | null | undefined): number {
  return value ? Date.parse(value) || 0 : 0;
}

function creatorFromProfile(row: CreatorProfileRow | undefined, fallbackId: string): CreatorSummary {
  return {
    userId: row?.user_id ?? fallbackId,
    name: row?.full_name?.trim() || "Unknown creator",
    avatarUrl: row?.avatar_url ?? null,
    niches: row?.niches ?? [],
    followerCount: int(row?.follower_count),
    engagementRate: money(row?.engagement_rate),
  };
}

function groupBy<T, K extends string>(
  rows: T[],
  key: (row: T) => K
): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  rows.forEach((row) => {
    const k = key(row);
    const list = grouped.get(k) ?? [];
    list.push(row);
    grouped.set(k, list);
  });
  return grouped;
}

function buildBusinessCampaignSummary(
  campaign: CampaignRow,
  participations: ParticipationRow[],
  clips: ClipRow[],
  earnings: EarningRow[]
): BusinessCampaignSummary {
  const earningsByStatus = emptyMoney();
  earnings.forEach((row) => addMoney(earningsByStatus, row));

  const pool = money(campaign.budget_pool ?? campaign.budget_total);
  const available = money(campaign.available_pool);
  const reserved = money(campaign.budget_reserved);
  const paid = money(campaign.budget_paid);

  return {
    id: campaign.id,
    title: campaign.title,
    description: campaign.description ?? "",
    status: campaign.status,
    campaignType: campaign.campaign_type ?? "fixed",
    campaignCategory: campaign.campaign_category,
    targetNiches: campaign.target_niches ?? [],
    platforms: campaign.platforms ?? [],
    createdAt: campaign.created_at,
    fundedAt: campaign.funded_at,
    cpmRate:
      campaign.brand_cpm_rate != null || campaign.cpm_rate != null
        ? money(campaign.brand_cpm_rate ?? campaign.cpm_rate)
        : null,
    budget: {
      total: money(campaign.budget_total),
      pool,
      available,
      reserved,
      paid,
      remaining: money((available || pool) - reserved - paid),
    },
    creators: {
      total: new Set(participations.map((p) => p.influencer_id)).size,
      active: participations.filter((p) => p.status === "active" || p.status === "accepted").length,
      applied: participations.filter((p) => p.status === "applied").length,
    },
    clips: {
      total: clips.length,
      pendingReview: clips.filter((clip) => clip.status === "pending").length,
      tracking: clips.filter((clip) => clip.status === "tracking").length,
      flagged: clips.filter((clip) => clip.fraud_flagged === true).length,
      totalViews: clips.reduce((sum, clip) => sum + int(clip.current_views), 0),
    },
    earnings: normalizeMoney(earningsByStatus),
  };
}

function buildBusinessClipSummary(
  clip: ClipRow,
  campaignTitle: string,
  creator: CreatorSummary | null,
  earnings: EarningRow[]
): BusinessClipSummary {
  return {
    id: clip.id,
    campaignId: clip.campaign_id,
    campaignTitle,
    creator,
    platform: clip.platform,
    postUrl: clip.post_url,
    status: clip.status,
    qualityStatus: clip.quality_status,
    currentViews: int(clip.current_views),
    estimatedEarnings: money(
      earnings.reduce((sum, earning) => sum + money(earning.amount), 0)
    ),
    fraudFlagged: clip.fraud_flagged === true,
    submittedAt: clip.submitted_at ?? clip.created_at,
  };
}

async function requireProfile(): Promise<Profile> {
  const profile = await getServerUser();
  if (!profile) {
    throw new Error("Authentication required.");
  }
  return profile;
}

async function fetchCreatorProfiles(ids: string[]): Promise<Map<string, CreatorProfileRow>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, avatar_url, niches, follower_count, engagement_rate, social_handles")
    .in("user_id", ids);

  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as CreatorProfileRow[]).map((profile) => [profile.user_id, profile])
  );
}

export async function getBusinessDashboardData(): Promise<BusinessDashboardData> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: campaignData, error: campaignError } = await supabase
    .from("campaigns")
    .select(
      "id, business_id, title, description, status, campaign_type, campaign_category, budget_total, budget_pool, available_pool, budget_reserved, budget_paid, brand_cpm_rate, cpm_rate, target_niches, platforms, deliverables, timeline, funded_at, created_at, updated_at"
    )
    .eq("business_id", profile.user_id)
    .order("created_at", { ascending: false });
  if (campaignError) throw new Error(campaignError.message);

  const campaigns = (campaignData ?? []) as CampaignRow[];
  const campaignIds = campaigns.map((campaign) => campaign.id);

  const [participationResult, clipResult, earningResult] =
    campaignIds.length > 0
      ? await Promise.all([
          supabase
            .from("participations")
            .select(
              "id, campaign_id, influencer_id, status, proposed_payout, actual_payout, total_views, total_earned, total_paid, creator_cpm_rate, performance_data, joined_at, applied_at, updated_at"
            )
            .in("campaign_id", campaignIds),
          supabase
            .from("clips")
            .select(
              "id, campaign_id, creator_id, participation_id, platform, post_url, status, current_views, counted_views, view_provider, quality_status, quality_score, quality_notes, fraud_flagged, fraud_score, submitted_at, reviewed_at, created_at, updated_at"
            )
            .in("campaign_id", campaignIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("earnings")
            .select(
              "id, clip_id, participation_id, campaign_id, creator_id, billable_views, effective_cpm, amount, status, payout_id, accrued_at"
            )
            .in("campaign_id", campaignIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ];

  if (participationResult.error) throw new Error(participationResult.error.message);
  if (clipResult.error) throw new Error(clipResult.error.message);
  if (earningResult.error) throw new Error(earningResult.error.message);

  const participations = (participationResult.data ?? []) as ParticipationRow[];
  const clips = (clipResult.data ?? []) as ClipRow[];
  const earnings = (earningResult.data ?? []) as EarningRow[];
  const creatorProfiles = await fetchCreatorProfiles([
    ...new Set(clips.map((clip) => clip.creator_id)),
  ]);

  const participationsByCampaign = groupBy(participations, (row) => row.campaign_id);
  const clipsByCampaign = groupBy(clips, (row) => row.campaign_id);
  const earningsByCampaign = groupBy(earnings, (row) => row.campaign_id);
  const earningsByClip = groupBy(earnings, (row) => row.clip_id);

  const campaignSummaries = campaigns.map((campaign) =>
    buildBusinessCampaignSummary(
      campaign,
      participationsByCampaign.get(campaign.id) ?? [],
      clipsByCampaign.get(campaign.id) ?? [],
      earningsByCampaign.get(campaign.id) ?? []
    )
  );

  const titleByCampaign = new Map(campaigns.map((campaign) => [campaign.id, campaign.title]));
  const recentClips = [...clips]
    .sort((a, b) => dateValue(b.submitted_at ?? b.created_at) - dateValue(a.submitted_at ?? a.created_at))
    .slice(0, 12)
    .map((clip) =>
      buildBusinessClipSummary(
        clip,
        titleByCampaign.get(clip.campaign_id) ?? "Campaign",
        creatorFromProfile(creatorProfiles.get(clip.creator_id), clip.creator_id),
        earningsByClip.get(clip.id) ?? []
      )
    );

  const totalsEarnings = emptyMoney();
  earnings.forEach((row) => addMoney(totalsEarnings, row));

  return {
    profile,
    totals: {
      campaigns: campaigns.length,
      activeCampaigns: campaigns.filter((campaign) =>
        ["open", "in_progress"].includes(campaign.status)
      ).length,
      draftCampaigns: campaigns.filter((campaign) => campaign.status === "draft").length,
      creators: new Set(participations.map((part) => part.influencer_id)).size,
      pendingReviewClips: clips.filter((clip) => clip.status === "pending").length,
      trackingClips: clips.filter((clip) => clip.status === "tracking").length,
      flaggedClips: clips.filter((clip) => clip.fraud_flagged === true).length,
      totalViews: clips.reduce((sum, clip) => sum + int(clip.current_views), 0),
      budgetPool: campaigns.reduce((sum, campaign) => sum + money(campaign.budget_pool), 0),
      availablePool: campaigns.reduce((sum, campaign) => sum + money(campaign.available_pool), 0),
      reservedPool: campaigns.reduce((sum, campaign) => sum + money(campaign.budget_reserved), 0),
      paidPool: campaigns.reduce((sum, campaign) => sum + money(campaign.budget_paid), 0),
      earnings: normalizeMoney(totalsEarnings),
    },
    campaigns: campaignSummaries,
    recentClips,
  };
}

export async function getCreatorDashboardData(): Promise<CreatorDashboardData> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [
    participationResult,
    clipResult,
    earningResult,
    payoutResult,
  ] = await Promise.all([
    supabase
      .from("participations")
      .select(
        "id, campaign_id, influencer_id, status, proposed_payout, actual_payout, total_views, total_earned, total_paid, creator_cpm_rate, performance_data, joined_at, applied_at, updated_at"
      )
      .eq("influencer_id", profile.user_id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("clips")
      .select(
        "id, campaign_id, creator_id, participation_id, platform, post_url, status, current_views, counted_views, view_provider, quality_status, quality_score, quality_notes, fraud_flagged, fraud_score, submitted_at, reviewed_at, created_at, updated_at"
      )
      .eq("creator_id", profile.user_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("earnings")
      .select(
        "id, clip_id, participation_id, campaign_id, creator_id, billable_views, effective_cpm, amount, status, payout_id, accrued_at"
      )
      .eq("creator_id", profile.user_id),
    supabase
      .from("payouts")
      .select("id, creator_id, amount, status, stripe_transfer_id, created_at, updated_at")
      .eq("creator_id", profile.user_id)
      .order("created_at", { ascending: false }),
  ]);

  if (participationResult.error) throw new Error(participationResult.error.message);
  if (clipResult.error) throw new Error(clipResult.error.message);
  if (earningResult.error) throw new Error(earningResult.error.message);
  if (payoutResult.error) throw new Error(payoutResult.error.message);

  const participations = (participationResult.data ?? []) as ParticipationRow[];
  const campaignIds = [...new Set(participations.map((part) => part.campaign_id))];
  const { data: campaignData, error: campaignError } =
    campaignIds.length > 0
      ? await supabase
          .from("campaigns")
          .select(
            "id, business_id, title, description, status, campaign_type, campaign_category, budget_total, budget_pool, available_pool, budget_reserved, budget_paid, brand_cpm_rate, cpm_rate, target_niches, platforms, deliverables, timeline, funded_at, created_at, updated_at"
          )
          .in("id", campaignIds)
      : { data: [], error: null };
  if (campaignError) throw new Error(campaignError.message);

  const campaigns = (campaignData ?? []) as CampaignRow[];
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const clips = (clipResult.data ?? []) as ClipRow[];
  const earnings = (earningResult.data ?? []) as EarningRow[];
  const payouts = (payoutResult.data ?? []) as PayoutRow[];
  const clipsByCampaign = groupBy(clips, (row) => row.campaign_id);
  const earningsByCampaign = groupBy(earnings, (row) => row.campaign_id);
  const earningsByClip = groupBy(earnings, (row) => row.clip_id);

  const campaignSummaries = participations.map((participation) => {
    const campaign = campaignById.get(participation.campaign_id);
    const campaignClips = clipsByCampaign.get(participation.campaign_id) ?? [];
    const campaignEarnings = earningsByCampaign.get(participation.campaign_id) ?? [];
    const earningsByStatus = emptyMoney();
    campaignEarnings.forEach((row) => addMoney(earningsByStatus, row));

    return {
      id: participation.campaign_id,
      participationId: participation.id,
      title: campaign?.title ?? "Campaign",
      description: campaign?.description ?? "",
      status: campaign?.status ?? "draft",
      participationStatus: participation.status,
      campaignType: campaign?.campaign_type ?? "fixed",
      campaignCategory: campaign?.campaign_category ?? null,
      targetNiches: campaign?.target_niches ?? [],
      platforms: campaign?.platforms ?? [],
      cpmRate:
        campaign?.brand_cpm_rate != null || campaign?.cpm_rate != null
          ? money(campaign?.brand_cpm_rate ?? campaign?.cpm_rate)
          : null,
      joinedAt: participation.joined_at,
      appliedAt: participation.applied_at,
      clips: {
        total: campaignClips.length,
        pendingReview: campaignClips.filter((clip) => clip.status === "pending").length,
        tracking: campaignClips.filter((clip) => clip.status === "tracking").length,
        totalViews: campaignClips.reduce((sum, clip) => sum + int(clip.current_views), 0),
      },
      earnings: normalizeMoney(earningsByStatus),
    };
  });

  const totalsEarnings = emptyMoney();
  earnings.forEach((row) => addMoney(totalsEarnings, row));

  return {
    profile,
    totals: {
      joinedCampaigns: participations.filter((part) => part.status === "active").length,
      activeCampaigns: campaignSummaries.filter((campaign) =>
        ["open", "in_progress"].includes(campaign.status)
      ).length,
      clips: clips.length,
      trackingClips: clips.filter((clip) => clip.status === "tracking").length,
      totalViews: clips.reduce((sum, clip) => sum + int(clip.current_views), 0),
      earnings: normalizeMoney(totalsEarnings),
      payoutRequests: payouts.length,
      paidPayouts: payouts.filter((payout) => payout.status === "paid").length,
    },
    campaigns: campaignSummaries,
    clips: clips.map((clip) => ({
      id: clip.id,
      campaignId: clip.campaign_id,
      campaignTitle: campaignById.get(clip.campaign_id)?.title ?? "Campaign",
      platform: clip.platform,
      postUrl: clip.post_url,
      status: clip.status,
      currentViews: int(clip.current_views),
      estimatedEarnings: money(
        (earningsByClip.get(clip.id) ?? []).reduce(
          (sum, earning) => sum + money(earning.amount),
          0
        )
      ),
      submittedAt: clip.submitted_at ?? clip.created_at,
    })),
    payouts: payouts.map((payout) => ({
      id: payout.id,
      amount: money(payout.amount),
      status: payout.status,
      createdAt: payout.created_at,
      stripeTransferId: payout.stripe_transfer_id,
    })),
  };
}

export async function getCampaignInsights(
  campaignId: string
): Promise<CampaignInsightsData | null> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: campaignData, error: campaignError } = await supabase
    .from("campaigns")
    .select(
      "id, business_id, title, description, status, campaign_type, campaign_category, budget_total, budget_pool, available_pool, budget_reserved, budget_paid, brand_cpm_rate, cpm_rate, target_niches, platforms, deliverables, timeline, funded_at, created_at, updated_at"
    )
    .eq("id", campaignId)
    .eq("business_id", profile.user_id)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!campaignData) return null;

  const campaign = campaignData as CampaignRow;
  const [participationResult, clipResult, earningResult] = await Promise.all([
    supabase
      .from("participations")
      .select(
        "id, campaign_id, influencer_id, status, proposed_payout, actual_payout, total_views, total_earned, total_paid, creator_cpm_rate, performance_data, joined_at, applied_at, updated_at"
      )
      .eq("campaign_id", campaignId),
    supabase
      .from("clips")
      .select(
        "id, campaign_id, creator_id, participation_id, platform, post_url, status, current_views, counted_views, view_provider, quality_status, quality_score, quality_notes, fraud_flagged, fraud_score, submitted_at, reviewed_at, created_at, updated_at"
      )
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
    supabase
      .from("earnings")
      .select(
        "id, clip_id, participation_id, campaign_id, creator_id, billable_views, effective_cpm, amount, status, payout_id, accrued_at"
      )
      .eq("campaign_id", campaignId),
  ]);

  if (participationResult.error) throw new Error(participationResult.error.message);
  if (clipResult.error) throw new Error(clipResult.error.message);
  if (earningResult.error) throw new Error(earningResult.error.message);

  const participations = (participationResult.data ?? []) as ParticipationRow[];
  const clips = (clipResult.data ?? []) as ClipRow[];
  const earnings = (earningResult.data ?? []) as EarningRow[];
  const creatorProfiles = await fetchCreatorProfiles([
    ...new Set(participations.map((part) => part.influencer_id)),
  ]);

  const clipsByParticipation = groupBy(clips, (clip) => clip.participation_id);
  const earningsByParticipation = groupBy(earnings, (earning) => earning.participation_id);
  const earningsByClip = groupBy(earnings, (earning) => earning.clip_id);

  const campaignSummary = buildBusinessCampaignSummary(
    campaign,
    participations,
    clips,
    earnings
  );

  return {
    campaign: campaignSummary,
    creatorLeaderboard: participations
      .map((participation) => {
        const creatorClips = clipsByParticipation.get(participation.id) ?? [];
        const creatorEarnings = earningsByParticipation.get(participation.id) ?? [];
        const earningsByStatus = emptyMoney();
        creatorEarnings.forEach((row) => addMoney(earningsByStatus, row));
        return {
          creator: creatorFromProfile(
            creatorProfiles.get(participation.influencer_id),
            participation.influencer_id
          ),
          participationId: participation.id,
          status: participation.status,
          clips: creatorClips.length,
          trackingClips: creatorClips.filter((clip) => clip.status === "tracking").length,
          views: creatorClips.reduce((sum, clip) => sum + int(clip.current_views), 0),
          earnings: normalizeMoney(earningsByStatus),
        };
      })
      .sort((a, b) => b.views - a.views),
    recentClips: clips
      .slice(0, 12)
      .map((clip) =>
        buildBusinessClipSummary(
          clip,
          campaign.title,
          creatorFromProfile(creatorProfiles.get(clip.creator_id), clip.creator_id),
          earningsByClip.get(clip.id) ?? []
        )
      ),
  };
}
