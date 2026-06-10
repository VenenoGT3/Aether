"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  DollarSign,
  Eye,
  Layers,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Wallet,
  Zap,
  type LucideIcon,
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
} from "@/components/business/business-ui";
import { getCampaignsAction, subscribeToCampaignChanges } from "@/lib/supabase/campaigns";
import { getClientProfile, supabase, type Profile } from "@/lib/supabase/client";
import { getCampaignMetricsAction, type CampaignMetrics, useTransactions } from "@/lib/supabase/metrics";
import type { BusinessDashboardInitialData } from "@/lib/supabase/dashboard-initial";
import { startStripeOnboardingAction } from "@/lib/stripe/actions";
import { campaignCategoryLabel } from "@/lib/campaign-category";
import { useTranslation } from "@/lib/translations";
import type { DbCampaign } from "@/types/database";
import { formatMoney } from "@/lib/currency";

type DashboardCampaign = Omit<DbCampaign, "status"> & {
  status: string;
};

interface BrandClipLite {
  id: string;
  campaign_id: string;
  status: string;
  current_views: number | null;
  counted_views: number | null;
  creator_id: string | null;
  platform: string | null;
  created_at: string;
  updated_at: string;
}

interface DashboardActivity {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  date: number;
  tone: "accent" | "success" | "warning" | "info" | "neutral";
  icon: LucideIcon;
  href?: string;
}

const activityToneClass: Record<DashboardActivity["tone"], string> = {
  accent: "border-[rgba(173,198,255,0.20)] bg-[rgba(173,198,255,0.10)] text-[var(--business-primary)]",
  success: "border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-[var(--business-success)]",
  warning: "border-[rgba(251,191,36,0.20)] bg-[rgba(251,191,36,0.10)] text-[var(--business-warning)]",
  info: "border-[rgba(77,142,255,0.20)] bg-[rgba(77,142,255,0.10)] text-[var(--business-accent)]",
  neutral: "border-white/10 bg-white/[0.05] text-[var(--business-muted)]",
};

const ACTIVE_CAMPAIGN_STATUSES = new Set(["open", "in_progress"]);
const VERIFIED_CLIP_STATUSES = new Set(["approved", "tracking"]);

const emptyMetrics: CampaignMetrics = {
  clicks: 0,
  impressions: 0,
  conversions: 0,
  attributed_value: 0,
  budget_spent: 0,
};

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number, digits = 0): string {
  return formatMoney(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10000 ? 1 : 0,
  }).format(value);
}

function formatDateLabel(value: string | Date | null | undefined): string {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function campaignTone(status: string): "neutral" | "accent" | "success" | "warning" | "danger" {
  if (status === "completed") return "success";
  if (status === "exhausted" || status === "cancelled") return "danger";
  if (status === "draft") return "warning";
  if (ACTIVE_CAMPAIGN_STATUSES.has(status)) return "accent";
  return "neutral";
}

function platformLabel(value: string | null): string {
  if (!value) return "Social";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

async function loadDashboardClips(campaignIds: string[]): Promise<BrandClipLite[]> {
  if (campaignIds.length === 0) return [];

  const { data, error } = await supabase
    .from("clips")
    .select("id, campaign_id, status, current_views, counted_views, creator_id, platform, created_at, updated_at")
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return ((data ?? []) as BrandClipLite[]);
}

export function BusinessDashboardClient({
  initialData,
}: {
  initialData: BusinessDashboardInitialData | null;
}) {
  const { t } = useTranslation();
  const { transactions, balances, loading: transactionsLoading, refresh: refreshTransactions } = useTransactions();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(!initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(initialData?.profile ?? null);
  const [campaigns, setCampaigns] = useState<DashboardCampaign[]>(
    (initialData?.campaigns as DashboardCampaign[] | undefined) ?? []
  );
  const [clips, setClips] = useState<BrandClipLite[]>(initialData?.clips ?? []);
  const [campaignMetrics, setCampaignMetrics] = useState<Record<string, CampaignMetrics>>(
    initialData?.campaignMetrics ?? {}
  );
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setDashboardError(null);
      const [profileRow, campaignsResult] = await Promise.all([
        getClientProfile(),
        getCampaignsAction(),
      ]);

      setProfile(profileRow);

      if (!campaignsResult.success || !campaignsResult.campaigns) {
        setCampaigns([]);
        setClips([]);
        setCampaignMetrics({});
        if (campaignsResult.error) setDashboardError(campaignsResult.error);
        return;
      }

      const campaignRows = campaignsResult.campaigns as DashboardCampaign[];
      const campaignIds = campaignRows.map((campaign) => campaign.id);
      const [clipRows, metricPairs] = await Promise.all([
        loadDashboardClips(campaignIds),
        Promise.all(
          campaignRows.map(async (campaign) => {
            const metricsResult = await getCampaignMetricsAction(campaign.id);
            return [
              campaign.id,
              metricsResult.success ? metricsResult.metrics : emptyMetrics,
            ] as const;
          })
        ),
      ]);

      setCampaigns(campaignRows);
      setClips(clipRows);
      setCampaignMetrics(Object.fromEntries(metricPairs));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dashboard data failed to load.";
      console.error("Failed to load business dashboard data:", error);
      setDashboardError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client mount guard + initial fetch.
    setMounted(true);
    // The RSC shell already fetched first-paint data; only fetch here when it
    // couldn't (the realtime subscriptions below keep everything fresh).
    if (!initialData) {
      setLoading(true);
      loadData();
    }

    // The realtime channels below are table-wide (Supabase postgres_changes
    // cannot filter "clips belonging to my campaigns" server-side), so every
    // change anywhere on the platform reaches every open dashboard. Without
    // coalescing, each event triggers a full multi-query reload — at fleet
    // scale that is a self-inflicted stampede. Collapse all triggers into at
    // most one reload per window.
    let reloadTimer: number | null = null;
    const scheduleReload = () => {
      if (reloadTimer !== null) return;
      reloadTimer = window.setTimeout(() => {
        reloadTimer = null;
        loadData();
      }, 10_000);
    };

    const unsubscribeCampaigns = subscribeToCampaignChanges(scheduleReload);

    const clipsChannel = supabase
      .channel("business-dashboard-clips")
      .on("postgres_changes", { event: "*", schema: "public", table: "clips" }, scheduleReload)
      .subscribe();

    const participationsChannel = supabase
      .channel("business-dashboard-participations")
      .on("postgres_changes", { event: "*", schema: "public", table: "participations" }, scheduleReload)
      .subscribe();

    // App-local events are the user's own actions — refresh immediately.
    const handleExternalRefresh = () => {
      loadData();
      refreshTransactions();
    };

    window.addEventListener("aether-metrics-update", handleExternalRefresh);
    window.addEventListener("aether-transactions-update", handleExternalRefresh);
    window.addEventListener("aether-clips-update", handleExternalRefresh);
    window.addEventListener("role-change", handleExternalRefresh);

    return () => {
      if (reloadTimer !== null) window.clearTimeout(reloadTimer);
      unsubscribeCampaigns();
      supabase.removeChannel(clipsChannel);
      supabase.removeChannel(participationsChannel);
      window.removeEventListener("aether-metrics-update", handleExternalRefresh);
      window.removeEventListener("aether-transactions-update", handleExternalRefresh);
      window.removeEventListener("aether-clips-update", handleExternalRefresh);
      window.removeEventListener("role-change", handleExternalRefresh);
    };
  }, [loadData, refreshTransactions, initialData]);

  const handleRefreshMetrics = async () => {
    setIsRefreshing(true);
    toast.loading(t("Syncing live social metrics..."), { id: "refresh-metrics" });

    try {
      const campaignIds = campaigns.map((campaign) => campaign.id);
      if (campaignIds.length === 0) {
        toast.success(t("No campaigns to refresh."), { id: "refresh-metrics" });
        return;
      }

      const { data: participations } = await supabase
        .from("participations")
        .select("id")
        .in("campaign_id", campaignIds);
      const participationIds = ((participations ?? []) as Array<{ id: string }>).map((part) => part.id);

      if (participationIds.length === 0) {
        toast.success(t("No active creators to refresh."), { id: "refresh-metrics" });
        return;
      }

      const { data: posts } = await supabase
        .from("posts")
        .select("post_url, platform, participation_id")
        .in("participation_id", participationIds);
      const postRows = (posts ?? []) as Array<{
        post_url: string;
        platform: string;
        participation_id: string;
      }>;

      if (postRows.length === 0) {
        toast.success(t("No live content URLs submitted yet."), { id: "refresh-metrics" });
        return;
      }

      let successCount = 0;
      for (const post of postRows) {
        try {
          await supabase.functions.invoke("metrics-fetch", {
            body: {
              post_url: post.post_url,
              platform: post.platform,
              participation_id: post.participation_id,
            },
          });
          successCount++;
        } catch (error) {
          console.error("Failed to refresh post:", post.post_url, error);
        }
      }

      toast.success(
        `${t("Refreshed metrics for")} ${successCount}/${postRows.length} ${t("live posts successfully!")}`,
        { id: "refresh-metrics" }
      );
    } catch (error) {
      toast.error(
        t("Failed to refresh metrics: ") + (error instanceof Error ? error.message : ""),
        { id: "refresh-metrics" }
      );
    } finally {
      await loadData();
      refreshTransactions();
      setIsRefreshing(false);
    }
  };

  const handleOnboardStripe = async () => {
    setOnboardingLoading(true);
    toast.loading(t("Redirecting to Stripe Connect onboarding..."), {
      id: "stripe-onboard",
    });

    try {
      const result = await startStripeOnboardingAction("business", window.location.origin);
      if (result.success && result.url) {
        toast.success(t("Redirecting..."), { id: "stripe-onboard" });
        window.location.href = result.url;
      } else {
        toast.error(result.error || t("Failed to generate onboarding session."), {
          id: "stripe-onboard",
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("An error occurred connecting to Stripe."),
        { id: "stripe-onboard" }
      );
    } finally {
      setOnboardingLoading(false);
    }
  };

  const dashboard = useMemo(() => {
    const performanceCampaigns = campaigns.filter((campaign) => campaign.campaign_type === "performance");
    const activeCampaigns = campaigns.filter((campaign) => ACTIVE_CAMPAIGN_STATUSES.has(campaign.status));
    const draftCampaigns = campaigns.filter((campaign) => campaign.status === "draft");
    const fixedFeeCampaigns = campaigns.filter((campaign) => (campaign.campaign_type ?? "fixed") === "fixed");
    const verifiedClips = clips.filter((clip) => VERIFIED_CLIP_STATUSES.has(clip.status));
    const pendingClips = clips.filter((clip) => clip.status === "pending");
    const verifiedViews = verifiedClips.reduce(
      (sum, clip) => sum + numberValue(clip.current_views ?? clip.counted_views),
      0
    );
    const activeCreators = new Set(
      verifiedClips.map((clip) => clip.creator_id).filter(Boolean)
    ).size;
    const metrics = Object.values(campaignMetrics);
    const metricSpend = metrics.reduce((sum, metric) => sum + numberValue(metric.budget_spent), 0);
    const attributedValue = metrics.reduce((sum, metric) => sum + numberValue(metric.attributed_value), 0);
    const conversions = metrics.reduce((sum, metric) => sum + numberValue(metric.conversions), 0);
    const totalPool = performanceCampaigns.reduce(
      (sum, campaign) => sum + numberValue(campaign.available_pool ?? campaign.budget_pool ?? campaign.budget_total),
      0
    );
    const totalFunded = performanceCampaigns.reduce(
      (sum, campaign) => sum + numberValue(campaign.budget_pool ?? campaign.budget_total),
      0
    );
    const totalReserved = performanceCampaigns.reduce(
      (sum, campaign) => sum + numberValue(campaign.budget_reserved),
      0
    );
    const totalPaid = performanceCampaigns.reduce(
      (sum, campaign) => sum + numberValue(campaign.budget_paid),
      0
    );
    const totalRemaining = Math.max(totalPool - totalReserved - totalPaid, 0);
    const usedPct = totalPool > 0 ? Math.min(((totalReserved + totalPaid) / totalPool) * 100, 100) : 0;
    const totalSpend = Math.max(totalPaid, metricSpend);
    const roi = totalSpend > 0 ? attributedValue / totalSpend : 0;

    return {
      activeCampaigns,
      activeCreators,
      attributedValue,
      conversions,
      draftCampaigns,
      fixedFeeCampaigns,
      pendingClips,
      performanceCampaigns,
      roi,
      totalFunded,
      totalPaid,
      totalPool,
      totalRemaining,
      totalReserved,
      totalSpend,
      usedPct,
      verifiedClips,
      verifiedViews,
    };
  }, [campaignMetrics, campaigns, clips]);

  const trendData = useMemo(() => {
    const now = new Date();
    const monthStarts = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return date;
    });
    const rows = new Map(
      monthStarts.map((date) => [
        monthKey(date),
        {
          month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
          spend: 0,
          views: 0,
        },
      ])
    );

    for (const transaction of transactions) {
      if (transaction.status !== "succeeded") continue;
      const key = monthKey(new Date(transaction.created_at));
      const row = rows.get(key);
      if (row) row.spend += numberValue(transaction.amount);
    }

    for (const clip of dashboard.verifiedClips) {
      const key = monthKey(new Date(clip.created_at));
      const row = rows.get(key);
      if (row) row.views += numberValue(clip.current_views ?? clip.counted_views);
    }

    return Array.from(rows.values());
  }, [dashboard.verifiedClips, transactions]);

  const activityFeed = useMemo<DashboardActivity[]>(() => {
    const activities: DashboardActivity[] = [];

    for (const clip of clips.slice(0, 12)) {
      const isPending = clip.status === "pending";
      activities.push({
        id: `clip-${clip.id}`,
        title: isPending ? t("Submission awaiting review") : t("Verified clip updated"),
        subtitle: `${platformLabel(clip.platform)} · ${compactNumber(numberValue(clip.current_views ?? clip.counted_views))} ${t("verified views")}`,
        time: formatDateLabel(clip.updated_at || clip.created_at),
        date: new Date(clip.updated_at || clip.created_at).getTime(),
        tone: isPending ? "warning" : "success",
        icon: isPending ? ClipboardCheck : CheckCircle2,
        href: "/business/moderation",
      });
    }

    for (const transaction of transactions.slice(0, 8)) {
      activities.push({
        id: `tx-${transaction.id}`,
        title: transaction.type === "payout" ? t("Creator payout recorded") : t("Treasury movement recorded"),
        subtitle: `${transaction.campaignTitle || t("Campaign treasury")} · ${money(numberValue(transaction.amount), 2)}`,
        time: formatDateLabel(transaction.created_at),
        date: new Date(transaction.created_at).getTime(),
        tone: transaction.status === "succeeded" ? "accent" : "warning",
        icon: Wallet,
        href: "/business/campaigns",
      });
    }

    for (const campaign of campaigns.slice(0, 8)) {
      activities.push({
        id: `campaign-${campaign.id}`,
        title: t("Campaign workspace updated"),
        subtitle: `${campaign.title} · ${t(statusLabel(campaign.status))}`,
        time: formatDateLabel(campaign.updated_at || campaign.created_at),
        date: new Date(campaign.updated_at || campaign.created_at).getTime(),
        tone: campaign.status === "draft" ? "neutral" : "info",
        icon: Megaphone,
        href: `/campaigns/${campaign.id}`,
      });
    }

    return activities
      .filter((activity) => Number.isFinite(activity.date))
      .sort((a, b) => b.date - a.date)
      .slice(0, 7);
  }, [campaigns, clips, t, transactions]);

  const recentCampaigns = useMemo(() => {
    return [...campaigns]
      .sort((a, b) => {
        const aPerformance = a.campaign_type === "performance" ? 1 : 0;
        const bPerformance = b.campaign_type === "performance" ? 1 : 0;
        if (aPerformance !== bPerformance) return bPerformance - aPerformance;
        return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
      })
      .slice(0, 5);
  }, [campaigns]);

  const isStripeConnected = !!profile?.stripe_connect_id && !!profile?.stripe_onboarding_completed;
  const isLoading = loading || transactionsLoading;
  const welcomeName = profile?.company_name || profile?.full_name || t("Brand Workspace");

  if (!mounted) return null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <BusinessSectionHeader
        eyebrow={t("Business Dashboard")}
        title={welcomeName}
        description={t("Live performance campaign health, verified views, pending submissions, and campaign treasury movement.")}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <BusinessActionButton
              variant="secondary"
              onClick={handleRefreshMetrics}
              disabled={isRefreshing}
              icon={RefreshCw}
              className={isRefreshing ? "[&_svg]:animate-spin" : undefined}
            >
              {t("Refresh Metrics")}
            </BusinessActionButton>
            <BusinessActionButton href="/business/campaigns/new" icon={Plus}>
              {t("New Campaign")}
            </BusinessActionButton>
          </div>
        }
      />

      {dashboardError ? (
        <BusinessGlassCard variant="elevated" className="border-[rgba(248,113,113,0.25)]">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--business-danger)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--business-text)]">{t("Dashboard sync issue")}</p>
              <p className="mt-1 text-sm text-[var(--business-muted)]">{dashboardError}</p>
            </div>
          </div>
        </BusinessGlassCard>
      ) : null}

      {!isStripeConnected && !isLoading ? (
        <BusinessGlassCard variant="elevated" className="border-[rgba(251,191,36,0.25)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.10)] text-[var(--business-warning)]">
                <ShieldAlert size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--business-text)]">
                  {t("Stripe funding connection required")}
                </p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--business-muted)]">
                  {t("Connect Stripe to fund campaign budget pools and pay approved creator earnings.")}
                </p>
              </div>
            </div>
            <BusinessActionButton
              variant="secondary"
              onClick={handleOnboardStripe}
              disabled={onboardingLoading}
              icon={onboardingLoading ? Loader2 : ShieldAlert}
              className={onboardingLoading ? "[&_svg]:animate-spin" : undefined}
            >
              {t("Connect Stripe")}
            </BusinessActionButton>
          </div>
        </BusinessGlassCard>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <BusinessGlassCard key={item} className="min-h-36">
              <div className="apple-skeleton h-3 w-24 rounded-full" />
              <div className="apple-skeleton mt-8 h-8 w-28 rounded-full" />
              <div className="apple-skeleton mt-4 h-3 w-32 rounded-full" />
            </BusinessGlassCard>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <BusinessEmptyState
          icon={Zap}
          title={t("Launch your first Content Rewards campaign")}
          description={t("Create a performance campaign, fund the budget pool, and start tracking verified views from approved creator submissions.")}
          actionHref="/business/campaigns/new"
          actionLabel={t("Create Campaign")}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <BusinessMetricCard
              label={t("Active campaigns")}
              value={dashboard.activeCampaigns.length.toLocaleString()}
              detail={`${dashboard.draftCampaigns.length} ${t("drafts")}`}
              icon={Megaphone}
              tone="accent"
            />
            <BusinessMetricCard
              label={t("Pending submissions")}
              value={dashboard.pendingClips.length.toLocaleString()}
              detail={t("awaiting moderation")}
              icon={ClipboardCheck}
              tone={dashboard.pendingClips.length > 0 ? "warning" : "success"}
            />
            <BusinessMetricCard
              label={t("Verified views")}
              value={compactNumber(dashboard.verifiedViews)}
              detail={`${dashboard.verifiedClips.length} ${t("tracked clips")}`}
              icon={Eye}
              tone="info"
            />
            <BusinessMetricCard
              label={t("Paid to creators")}
              value={money(dashboard.totalSpend)}
              detail={`${dashboard.activeCreators} ${t("active creators")}`}
              icon={DollarSign}
              tone="success"
            />
          </div>

          {dashboard.pendingClips.length > 0 ? (
            <Link
              href="/business/moderation"
              className="business-glass-elevated flex flex-col gap-3 rounded-2xl p-4 transition-colors hover:bg-white/[0.08] sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.10)] text-[var(--business-warning)]">
                  <Clock size={18} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-[var(--business-text)]">
                    {dashboard.pendingClips.length} {t("submission(s) waiting for approval")}
                  </span>
                  <span className="mt-1 block text-sm text-[var(--business-muted)]">
                    {t("Review brand safety, approve eligible clips, and keep the verified-views ledger moving.")}
                  </span>
                </span>
              </span>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--business-warning)]">
                {t("Open queue")} <ArrowRight size={16} />
              </span>
            </Link>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <BusinessGlassCard variant="heavy" className="space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--business-primary)]">
                    {t("Campaign treasury")}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-normal text-[var(--business-text)]">
                    {money(dashboard.totalRemaining)} {t("remaining")}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--business-muted)]">
                    {money(dashboard.totalPaid)} {t("paid")} · {money(dashboard.totalReserved)} {t("reserved")} · {Math.round(dashboard.usedPct)}% {t("used")}
                  </p>
                </div>
                <BusinessStatusPill tone={dashboard.usedPct >= 90 ? "warning" : "accent"}>
                  {dashboard.performanceCampaigns.length} {t("performance")}
                </BusinessStatusPill>
              </div>

              <BusinessProgressBar
                value={dashboard.totalPaid + dashboard.totalReserved}
                max={dashboard.totalPool || 100}
                label={t("Budget pool usage")}
                tone={dashboard.usedPct >= 90 ? "warning" : "accent"}
              />

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                    {t("Funded")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--business-text)]">
                    {money(dashboard.totalFunded)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                    {t("Creator pool")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--business-text)]">
                    {money(dashboard.totalPool)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                    {t("ROI")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--business-text)]">
                    {dashboard.roi > 0 ? `${dashboard.roi.toFixed(1)}x` : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                    {t("Conversions")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--business-text)]">
                    {dashboard.conversions.toLocaleString()}
                  </p>
                </div>
              </div>
            </BusinessGlassCard>

            <BusinessGlassCard variant="elevated" className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--business-primary)]">
                    {t("Activity")}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-normal text-[var(--business-text)]">
                    {t("Live workspace feed")}
                  </h2>
                </div>
                <BusinessStatusPill tone="success">{t("Live")}</BusinessStatusPill>
              </div>

              {activityFeed.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-6 text-center text-sm text-[var(--business-muted)]">
                  {t("No campaign activity yet.")}
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {activityFeed.map((activity) => {
                    const Icon = activity.icon;
                    const row = (
                      <div className="flex items-start gap-3 py-3">
                        <span className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border ${activityToneClass[activity.tone]}`}>
                          <Icon size={16} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-3">
                            <span className="truncate text-sm font-semibold text-[var(--business-text)]">
                              {activity.title}
                            </span>
                            <span className="shrink-0 text-xs text-[var(--business-muted)]">
                              {activity.time}
                            </span>
                          </span>
                          <span className="mt-1 block truncate text-xs text-[var(--business-muted)]">
                            {activity.subtitle}
                          </span>
                        </span>
                      </div>
                    );

                    return activity.href ? (
                      <Link
                        key={activity.id}
                        href={activity.href}
                        className="block rounded-xl transition-colors hover:bg-white/[0.05]"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div key={activity.id}>{row}</div>
                    );
                  })}
                </div>
              )}
            </BusinessGlassCard>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.9fr]">
            <BusinessGlassCard className="min-h-[360px] space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--business-primary)]">
                    {t("Campaign performance")}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-normal text-[var(--business-text)]">
                    {t("Budget activity and verified views")}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--business-muted)]">
                    {t("Recent ledger movement compared with clip volume.")}
                  </p>
                </div>
                <BusinessStatusPill tone="info">
                  {compactNumber(dashboard.verifiedViews)} {t("views")}
                </BusinessStatusPill>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="businessSpendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#adc6ff" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#adc6ff" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="businessViewsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      stroke="var(--business-muted)"
                      fontSize={11}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      stroke="var(--business-muted)"
                      fontSize={11}
                      tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        background: "rgba(21,27,45,0.96)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "var(--business-text)",
                      }}
                      formatter={(value, name) => {
                        if (name === "spend") return [money(Number(value)), t("Spend")];
                        return [compactNumber(Number(value)), t("Views")];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="spend"
                      stroke="#adc6ff"
                      strokeWidth={2.5}
                      fill="url(#businessSpendFill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="views"
                      stroke="#34d399"
                      strokeWidth={2}
                      fill="url(#businessViewsFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </BusinessGlassCard>

            <BusinessGlassCard className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--business-primary)]">
                    {t("Campaigns")}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-normal text-[var(--business-text)]">
                    {t("Recent workspaces")}
                  </h2>
                </div>
                <BusinessActionButton href="/business/campaigns" variant="ghost" size="sm" trailingIcon={ArrowRight}>
                  {t("All")}
                </BusinessActionButton>
              </div>

              <div className="divide-y divide-white/10">
                {recentCampaigns.map((campaign) => {
                  const isPerformance = campaign.campaign_type === "performance";
                  const pool = numberValue(campaign.available_pool ?? campaign.budget_pool ?? campaign.budget_total);
                  const used = numberValue(campaign.budget_reserved) + numberValue(campaign.budget_paid);
                  const category = campaignCategoryLabel(campaign.campaign_category);

                  return (
                    <Link
                      key={campaign.id}
                      href={`/campaigns/${campaign.id}`}
                      className="block rounded-xl py-4 transition-colors hover:bg-white/[0.05]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--business-text)]">
                            {campaign.title}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <BusinessStatusPill tone={campaignTone(campaign.status)}>
                              {t(statusLabel(campaign.status))}
                            </BusinessStatusPill>
                            <BusinessStatusPill tone={isPerformance ? "accent" : "neutral"}>
                              {isPerformance ? t("Performance") : t("Fixed fee")}
                            </BusinessStatusPill>
                            {category ? (
                              <BusinessStatusPill tone="info">{t(category)}</BusinessStatusPill>
                            ) : null}
                          </div>
                        </div>
                        <span className="shrink-0 text-right text-xs text-[var(--business-muted)]">
                          <span className="block font-semibold text-[var(--business-text)]">
                            {money(pool)}
                          </span>
                          <span>{formatDateLabel(campaign.updated_at || campaign.created_at)}</span>
                        </span>
                      </div>
                      {isPerformance ? (
                        <div className="mt-3">
                          <BusinessProgressBar value={used} max={pool || 100} tone="accent" />
                        </div>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </BusinessGlassCard>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <BusinessGlassCard className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Legacy fixed-fee")}
                </span>
                <span className="mt-1 block text-lg font-semibold text-[var(--business-text)]">
                  {dashboard.fixedFeeCampaigns.length}
                </span>
              </span>
              <Layers size={20} className="text-[var(--business-muted)]" />
            </BusinessGlassCard>
            <BusinessGlassCard className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Legacy pending")}
                </span>
                <span className="mt-1 block text-lg font-semibold text-[var(--business-text)]">
                  {money(balances.pending, 2)}
                </span>
              </span>
              <Wallet size={20} className="text-[var(--business-muted)]" />
            </BusinessGlassCard>
            <BusinessGlassCard className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Attributed value")}
                </span>
                <span className="mt-1 block text-lg font-semibold text-[var(--business-text)]">
                  {money(dashboard.attributedValue)}
                </span>
              </span>
              <TrendingUp size={20} className="text-[var(--business-muted)]" />
            </BusinessGlassCard>
          </div>
        </>
      )}
    </div>
  );
}
