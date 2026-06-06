"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Flag,
  Layers,
  RefreshCw,
  ShieldAlert,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

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
import { budgetUsage } from "@/lib/campaign-budget";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/translations";

type CampaignStatus = "draft" | "open" | "in_progress" | "completed" | "cancelled" | "exhausted" | string;
type CampaignType = "fixed" | "performance";
type CampaignCategory = "ugc" | "clipping" | null;
type CreatorFilter = "active" | "review" | "paid";

export interface BusinessCampaignInsightMoney {
  accrued: number;
  approved: number;
  paid: number;
  reversed: number;
}

export interface BusinessCampaignInsightCreator {
  creatorId: string;
  participationId: string | null;
  name: string;
  handle: string;
  avatarUrl: string | null;
  status: string;
  clips: number;
  pendingClips: number;
  trackingClips: number;
  views: number;
  earnings: BusinessCampaignInsightMoney;
  lastActivity: string | null;
}

export interface BusinessCampaignInsightClip {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  platform: string;
  postUrl: string;
  status: string;
  currentViews: number;
  estimatedEarnings: number;
  qualityStatus: string | null;
  qualityScore: number | null;
  fraudFlagged: boolean;
  fraudScore: number | null;
  submittedAt: string | null;
  updatedAt: string | null;
}

export interface BusinessCampaignInsightData {
  campaign: {
    id: string;
    title: string;
    description: string;
    status: CampaignStatus;
    campaignType: CampaignType;
    campaignCategory: CampaignCategory;
    targetNiches: string[];
    platforms: string[];
    createdAt: string | null;
    updatedAt: string | null;
    fundedAt: string | null;
    cpmRate: number | null;
    budgetTotal: number;
    budgetPool: number;
    availablePool: number | null;
    budgetReserved: number;
    budgetPaid: number;
    minPayoutThreshold: number | null;
    maxPayoutPerCreator: number | null;
  };
  creators: BusinessCampaignInsightCreator[];
  clips: BusinessCampaignInsightClip[];
  earnings: BusinessCampaignInsightMoney;
}

interface BusinessCampaignInsightsProps {
  data: BusinessCampaignInsightData;
  onBack: () => void;
  onRefresh: () => Promise<void> | void;
  refreshing?: boolean;
}

const creatorFilters: Array<{ id: CreatorFilter; label: string }> = [
  { id: "active", label: "Active" },
  { id: "review", label: "Review" },
  { id: "paid", label: "Paid" },
];

const activeCampaignStatuses = new Set(["open", "in_progress"]);
const verifiedClipStatuses = new Set(["approved", "tracking"]);

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

function formatDate(value: string | null | undefined): string {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function statusLabel(status: string): string {
  if (status === "in_progress") return "Tracking";
  if (status === "open") return "Marketplace open";
  if (status === "exhausted") return "Budget exhausted";
  return status.replace(/_/g, " ");
}

function campaignStatusTone(status: string): BusinessTone {
  if (status === "completed") return "success";
  if (status === "draft") return "warning";
  if (status === "cancelled" || status === "exhausted") return "danger";
  if (activeCampaignStatuses.has(status)) return "accent";
  return "neutral";
}

function clipStatusTone(status: string): BusinessTone {
  if (status === "tracking" || status === "approved") return "success";
  if (status === "pending") return "warning";
  if (status === "rejected" || status === "disqualified") return "danger";
  return "neutral";
}

function creatorStatusTone(status: string): BusinessTone {
  if (status === "completed") return "success";
  if (status === "active" || status === "accepted") return "accent";
  if (status === "applied" || status === "offered") return "warning";
  if (status === "declined" || status === "cancelled" || status === "banned") return "danger";
  return "neutral";
}

function categoryLabel(category: CampaignCategory): string {
  if (category === "ugc") return "UGC";
  if (category === "clipping") return "Clipping";
  return "Performance";
}

function platformLabel(platform: string): string {
  if (!platform) return "Social";
  return platform
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function metricDelta(current: number, baseline: number): string {
  if (baseline <= 0 && current > 0) return "New";
  if (baseline <= 0) return "Flat";
  const pct = ((current - baseline) / baseline) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function avatarInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "CR"
  );
}

function CreatorAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <span
        role="img"
        aria-label={name}
        className="block size-10 shrink-0 rounded-xl border border-white/10 bg-cover bg-center"
        style={{ backgroundImage: `url(${avatarUrl})` }}
      />
    );
  }

  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-xs font-bold text-[var(--business-primary)]">
      {avatarInitials(name)}
    </span>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)]">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--business-text)]">{value}</p>
    </div>
  );
}

function SignalCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "accent",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone?: BusinessTone;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)]">
            {label}
          </p>
          <p className="mt-2 text-lg font-semibold text-[var(--business-text)]">{value}</p>
        </div>
        <BusinessStatusPill tone={tone}>
          <Icon size={10} />
        </BusinessStatusPill>
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--business-muted)]">{detail}</p>
    </div>
  );
}

function BarSparkline({
  rows,
}: {
  rows: Array<{ label: string; views: number; earnings: number }>;
}) {
  const maxValue = Math.max(
    ...rows.map((row) => Math.max(row.views, row.earnings)),
    1
  );

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
          <span className="text-xs font-semibold text-[var(--business-muted)]">{row.label}</span>
          <div className="space-y-1.5">
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full bg-[var(--business-primary)]"
                style={{ width: `${(row.views / maxValue) * 100}%` }}
              />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="h-full rounded-full bg-[var(--business-success)]"
                style={{ width: `${(row.earnings / maxValue) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BusinessCampaignInsights({
  data,
  onBack,
  onRefresh,
  refreshing = false,
}: BusinessCampaignInsightsProps) {
  const { t } = useTranslation();
  const [activeCreatorFilter, setActiveCreatorFilter] = useState<CreatorFilter>("active");

  const usage = useMemo(
    () =>
      budgetUsage({
        budget_pool: data.campaign.budgetPool || data.campaign.budgetTotal,
        available_pool: data.campaign.availablePool,
        budget_reserved: data.campaign.budgetReserved,
        budget_paid: data.campaign.budgetPaid,
      }),
    [data.campaign]
  );

  const verifiedClips = useMemo(
    () => data.clips.filter((clip) => verifiedClipStatuses.has(clip.status)),
    [data.clips]
  );
  const pendingClips = useMemo(
    () => data.clips.filter((clip) => clip.status === "pending"),
    [data.clips]
  );
  const flaggedClips = useMemo(
    () => data.clips.filter((clip) => clip.fraudFlagged),
    [data.clips]
  );
  const totalViews = verifiedClips.reduce((sum, clip) => sum + clip.currentViews, 0);
  const totalEarnings =
    data.earnings.accrued + data.earnings.approved + data.earnings.paid;
  const pendingEarnings = data.earnings.accrued + data.earnings.approved;
  const totalCreators = data.creators.length;
  const activeCreators = data.creators.filter(
    (creator) => creator.trackingClips > 0 || creator.status === "active" || creator.status === "accepted"
  ).length;

  const chartRows = useMemo(() => {
    const now = new Date();
    const starts = Array.from({ length: 6 }, (_, index) => {
      return new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    });
    const rows = new Map(
      starts.map((date) => [
        monthKey(date),
        {
          label: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
          views: 0,
          earnings: 0,
        },
      ])
    );

    for (const clip of data.clips) {
      const rawDate = clip.submittedAt ?? clip.updatedAt;
      if (!rawDate) continue;
      const row = rows.get(monthKey(new Date(rawDate)));
      if (row) row.views += clip.currentViews;
    }

    for (const clip of data.clips) {
      const rawDate = clip.updatedAt ?? clip.submittedAt;
      if (!rawDate) continue;
      const row = rows.get(monthKey(new Date(rawDate)));
      if (row) row.earnings += clip.estimatedEarnings;
    }

    return Array.from(rows.values());
  }, [data.clips]);

  const creatorCounts = useMemo<Record<CreatorFilter, number>>(
    () => ({
      active: data.creators.filter(
        (creator) => creator.trackingClips > 0 || creator.status === "active" || creator.status === "accepted"
      ).length,
      review: data.creators.filter(
        (creator) => creator.pendingClips > 0 || creator.status === "applied" || creator.status === "offered"
      ).length,
      paid: data.creators.filter((creator) => creator.earnings.paid > 0 || creator.status === "completed").length,
    }),
    [data.creators]
  );

  const filteredCreators = useMemo(() => {
    const list = data.creators.filter((creator) => {
      if (activeCreatorFilter === "active") {
        return creator.trackingClips > 0 || creator.status === "active" || creator.status === "accepted";
      }
      if (activeCreatorFilter === "review") {
        return creator.pendingClips > 0 || creator.status === "applied" || creator.status === "offered";
      }
      return creator.earnings.paid > 0 || creator.status === "completed";
    });

    const source = list.length > 0 ? list : data.creators;
    return [...source].sort((a, b) => {
      if (b.views !== a.views) return b.views - a.views;
      return (b.earnings.paid + b.earnings.approved + b.earnings.accrued)
        - (a.earnings.paid + a.earnings.approved + a.earnings.accrued);
    });
  }, [activeCreatorFilter, data.creators]);

  const recentClips = useMemo(
    () =>
      [...data.clips]
        .sort((a, b) => {
          const aDate = new Date(a.updatedAt ?? a.submittedAt ?? 0).getTime();
          const bDate = new Date(b.updatedAt ?? b.submittedAt ?? 0).getTime();
          return bDate - aDate;
        })
        .slice(0, 8),
    [data.clips]
  );

  const baselineViews = chartRows.slice(0, -1).reduce((sum, row) => sum + row.views, 0);
  const latestViews = chartRows.at(-1)?.views ?? 0;
  const campaignType =
    data.campaign.campaignType === "performance"
      ? categoryLabel(data.campaign.campaignCategory)
      : "Fixed fee";

  return (
    <div className="business-portal min-h-[calc(100svh-4rem)] bg-[linear-gradient(180deg,#0c1324_0%,#10131d_58%,#0b0f18_100%)] text-[var(--business-text)]">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-[var(--business-muted)] transition-colors hover:text-[var(--business-text)]"
        >
          <ArrowLeft size={14} />
          {t("Back to campaign hub")}
        </button>

        <BusinessSectionHeader
          eyebrow={t("Campaign Insights")}
          title={data.campaign.title}
          description={
            data.campaign.description ||
            t("Real-time performance, creator production, verified views, and budget consumption for this campaign.")
          }
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <BusinessActionButton
                variant="secondary"
                onClick={onRefresh}
                disabled={refreshing}
                icon={RefreshCw}
                className={refreshing ? "[&_svg]:animate-spin" : undefined}
              >
                {t("Refresh")}
              </BusinessActionButton>
              <BusinessActionButton href="/business/moderation" icon={ShieldAlert}>
                {t("Review Queue")}
              </BusinessActionButton>
            </div>
          }
        />

        <BusinessGlassCard variant="elevated">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <BusinessStatusPill tone={campaignStatusTone(data.campaign.status)}>
                  {t(statusLabel(data.campaign.status))}
                </BusinessStatusPill>
                <BusinessStatusPill tone={data.campaign.campaignType === "performance" ? "accent" : "neutral"}>
                  {t(campaignType)}
                </BusinessStatusPill>
                {data.campaign.fundedAt ? (
                  <BusinessStatusPill tone="success">{t("Funded")}</BusinessStatusPill>
                ) : (
                  <BusinessStatusPill tone="warning">{t("Unfunded")}</BusinessStatusPill>
                )}
                {flaggedClips.length > 0 ? (
                  <BusinessStatusPill tone="danger">
                    <Flag size={10} /> {flaggedClips.length} {t("flagged")}
                  </BusinessStatusPill>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[780px]">
                <DetailCell label={t("RPM")} value={data.campaign.cpmRate ? `${money(data.campaign.cpmRate, 2)} / 1k` : t("Not set")} />
                <DetailCell label={t("Minimum")} value={data.campaign.minPayoutThreshold ? money(data.campaign.minPayoutThreshold, 2) : t("None")} />
                <DetailCell label={t("Creator cap")} value={data.campaign.maxPayoutPerCreator ? money(data.campaign.maxPayoutPerCreator, 2) : t("No cap")} />
                <DetailCell label={t("Launched")} value={formatDate(data.campaign.fundedAt ?? data.campaign.createdAt)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              {data.campaign.targetNiches.slice(0, 5).map((niche) => (
                <span
                  key={niche}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--business-muted)]"
                >
                  {niche}
                </span>
              ))}
              {data.campaign.platforms.slice(0, 4).map((platform) => (
                <span
                  key={platform}
                  className="rounded-lg border border-[rgba(77,142,255,0.20)] bg-[rgba(77,142,255,0.10)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--business-accent)]"
                >
                  {platformLabel(platform)}
                </span>
              ))}
            </div>
          </div>
        </BusinessGlassCard>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BusinessMetricCard
            label={t("Verified views")}
            value={compactNumber(totalViews)}
            detail={`${verifiedClips.length} ${t("approved/tracking clips")}`}
            trend={metricDelta(latestViews, baselineViews)}
            icon={Eye}
            tone="accent"
          />
          <BusinessMetricCard
            label={t("Creator pool")}
            value={money(usage.pool)}
            detail={`${money(usage.remaining)} ${t("remaining")}`}
            trend={`${Math.round(usage.pct * 100)}% ${t("used")}`}
            icon={Wallet}
            tone={usage.pct >= 0.9 ? "warning" : "success"}
          />
          <BusinessMetricCard
            label={t("Pending review")}
            value={pendingClips.length.toLocaleString()}
            detail={`${flaggedClips.length} ${t("flagged clips")}`}
            trend={`${data.clips.length} ${t("total clips")}`}
            icon={ShieldAlert}
            tone={pendingClips.length > 0 ? "warning" : "success"}
          />
          <BusinessMetricCard
            label={t("Creator earnings")}
            value={money(totalEarnings)}
            detail={`${money(pendingEarnings, 2)} ${t("pending payout")}`}
            trend={`${money(data.earnings.paid, 2)} ${t("paid")}`}
            icon={CircleDollarSign}
            tone="secondary"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <BusinessGlassCard variant="elevated">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Budget burn-down")}
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-normal text-[var(--business-text)]">
                  {money(usage.used)} {t("committed")} / {money(usage.pool)}
                </h2>
              </div>
              <BusinessStatusPill tone={usage.pct >= 0.9 ? "warning" : "accent"}>
                {Math.round(usage.pct * 100)}% {t("used")}
              </BusinessStatusPill>
            </div>
            <BusinessProgressBar
              value={usage.used}
              max={usage.pool}
              label={`${money(usage.remaining, 2)} ${t("remaining")}`}
              tone={usage.pct >= 0.9 ? "warning" : "accent"}
            />
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <DetailCell label={t("Funded")} value={money(usage.totalFunded, 2)} />
              <DetailCell label={t("Platform fee")} value={money(usage.platformFee, 2)} />
              <DetailCell label={t("Reserved")} value={money(usage.reserved, 2)} />
              <DetailCell label={t("Paid")} value={money(usage.paid, 2)} />
            </div>
          </BusinessGlassCard>

          <BusinessGlassCard variant="elevated">
            <div className="mb-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                {t("Monthly signal")}
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-normal text-[var(--business-text)]">
                {t("Views and earnings")}
              </h2>
            </div>
            <BarSparkline rows={chartRows} />
            <div className="mt-5 flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--business-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[var(--business-primary)]" /> {t("Views")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-[var(--business-success)]" /> {t("Earnings")}
              </span>
            </div>
          </BusinessGlassCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SignalCard
            icon={Users}
            label={t("Creator coverage")}
            value={`${activeCreators}/${totalCreators}`}
            detail={t("Creators with active participation or approved tracking content.")}
            tone="accent"
          />
          <SignalCard
            icon={Zap}
            label={t("Velocity")}
            value={metricDelta(latestViews, baselineViews)}
            detail={t("Latest monthly view movement compared with accumulated previous months.")}
            tone={latestViews >= baselineViews ? "success" : "warning"}
          />
          <SignalCard
            icon={AlertTriangle}
            label={t("Quality queue")}
            value={flaggedClips.length > 0 ? `${flaggedClips.length} ${t("flagged")}` : t("Clear")}
            detail={t("Fraud and quality flags are surfaced before money moves from reserved to paid.")}
            tone={flaggedClips.length > 0 ? "danger" : "success"}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)]">
          <BusinessGlassCard variant="elevated">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Influencer management")}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-normal text-[var(--business-text)]">
                  {t("Creator performance")}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {creatorFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setActiveCreatorFilter(filter.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                      activeCreatorFilter === filter.id
                        ? "border-[rgba(173,198,255,0.30)] bg-[rgba(173,198,255,0.12)] text-[var(--business-primary)]"
                        : "border-white/10 bg-white/[0.04] text-[var(--business-muted)] hover:text-[var(--business-text)]"
                    )}
                  >
                    {t(filter.label)} ({creatorCounts[filter.id]})
                  </button>
                ))}
              </div>
            </div>

            {filteredCreators.length === 0 ? (
              <BusinessEmptyState
                icon={Users}
                title={t("No creators in this view")}
                description={t("Creators will appear here as they apply, submit clips, and accrue verified earnings.")}
                className="min-h-72"
              />
            ) : (
              <div className="space-y-3">
                {filteredCreators.slice(0, 8).map((creator, index) => {
                  const creatorEarned = creator.earnings.accrued + creator.earnings.approved + creator.earnings.paid;
                  return (
                    <div
                      key={`${creator.creatorId}-${creator.participationId ?? "creator"}`}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-xs font-bold text-[var(--business-muted)]">
                            {index + 1}
                          </span>
                          <CreatorAvatar name={creator.name} avatarUrl={creator.avatarUrl} />
                          <div className="min-w-0">
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-sm font-semibold text-[var(--business-text)]">{creator.name}</h3>
                              <BusinessStatusPill tone={creatorStatusTone(creator.status)}>
                                {t(statusLabel(creator.status))}
                              </BusinessStatusPill>
                            </div>
                            <p className="truncate text-xs text-[var(--business-muted)]">
                              {creator.handle || t("No handle")} - {formatDate(creator.lastActivity)}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-right md:min-w-72">
                          <div>
                            <p className="text-sm font-semibold text-[var(--business-text)]">{compactNumber(creator.views)}</p>
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--business-muted)]">{t("views")}</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--business-text)]">{creator.clips}</p>
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--business-muted)]">{t("clips")}</p>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[var(--business-text)]">{money(creatorEarned, 2)}</p>
                            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--business-muted)]">{t("earned")}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BusinessGlassCard>

          <BusinessGlassCard variant="elevated">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Financial state")}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-normal text-[var(--business-text)]">
                  {t("Earnings ledger")}
                </h2>
              </div>
              <BusinessActionButton href="/business/payments" variant="secondary" size="sm" trailingIcon={ArrowRight}>
                {t("Treasury")}
              </BusinessActionButton>
            </div>
            <div className="space-y-3">
              <DetailCell label={t("Accrued holdback")} value={money(data.earnings.accrued, 2)} />
              <DetailCell label={t("Approved")} value={money(data.earnings.approved, 2)} />
              <DetailCell label={t("Paid")} value={money(data.earnings.paid, 2)} />
              <DetailCell label={t("Reversed")} value={money(data.earnings.reversed, 2)} />
            </div>
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[var(--business-success)]" />
                <p className="text-sm leading-6 text-[var(--business-muted)]">
                  {t("Performance earnings are counted from verified clip views and capped by this campaign's available creator pool.")}
                </p>
              </div>
            </div>
          </BusinessGlassCard>
        </div>

        <BusinessGlassCard variant="elevated">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                {t("Submission stream")}
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-normal text-[var(--business-text)]">
                {t("Recent clips")}
              </h2>
            </div>
            <BusinessActionButton href="/business/moderation" variant="secondary" size="sm" trailingIcon={ArrowRight}>
              {t("Moderation")}
            </BusinessActionButton>
          </div>

          {recentClips.length === 0 ? (
            <BusinessEmptyState
              icon={Layers}
              title={t("No clips submitted yet")}
              description={t("Approved, pending, rejected, and tracking submissions will appear here once creators start posting.")}
              className="min-h-72"
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="hidden grid-cols-[1.2fr_0.8fr_120px_120px_120px] gap-4 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)] md:grid">
                <span>{t("Clip")}</span>
                <span>{t("Creator")}</span>
                <span className="text-right">{t("Views")}</span>
                <span className="text-right">{t("Earnings")}</span>
                <span className="text-right">{t("Status")}</span>
              </div>
              <div className="divide-y divide-white/10">
                {recentClips.map((clip) => (
                  <a
                    key={clip.id}
                    href={clip.postUrl || undefined}
                    target={clip.postUrl ? "_blank" : undefined}
                    rel="noreferrer"
                    className="grid gap-3 px-4 py-4 transition-colors hover:bg-white/[0.04] md:grid-cols-[1.2fr_0.8fr_120px_120px_120px] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <BusinessStatusPill tone="info">{platformLabel(clip.platform)}</BusinessStatusPill>
                        {clip.fraudFlagged ? (
                          <BusinessStatusPill tone="danger">
                            <Flag size={10} /> {t("Flagged")}
                          </BusinessStatusPill>
                        ) : null}
                      </div>
                      <p className="truncate text-sm font-semibold text-[var(--business-text)]">
                        {clip.postUrl || t("No URL captured")}
                      </p>
                      <p className="mt-1 text-xs text-[var(--business-muted)]">{formatDate(clip.submittedAt ?? clip.updatedAt)}</p>
                    </div>
                    <div className="flex min-w-0 items-center gap-3">
                      <CreatorAvatar name={clip.creatorName} avatarUrl={clip.creatorAvatarUrl} />
                      <span className="truncate text-sm font-semibold text-[var(--business-text)]">{clip.creatorName}</span>
                    </div>
                    <p className="text-sm font-semibold text-[var(--business-text)] md:text-right">
                      {compactNumber(clip.currentViews)}
                    </p>
                    <p className="text-sm font-semibold text-[var(--business-text)] md:text-right">
                      {money(clip.estimatedEarnings, 2)}
                    </p>
                    <div className="md:text-right">
                      <BusinessStatusPill tone={clipStatusTone(clip.status)}>{t(statusLabel(clip.status))}</BusinessStatusPill>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </BusinessGlassCard>
      </div>
    </div>
  );
}
