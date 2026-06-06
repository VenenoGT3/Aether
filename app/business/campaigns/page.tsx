"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CircleDollarSign,
  ClipboardCheck,
  Eye,
  Filter,
  Grid2X2,
  List,
  Loader2,
  Megaphone,
  Plus,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  BusinessActionButton,
  BusinessEmptyState,
  BusinessGlassCard,
  BusinessMetricCard,
  BusinessProgressBar,
  BusinessSectionHeader,
  BusinessStatusPill,
  type BusinessTone,
} from "@/components/business/business-ui";
import {
  getCampaignsAction,
  subscribeToCampaignChanges,
  updateCampaignStatusAction,
} from "@/lib/supabase/campaigns";
import { supabase } from "@/lib/supabase/client";
import { campaignCategoryLabel } from "@/lib/campaign-category";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/translations";
import type { CampaignStatus, DbCampaign } from "@/types/database";

type CampaignRow = Omit<DbCampaign, "status"> & {
  status: CampaignStatus | "exhausted" | string;
  brand_cpm_rate?: number | null;
};

type HubFilter = "all" | "performance" | "open" | "review" | "draft" | "completed" | "legacy";
type ViewMode = "cards" | "rows";

interface ClipSummary {
  total: number;
  pending: number;
  approved: number;
  tracking: number;
  rejected: number;
  disqualified: number;
  verifiedViews: number;
  creators: number;
}

interface ParticipationSummary {
  total: number;
  applied: number;
  active: number;
  completed: number;
  creators: number;
  totalViews: number;
  totalEarned: number;
}

interface ClipRow {
  campaign_id: string;
  status: string;
  current_views: number | null;
  counted_views: number | null;
  creator_id: string | null;
}

interface ParticipationRow {
  campaign_id: string;
  status: string;
  influencer_id: string | null;
  total_views: number | null;
  total_earned: number | null;
}

const EMPTY_CLIP_SUMMARY: ClipSummary = {
  total: 0,
  pending: 0,
  approved: 0,
  tracking: 0,
  rejected: 0,
  disqualified: 0,
  verifiedViews: 0,
  creators: 0,
};

const EMPTY_PARTICIPATION_SUMMARY: ParticipationSummary = {
  total: 0,
  applied: 0,
  active: 0,
  completed: 0,
  creators: 0,
  totalViews: 0,
  totalEarned: 0,
};

const filterOrder: HubFilter[] = ["all", "performance", "open", "review", "draft", "completed", "legacy"];

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

function statusLabel(status: string): string {
  if (status === "in_progress") return "Tracking";
  if (status === "open") return "Marketplace open";
  if (status === "exhausted") return "Budget exhausted";
  return status.replace(/_/g, " ");
}

function statusTone(status: string): BusinessTone {
  if (status === "completed") return "success";
  if (status === "open" || status === "in_progress") return "accent";
  if (status === "draft") return "warning";
  if (status === "cancelled" || status === "exhausted") return "danger";
  return "neutral";
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function campaignPool(campaign: CampaignRow): number {
  return numberValue(campaign.available_pool ?? campaign.budget_pool ?? campaign.budget_total);
}

function campaignFunded(campaign: CampaignRow): number {
  return numberValue(campaign.budget_pool ?? campaign.budget_total);
}

function campaignUsed(campaign: CampaignRow): number {
  return numberValue(campaign.budget_reserved) + numberValue(campaign.budget_paid);
}

function campaignRemaining(campaign: CampaignRow): number {
  return Math.max(campaignPool(campaign) - campaignUsed(campaign), 0);
}

function rewardRate(campaign: CampaignRow): number {
  return numberValue(campaign.brand_cpm_rate ?? campaign.cpm_rate);
}

function isPerformanceCampaign(campaign: CampaignRow): boolean {
  return campaign.campaign_type === "performance";
}

function detailHref(campaign: CampaignRow): string {
  return campaign.status === "draft" ? "/business/campaigns/new" : `/campaigns/${campaign.id}`;
}

function createClipSummary(): ClipSummary {
  return { ...EMPTY_CLIP_SUMMARY };
}

function createParticipationSummary(): ParticipationSummary {
  return { ...EMPTY_PARTICIPATION_SUMMARY };
}

async function loadCampaignHubSummaries(campaignIds: string[]) {
  const clipSummaries = new Map<string, ClipSummary>();
  const participationSummaries = new Map<string, ParticipationSummary>();

  if (campaignIds.length === 0) {
    return { clipSummaries, participationSummaries };
  }

  const [{ data: clips, error: clipsError }, { data: participations, error: participationsError }] =
    await Promise.all([
      supabase
        .from("clips")
        .select("campaign_id, status, current_views, counted_views, creator_id")
        .in("campaign_id", campaignIds),
      supabase
        .from("participations")
        .select("campaign_id, status, influencer_id, total_views, total_earned")
        .in("campaign_id", campaignIds),
    ]);

  if (clipsError) throw clipsError;
  if (participationsError) throw participationsError;

  for (const clip of (clips ?? []) as ClipRow[]) {
    const summary = clipSummaries.get(clip.campaign_id) ?? createClipSummary();
    summary.total++;
    if (clip.status === "pending") summary.pending++;
    if (clip.status === "approved") summary.approved++;
    if (clip.status === "tracking") summary.tracking++;
    if (clip.status === "rejected") summary.rejected++;
    if (clip.status === "disqualified") summary.disqualified++;
    if (clip.status === "approved" || clip.status === "tracking") {
      summary.verifiedViews += numberValue(clip.current_views ?? clip.counted_views);
    }
    clipSummaries.set(clip.campaign_id, summary);
  }

  const clipCreatorsByCampaign = new Map<string, Set<string>>();
  for (const clip of (clips ?? []) as ClipRow[]) {
    if (!clip.creator_id) continue;
    const creators = clipCreatorsByCampaign.get(clip.campaign_id) ?? new Set<string>();
    creators.add(clip.creator_id);
    clipCreatorsByCampaign.set(clip.campaign_id, creators);
  }
  for (const [campaignId, creators] of clipCreatorsByCampaign) {
    const summary = clipSummaries.get(campaignId) ?? createClipSummary();
    summary.creators = creators.size;
    clipSummaries.set(campaignId, summary);
  }

  const participationCreatorsByCampaign = new Map<string, Set<string>>();
  for (const participation of (participations ?? []) as ParticipationRow[]) {
    const summary = participationSummaries.get(participation.campaign_id) ?? createParticipationSummary();
    summary.total++;
    if (participation.status === "applied") summary.applied++;
    if (participation.status === "active" || participation.status === "accepted") summary.active++;
    if (participation.status === "completed") summary.completed++;
    summary.totalViews += numberValue(participation.total_views);
    summary.totalEarned += numberValue(participation.total_earned);
    participationSummaries.set(participation.campaign_id, summary);

    if (participation.influencer_id) {
      const creators = participationCreatorsByCampaign.get(participation.campaign_id) ?? new Set<string>();
      creators.add(participation.influencer_id);
      participationCreatorsByCampaign.set(participation.campaign_id, creators);
    }
  }

  for (const [campaignId, creators] of participationCreatorsByCampaign) {
    const summary = participationSummaries.get(campaignId) ?? createParticipationSummary();
    summary.creators = creators.size;
    participationSummaries.set(campaignId, summary);
  }

  return { clipSummaries, participationSummaries };
}

function filterLabel(filter: HubFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "performance":
      return "Performance";
    case "open":
      return "Live";
    case "review":
      return "Needs review";
    case "draft":
      return "Drafts";
    case "completed":
      return "Completed";
    case "legacy":
      return "Fixed fee";
  }
}

function CampaignCard({
  campaign,
  clipSummary,
  participationSummary,
  actionLoadingId,
  onStatusUpdate,
}: {
  campaign: CampaignRow;
  clipSummary: ClipSummary;
  participationSummary: ParticipationSummary;
  actionLoadingId: string | null;
  onStatusUpdate: (campaign: CampaignRow, status: CampaignStatus) => void;
}) {
  const isPerformance = isPerformanceCampaign(campaign);
  const category = campaignCategoryLabel(campaign.campaign_category);
  const rate = rewardRate(campaign);
  const pool = campaignPool(campaign);
  const used = campaignUsed(campaign);
  const remaining = campaignRemaining(campaign);
  const funded = campaignFunded(campaign);
  const isFunded = !!campaign.funded_at;
  const actionId = `${campaign.id}-${campaign.status}`;
  const loading = actionLoadingId === actionId;

  return (
    <BusinessGlassCard
      variant="elevated"
      className="group flex h-full flex-col gap-4 transition-colors hover:bg-white/[0.08]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <BusinessStatusPill tone={statusTone(campaign.status)}>
              {statusLabel(campaign.status)}
            </BusinessStatusPill>
            <BusinessStatusPill tone={isPerformance ? "accent" : "neutral"}>
              {isPerformance ? "Performance" : "Fixed fee"}
            </BusinessStatusPill>
            {category ? <BusinessStatusPill tone="info">{category}</BusinessStatusPill> : null}
          </div>
          <Link href={detailHref(campaign)}>
            <h2 className="line-clamp-2 text-lg font-semibold tracking-normal text-[var(--business-text)] transition-colors group-hover:text-[var(--business-primary)]">
              {campaign.title}
            </h2>
          </Link>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--business-muted)]">
            {campaign.description || "No brief description yet."}
          </p>
        </div>
        <Link
          href={detailHref(campaign)}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[var(--business-muted)] transition-colors hover:text-[var(--business-primary)]"
          aria-label={`Open ${campaign.title}`}
        >
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {(campaign.target_niches ?? []).slice(0, 4).map((niche) => (
          <span
            key={niche}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--business-muted)]"
          >
            {niche}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)]">
            Budget pool
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--business-text)]">{money(pool)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)]">
            Reward rate
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--business-text)]">
            {isPerformance && rate > 0 ? `${money(rate, 2)} RPM` : "Fixed"}
          </p>
        </div>
      </div>

      {isPerformance ? (
        <div className="space-y-2">
          <BusinessProgressBar
            value={used}
            max={pool || 100}
            label={`${money(remaining)} remaining`}
            tone={campaign.status === "exhausted" ? "danger" : used / Math.max(pool, 1) >= 0.9 ? "warning" : "accent"}
          />
          {funded > pool ? (
            <p className="text-[10px] text-[var(--business-muted)]">
              {money(funded)} funded · creators earn from {money(pool)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="font-semibold text-[var(--business-text)]">{compactNumber(clipSummary.verifiedViews || participationSummary.totalViews)}</p>
          <p className="mt-0.5 text-[10px] text-[var(--business-muted)]">verified views</p>
        </div>
        <div>
          <p className="font-semibold text-[var(--business-text)]">{clipSummary.pending}</p>
          <p className="mt-0.5 text-[10px] text-[var(--business-muted)]">pending clips</p>
        </div>
        <div>
          <p className="font-semibold text-[var(--business-text)]">{clipSummary.creators || participationSummary.creators}</p>
          <p className="mt-0.5 text-[10px] text-[var(--business-muted)]">creators</p>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] text-[var(--business-muted)]">
          Updated {formatDate(campaign.updated_at || campaign.created_at)}
        </p>
        {campaign.status === "draft" ? (
          isPerformance && !isFunded ? (
            <BusinessActionButton href="/business/campaigns/new" size="sm" variant="secondary">
              Finish funding
            </BusinessActionButton>
          ) : (
            <BusinessActionButton
              size="sm"
              variant="secondary"
              onClick={() => onStatusUpdate(campaign, "open")}
              disabled={loading}
              icon={loading ? Loader2 : Sparkles}
              className={loading ? "[&_svg]:animate-spin" : undefined}
            >
              Open marketplace
            </BusinessActionButton>
          )
        ) : clipSummary.pending > 0 ? (
          <BusinessActionButton href="/business/moderation" size="sm" variant="secondary" icon={ClipboardCheck}>
            Review submissions
          </BusinessActionButton>
        ) : campaign.status === "open" ? (
          <BusinessActionButton
            size="sm"
            variant="secondary"
            onClick={() => onStatusUpdate(campaign, "in_progress")}
            disabled={loading}
            icon={loading ? Loader2 : Zap}
            className={loading ? "[&_svg]:animate-spin" : undefined}
          >
            Start tracking
          </BusinessActionButton>
        ) : (
          <BusinessActionButton href={detailHref(campaign)} size="sm" variant="ghost" trailingIcon={ArrowRight}>
            View insights
          </BusinessActionButton>
        )}
      </div>
    </BusinessGlassCard>
  );
}

function CampaignRowItem({
  campaign,
  clipSummary,
  participationSummary,
  actionLoadingId,
  onStatusUpdate,
}: {
  campaign: CampaignRow;
  clipSummary: ClipSummary;
  participationSummary: ParticipationSummary;
  actionLoadingId: string | null;
  onStatusUpdate: (campaign: CampaignRow, status: CampaignStatus) => void;
}) {
  const isPerformance = isPerformanceCampaign(campaign);
  const pool = campaignPool(campaign);
  const used = campaignUsed(campaign);
  const rate = rewardRate(campaign);
  const actionId = `${campaign.id}-${campaign.status}`;
  const loading = actionLoadingId === actionId;

  return (
    <BusinessGlassCard variant="elevated" className="p-4 transition-colors hover:bg-white/[0.08]">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_170px_150px_180px] lg:items-center">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <BusinessStatusPill tone={statusTone(campaign.status)}>
              {statusLabel(campaign.status)}
            </BusinessStatusPill>
            <BusinessStatusPill tone={isPerformance ? "accent" : "neutral"}>
              {isPerformance ? "Performance" : "Fixed fee"}
            </BusinessStatusPill>
          </div>
          <Link href={detailHref(campaign)}>
            <h2 className="truncate text-base font-semibold text-[var(--business-text)] hover:text-[var(--business-primary)]">
              {campaign.title}
            </h2>
          </Link>
          <p className="mt-1 line-clamp-1 text-sm text-[var(--business-muted)]">
            {campaign.description || "No brief description yet."}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)]">
            Budget pool
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--business-text)]">{money(pool)}</p>
          {isPerformance ? <BusinessProgressBar value={used} max={pool || 100} className="mt-2" /> : null}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)]">
            Performance
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--business-text)]">
            {compactNumber(clipSummary.verifiedViews || participationSummary.totalViews)}
          </p>
          <p className="text-[10px] text-[var(--business-muted)]">
            {isPerformance && rate > 0 ? `${money(rate, 2)} RPM` : `${clipSummary.total} clips`}
          </p>
        </div>

        <div className="flex gap-2 lg:justify-end">
          {clipSummary.pending > 0 ? (
            <BusinessActionButton href="/business/moderation" size="sm" variant="secondary" icon={ClipboardCheck}>
              Review
            </BusinessActionButton>
          ) : campaign.status === "open" ? (
            <BusinessActionButton
              size="sm"
              variant="secondary"
              onClick={() => onStatusUpdate(campaign, "in_progress")}
              disabled={loading}
              icon={loading ? Loader2 : Zap}
              className={loading ? "[&_svg]:animate-spin" : undefined}
            >
              Track
            </BusinessActionButton>
          ) : null}
          <BusinessActionButton href={detailHref(campaign)} size="sm" variant="ghost" trailingIcon={ArrowRight}>
            Open
          </BusinessActionButton>
        </div>
      </div>
    </BusinessGlassCard>
  );
}

export default function CampaignsPage() {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [clipSummaries, setClipSummaries] = useState<Map<string, ClipSummary>>(new Map());
  const [participationSummaries, setParticipationSummaries] = useState<Map<string, ParticipationSummary>>(new Map());
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [activeFilter, setActiveFilter] = useState<HubFilter>("all");
  const [selectedNiche, setSelectedNiche] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const result = await getCampaignsAction();
      if (!result.success || !result.campaigns) {
        setCampaigns([]);
        setClipSummaries(new Map());
        setParticipationSummaries(new Map());
        return;
      }

      const campaignRows = result.campaigns as CampaignRow[];
      const summaries = await loadCampaignHubSummaries(campaignRows.map((campaign) => campaign.id));
      setCampaigns(campaignRows);
      setClipSummaries(summaries.clipSummaries);
      setParticipationSummaries(summaries.participationSummaries);
    } catch (error) {
      console.error("Failed to load campaigns:", error);
      toast.error(t("Failed to load campaigns"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client mount guard + initial fetch.
    setMounted(true);
    loadCampaigns();

    const unsubscribeCampaigns = subscribeToCampaignChanges(() => {
      loadCampaigns();
    });
    const clipsChannel = supabase
      .channel("business-campaign-hub-clips")
      .on("postgres_changes", { event: "*", schema: "public", table: "clips" }, () => {
        loadCampaigns();
      })
      .subscribe();
    const participationsChannel = supabase
      .channel("business-campaign-hub-participations")
      .on("postgres_changes", { event: "*", schema: "public", table: "participations" }, () => {
        loadCampaigns();
      })
      .subscribe();

    return () => {
      unsubscribeCampaigns();
      supabase.removeChannel(clipsChannel);
      supabase.removeChannel(participationsChannel);
    };
  }, [loadCampaigns]);

  const getClipSummary = useCallback(
    (campaignId: string) => clipSummaries.get(campaignId) ?? EMPTY_CLIP_SUMMARY,
    [clipSummaries]
  );
  const getParticipationSummary = useCallback(
    (campaignId: string) => participationSummaries.get(campaignId) ?? EMPTY_PARTICIPATION_SUMMARY,
    [participationSummaries]
  );

  const filteredCampaigns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      const clipSummary = getClipSummary(campaign.id);
      const matchesSearch =
        query.length === 0 ||
        campaign.title.toLowerCase().includes(query) ||
        (campaign.description ?? "").toLowerCase().includes(query) ||
        (campaign.target_niches ?? []).some((niche) => niche.toLowerCase().includes(query));
      const matchesNiche =
        selectedNiche === "all" || (campaign.target_niches ?? []).includes(selectedNiche);
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "performance" && isPerformanceCampaign(campaign)) ||
        (activeFilter === "open" && (campaign.status === "open" || campaign.status === "in_progress")) ||
        (activeFilter === "review" && clipSummary.pending > 0) ||
        (activeFilter === "draft" && campaign.status === "draft") ||
        (activeFilter === "completed" && (campaign.status === "completed" || campaign.status === "exhausted")) ||
        (activeFilter === "legacy" && !isPerformanceCampaign(campaign));

      return matchesSearch && matchesNiche && matchesFilter;
    });
  }, [activeFilter, campaigns, getClipSummary, searchQuery, selectedNiche]);

  const hubStats = useMemo(() => {
    const performanceCampaigns = campaigns.filter(isPerformanceCampaign);
    const activeCampaigns = campaigns.filter((campaign) => campaign.status === "open" || campaign.status === "in_progress");
    const allClipSummaries = campaigns.map((campaign) => getClipSummary(campaign.id));
    const allParticipationSummaries = campaigns.map((campaign) => getParticipationSummary(campaign.id));
    const pendingReviews = allClipSummaries.reduce((sum, summary) => sum + summary.pending, 0);
    const verifiedViews = allClipSummaries.reduce((sum, summary) => sum + summary.verifiedViews, 0);
    const campaignsWithCreators = new Set<string>();

    for (const campaign of campaigns) {
      const clipSummary = getClipSummary(campaign.id);
      const participationSummary = getParticipationSummary(campaign.id);
      if (clipSummary.creators > 0 || participationSummary.creators > 0) {
        campaignsWithCreators.add(campaign.id);
      }
    }

    const remainingPool = performanceCampaigns.reduce((sum, campaign) => sum + campaignRemaining(campaign), 0);
    const totalEarned = allParticipationSummaries.reduce((sum, summary) => sum + summary.totalEarned, 0);

    return {
      activeCampaigns: activeCampaigns.length,
      campaignsWithCreators: campaignsWithCreators.size,
      pendingReviews,
      performanceCampaigns: performanceCampaigns.length,
      remainingPool,
      totalEarned,
      verifiedViews,
    };
  }, [campaigns, getClipSummary, getParticipationSummary]);

  const filterCounts = useMemo(() => {
    const counts: Record<HubFilter, number> = {
      all: campaigns.length,
      performance: campaigns.filter(isPerformanceCampaign).length,
      open: campaigns.filter((campaign) => campaign.status === "open" || campaign.status === "in_progress").length,
      review: campaigns.filter((campaign) => getClipSummary(campaign.id).pending > 0).length,
      draft: campaigns.filter((campaign) => campaign.status === "draft").length,
      completed: campaigns.filter((campaign) => campaign.status === "completed" || campaign.status === "exhausted").length,
      legacy: campaigns.filter((campaign) => !isPerformanceCampaign(campaign)).length,
    };
    return counts;
  }, [campaigns, getClipSummary]);

  const niches = useMemo(() => {
    return Array.from(new Set(campaigns.flatMap((campaign) => campaign.target_niches ?? []))).sort();
  }, [campaigns]);

  const handleUpdateStatus = async (campaign: CampaignRow, newStatus: CampaignStatus) => {
    const actionId = `${campaign.id}-${campaign.status}`;
    setActionLoadingId(actionId);
    try {
      const result = await updateCampaignStatusAction(campaign.id, newStatus);
      if (result.success) {
        toast.success(t("Campaign status updated"), {
          description: `${campaign.title} · ${t(statusLabel(newStatus))}`,
        });
        await loadCampaigns();
      } else {
        toast.error(t("Failed to update campaign"), {
          description: result.error || t("Please try again."),
        });
      }
    } catch (error) {
      toast.error(t("An unexpected error occurred"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  if (!mounted) return null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <BusinessSectionHeader
        eyebrow={t("Campaign Hub")}
        title={t("Campaign workspaces")}
        description={t("Search, monitor, and manage performance campaigns by lifecycle, budget pool, verified views, and moderation status.")}
        action={
          <BusinessActionButton href="/business/campaigns/new" icon={Plus}>
            {t("New Campaign")}
          </BusinessActionButton>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BusinessMetricCard
          label={t("Live campaigns")}
          value={hubStats.activeCampaigns.toLocaleString()}
          detail={`${hubStats.performanceCampaigns} ${t("performance")}`}
          icon={Megaphone}
          tone="accent"
        />
        <BusinessMetricCard
          label={t("Needs review")}
          value={hubStats.pendingReviews.toLocaleString()}
          detail={t("pending submissions")}
          icon={ClipboardCheck}
          tone={hubStats.pendingReviews > 0 ? "warning" : "success"}
        />
        <BusinessMetricCard
          label={t("Verified views")}
          value={compactNumber(hubStats.verifiedViews)}
          detail={`${hubStats.campaignsWithCreators} ${t("campaigns with creators")}`}
          icon={Eye}
          tone="info"
        />
        <BusinessMetricCard
          label={t("Remaining pool")}
          value={money(hubStats.remainingPool)}
          detail={hubStats.totalEarned > 0 ? `${money(hubStats.totalEarned)} ${t("earned")}` : t("available budget")}
          icon={CircleDollarSign}
          tone="success"
        />
      </div>

      <BusinessGlassCard variant="elevated" className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--business-muted)]" />
            <input
              type="search"
              placeholder={t("Search campaigns, briefs, or niches")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="business-input h-11 w-full rounded-xl pl-10 pr-4 text-sm placeholder:text-[var(--business-muted)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)] sm:flex">
              <Filter size={13} /> {t("View")}
            </div>
            <div className="flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                aria-label={t("Card view")}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
                  viewMode === "cards"
                    ? "bg-white/[0.10] text-[var(--business-text)]"
                    : "text-[var(--business-muted)] hover:text-[var(--business-text)]"
                )}
              >
                <Grid2X2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("rows")}
                aria-label={t("Row view")}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
                  viewMode === "rows"
                    ? "bg-white/[0.10] text-[var(--business-text)]"
                    : "text-[var(--business-muted)] hover:text-[var(--business-text)]"
                )}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="business-scrollbar-none flex gap-2 overflow-x-auto pb-1">
          {filterOrder.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                activeFilter === filter
                  ? "border-[rgba(173,198,255,0.24)] bg-[rgba(173,198,255,0.12)] text-[var(--business-primary)]"
                  : "border-white/10 bg-white/[0.04] text-[var(--business-muted)] hover:text-[var(--business-text)]"
              )}
            >
              {t(filterLabel(filter))}
              <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px]">
                {filterCounts[filter]}
              </span>
            </button>
          ))}
        </div>

        {niches.length > 0 ? (
          <div className="business-scrollbar-none flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedNiche("all")}
              className={cn(
                "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                selectedNiche === "all"
                  ? "border-[rgba(173,198,255,0.24)] bg-[rgba(173,198,255,0.12)] text-[var(--business-primary)]"
                  : "border-white/10 bg-white/[0.04] text-[var(--business-muted)]"
              )}
            >
              {t("All niches")}
            </button>
            {niches.map((niche) => (
              <button
                key={niche}
                type="button"
                onClick={() => setSelectedNiche(niche)}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                  selectedNiche === niche
                    ? "border-[rgba(173,198,255,0.24)] bg-[rgba(173,198,255,0.12)] text-[var(--business-primary)]"
                    : "border-white/10 bg-white/[0.04] text-[var(--business-muted)] hover:text-[var(--business-text)]"
                )}
              >
                {niche}
              </button>
            ))}
          </div>
        ) : null}
      </BusinessGlassCard>

      {loading ? (
        <div className={viewMode === "cards" ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <BusinessGlassCard key={item} className="min-h-56">
              <div className="apple-skeleton h-4 w-40 rounded-full" />
              <div className="apple-skeleton mt-5 h-8 w-3/4 rounded-full" />
              <div className="apple-skeleton mt-4 h-3 w-full rounded-full" />
              <div className="apple-skeleton mt-2 h-3 w-2/3 rounded-full" />
              <div className="apple-skeleton mt-8 h-2 w-full rounded-full" />
            </BusinessGlassCard>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <BusinessEmptyState
          icon={Megaphone}
          title={t("Create your first campaign workspace")}
          description={t("Launch a UGC or clipping campaign, fund the budget pool, and start collecting verified creator submissions.")}
          actionHref="/business/campaigns/new"
          actionLabel={t("Create Campaign")}
        />
      ) : filteredCampaigns.length === 0 ? (
        <BusinessEmptyState
          icon={Search}
          title={t("No campaigns match")}
          description={t("Try another status, niche, or search term.")}
          actionHref="/business/campaigns/new"
          actionLabel={t("New Campaign")}
        />
      ) : viewMode === "cards" ? (
        <motion.div
          layout
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {filteredCampaigns.map((campaign, index) => (
            <motion.div
              key={campaign.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.03, 0.18) }}
            >
              <CampaignCard
                campaign={campaign}
                clipSummary={getClipSummary(campaign.id)}
                participationSummary={getParticipationSummary(campaign.id)}
                actionLoadingId={actionLoadingId}
                onStatusUpdate={handleUpdateStatus}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <motion.div layout className="space-y-3">
          {filteredCampaigns.map((campaign, index) => (
            <motion.div
              key={campaign.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.02, 0.14) }}
            >
              <CampaignRowItem
                campaign={campaign}
                clipSummary={getClipSummary(campaign.id)}
                participationSummary={getParticipationSummary(campaign.id)}
                actionLoadingId={actionLoadingId}
                onStatusUpdate={handleUpdateStatus}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {hubStats.pendingReviews > 0 ? (
        <Link
          href="/business/moderation"
          className="business-glass-elevated flex flex-col gap-3 rounded-2xl p-4 transition-colors hover:bg-white/[0.08] sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.10)] text-[var(--business-warning)]">
              <ClipboardCheck size={18} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[var(--business-text)]">
                {hubStats.pendingReviews} {t("submission(s) are waiting for moderation")}
              </span>
              <span className="mt-1 block text-sm text-[var(--business-muted)]">
                {t("Approve eligible clips to keep budget pool accounting and verified-view tracking moving.")}
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--business-warning)]">
            {t("Open moderation")} <ArrowRight size={16} />
          </span>
        </Link>
      ) : null}
    </div>
  );
}
