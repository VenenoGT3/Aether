"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  ExternalLink,
  Eye,
  Gauge,
  Layers,
  Loader2,
  MessageSquare,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  X,
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
  type BusinessTone,
} from "@/components/business/business-ui";
import {
  CAMPAIGN_CATEGORY_LABELS,
  type CampaignCategory,
} from "@/lib/campaign-category";
import { approvalCountdownLabel, workingDaysLeft } from "@/lib/approval";
import { supabase } from "@/lib/supabase/client";
import { type ModerationClip, useBrandModeration } from "@/lib/supabase/clips";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/translations";

interface PerfCampaign {
  id: string;
  title: string;
  status?: string | null;
  budget_pool?: number | null;
  available_pool?: number | null;
  budget_reserved?: number | null;
  budget_paid?: number | null;
  brand_cpm_rate?: number | null;
  cpm_rate?: number | null;
  min_payout_threshold?: number | null;
  max_payout_per_creator?: number | null;
}

interface BrandClip {
  campaign_id: string;
  status: string;
  current_views: number | null;
  counted_views: number | null;
  platform?: string | null;
  post_url?: string | null;
}

type QueueFilter = "all" | "urgent" | "clipping" | "ugc";

const queueFilters: QueueFilter[] = ["all", "urgent", "clipping", "ugc"];

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

function formatDate(value?: string | null): string {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function platformLabel(value?: string | null): string {
  if (!value) return "Social";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getYouTubeId(url?: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/
  );
  return match ? match[1] : null;
}

function categoryLabel(category?: "ugc" | "clipping" | null): string {
  if (!category) return "Performance";
  return CAMPAIGN_CATEGORY_LABELS[category as CampaignCategory] ?? category;
}

function deadlineTone(deadline?: string | null): BusinessTone {
  const days = workingDaysLeft(deadline);
  if (days == null) return "neutral";
  if (days <= 1) return "danger";
  if (days <= 2) return "warning";
  return "accent";
}

function isUrgent(clip: ModerationClip): boolean {
  const days = workingDaysLeft(clip.approval_deadline);
  return days != null && days <= 1;
}

function campaignPool(campaign: PerfCampaign): number {
  return numberValue(campaign.available_pool ?? campaign.budget_pool);
}

function campaignUsed(campaign: PerfCampaign): number {
  return numberValue(campaign.budget_reserved) + numberValue(campaign.budget_paid);
}

function campaignRemaining(campaign: PerfCampaign): number {
  return Math.max(campaignPool(campaign) - campaignUsed(campaign), 0);
}

function campaignRate(campaign: PerfCampaign): number {
  return numberValue(campaign.brand_cpm_rate ?? campaign.cpm_rate);
}

function filterLabel(filter: QueueFilter): string {
  switch (filter) {
    case "all":
      return "All";
    case "urgent":
      return "Urgent";
    case "clipping":
      return "Clipping";
    case "ugc":
      return "UGC";
  }
}

function QueueRow({
  clip,
  active,
  busy,
  pendingLabel,
  onSelect,
}: {
  clip: ModerationClip;
  active: boolean;
  busy: boolean;
  pendingLabel: string;
  onSelect: () => void;
}) {
  const dueTone = deadlineTone(clip.approval_deadline);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition-colors",
        active
          ? "border-[rgba(173,198,255,0.30)] bg-[rgba(173,198,255,0.12)]"
          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <BusinessStatusPill tone="warning">{pendingLabel}</BusinessStatusPill>
            <BusinessStatusPill tone="info">{platformLabel(clip.platform)}</BusinessStatusPill>
            <BusinessStatusPill tone={clip.campaignCategory === "ugc" ? "secondary" : "accent"}>
              {categoryLabel(clip.campaignCategory)}
            </BusinessStatusPill>
            {clip.approval_deadline ? (
              <BusinessStatusPill tone={dueTone}>
                <Clock size={10} /> {approvalCountdownLabel(clip.approval_deadline)}
              </BusinessStatusPill>
            ) : null}
          </div>
          <h3 className="truncate text-sm font-semibold text-[var(--business-text)]">
            {clip.creatorName}
          </h3>
          <p className="mt-1 truncate text-xs text-[var(--business-muted)]">{clip.campaignTitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-semibold text-[var(--business-text)]">
              {compactNumber(clip.current_views)}
            </p>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--business-muted)]">
              views
            </p>
          </div>
          <span className="inline-flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[var(--business-muted)]">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          </span>
        </div>
      </div>
    </button>
  );
}

function DetailMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)]">
          {label}
        </p>
        <Icon size={14} className="text-[var(--business-primary)]" />
      </div>
      <p className="mt-2 text-sm font-semibold text-[var(--business-text)]">{value}</p>
    </div>
  );
}

export default function BrandModerationPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<PerfCampaign[]>([]);
  const [allClips, setAllClips] = useState<BrandClip[]>([]);
  const { clips: pending, flagged, loading, refresh, moderate, override } = useBrandModeration();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<QueueFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);

  const loadCampaigns = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCampaigns([]);
      return;
    }

    const { data } = await supabase
      .from("campaigns")
      .select(
        "id, title, status, budget_pool, available_pool, budget_reserved, budget_paid, brand_cpm_rate, cpm_rate, min_payout_threshold, max_payout_per_creator"
      )
      .eq("campaign_type", "performance")
      .eq("business_id", user.id)
      .order("created_at", { ascending: false });
    setCampaigns((data ?? []) as PerfCampaign[]);
  }, []);

  const loadClips = useCallback(async () => {
    const { data } = await supabase
      .from("clips")
      .select("campaign_id, status, current_views, counted_views, platform, post_url");
    setAllClips((data ?? []) as BrandClip[]);
  }, []);

  const reloadAll = useCallback(async () => {
    await Promise.all([refresh(), loadCampaigns(), loadClips()]);
  }, [loadCampaigns, loadClips, refresh]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial realtime data load for this client workspace.
    loadCampaigns();
    loadClips();
    const handler = () => {
      loadClips();
    };
    window.addEventListener("aether-clips-update", handler);
    return () => {
      window.removeEventListener("aether-clips-update", handler);
    };
  }, [loadCampaigns, loadClips]);

  const queue = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return pending.filter((clip) => {
      const matchesQuery =
        query.length === 0 ||
        clip.creatorName.toLowerCase().includes(query) ||
        clip.campaignTitle.toLowerCase().includes(query) ||
        platformLabel(clip.platform).toLowerCase().includes(query);
      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "urgent" && isUrgent(clip)) ||
        activeFilter === clip.campaignCategory;

      return matchesQuery && matchesFilter;
    });
  }, [activeFilter, pending, searchQuery]);

  const selectedClip = useMemo(() => {
    if (selectedClipId) {
      const explicit = queue.find((clip) => clip.id === selectedClipId);
      if (explicit) return explicit;
    }
    return queue[0] ?? null;
  }, [queue, selectedClipId]);

  const campaignById = useMemo(() => {
    return new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  }, [campaigns]);

  const stats = useMemo(() => {
    const trackingClips = allClips.filter((clip) => clip.status === "tracking");
    const verifiedViews = trackingClips.reduce(
      (sum, clip) => sum + numberValue(clip.current_views ?? clip.counted_views),
      0
    );
    const remainingPool = campaigns.reduce((sum, campaign) => sum + campaignRemaining(campaign), 0);
    const urgent = pending.filter(isUrgent).length;
    return {
      pending: pending.length,
      urgent,
      flagged: flagged.length,
      tracking: trackingClips.length,
      verifiedViews,
      remainingPool,
    };
  }, [allClips, campaigns, flagged.length, pending]);

  const filterCounts = useMemo<Record<QueueFilter, number>>(
    () => ({
      all: pending.length,
      urgent: pending.filter(isUrgent).length,
      clipping: pending.filter((clip) => clip.campaignCategory === "clipping").length,
      ugc: pending.filter((clip) => clip.campaignCategory === "ugc").length,
    }),
    [pending]
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await reloadAll();
    } finally {
      setRefreshing(false);
    }
  };

  const handleModerate = async (
    clipId: string,
    action: "approve" | "reject" | "request_changes"
  ) => {
    const reason = notes[clipId]?.trim();
    if (action === "request_changes" && (!reason || reason.length < 3)) {
      toast.error(t("Add feedback so the creator knows what to change."));
      return;
    }

    setBusyId(clipId);
    const res = await moderate(clipId, action, { reason, score: scores[clipId] });
    setBusyId(null);
    if (res.ok) {
      toast.success(
        action === "approve"
          ? t("Clip approved — now tracking")
          : action === "request_changes"
            ? t("Changes requested — sent back to the creator")
            : t("Clip rejected")
      );
      await reloadAll();
      window.dispatchEvent(new Event("aether-clips-update"));
      return;
    }
    toast.error(res.error || t("Action failed"));
  };

  const handleDisqualify = async (clipId: string) => {
    setBusyId(clipId);
    const res = await moderate(clipId, "disqualify", {
      reason: notes[clipId]?.trim() || "Disqualified after fraud review.",
    });
    setBusyId(null);
    if (res.ok) {
      toast.success(t("Clip disqualified — earnings stopped and reversed"));
      await reloadAll();
      window.dispatchEvent(new Event("aether-clips-update"));
      return;
    }
    toast.error(res.error || t("Action failed"));
  };

  const handleOverride = async (clipId: string) => {
    setBusyId(clipId);
    const res = await override(clipId);
    setBusyId(null);
    if (res.ok) {
      toast.success(t("Flag cleared — clip keeps earning"));
      await reloadAll();
      window.dispatchEvent(new Event("aether-clips-update"));
      return;
    }
    toast.error(res.error || t("Action failed"));
  };

  const selectedCampaign = selectedClip ? campaignById.get(selectedClip.campaign_id) : undefined;
  const selectedYouTubeId = getYouTubeId(selectedClip?.post_url);
  const selectedBusy = selectedClip ? busyId === selectedClip.id : false;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <BusinessSectionHeader
        eyebrow={t("Submissions")}
        title={t("Approval matrix")}
        description={t("Review creator clips, approve eligible submissions, request fixes, and resolve fraud flags without leaving the performance marketplace workflow.")}
        action={
          <BusinessActionButton
            type="button"
            variant="secondary"
            icon={refreshing ? Loader2 : RefreshCw}
            onClick={handleRefresh}
            disabled={refreshing}
            className={refreshing ? "[&_svg]:animate-spin" : undefined}
          >
            {t("Refresh")}
          </BusinessActionButton>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <BusinessMetricCard
          label={t("Pending review")}
          value={stats.pending.toLocaleString()}
          detail={`${stats.urgent} ${t("urgent")}`}
          icon={Users}
          tone={stats.urgent > 0 ? "warning" : "accent"}
        />
        <BusinessMetricCard
          label={t("Verified views")}
          value={compactNumber(stats.verifiedViews)}
          detail={`${stats.tracking} ${t("tracking clips")}`}
          icon={Eye}
          tone="info"
        />
        <BusinessMetricCard
          label={t("Fraud flags")}
          value={stats.flagged.toLocaleString()}
          detail={stats.flagged > 0 ? t("manual review needed") : t("clear")}
          icon={ShieldAlert}
          tone={stats.flagged > 0 ? "danger" : "success"}
        />
        <BusinessMetricCard
          label={t("Remaining pool")}
          value={money(stats.remainingPool)}
          detail={t("creator-earnable budget")}
          icon={CircleDollarSign}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start">
        <div className="space-y-5">
          <BusinessGlassCard variant="elevated" className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-[var(--business-text)]">
                  {t("Submission queue")}
                </h2>
                <p className="mt-1 text-sm text-[var(--business-muted)]">
                  {t("Select a row to inspect content, creator, rules, and payout context.")}
                </p>
              </div>
              <div className="relative min-w-0 lg:w-72">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--business-muted)]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  aria-label={t("Search creator or campaign")}
                  placeholder={t("Search creator or campaign")}
                  className="business-input h-10 w-full rounded-xl pl-10 pr-4 text-sm placeholder:text-[var(--business-muted)]"
                />
              </div>
            </div>

            <div className="business-scrollbar-none flex gap-2 overflow-x-auto pb-1">
              {queueFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  aria-pressed={activeFilter === filter}
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
          </BusinessGlassCard>

          {loading ? (
            <div className="grid grid-cols-1 gap-3">
              {[0, 1, 2].map((item) => (
                <BusinessGlassCard key={item} variant="elevated" className="min-h-32">
                  <div className="apple-skeleton h-4 w-48 rounded-full" />
                  <div className="apple-skeleton mt-5 h-6 w-3/4 rounded-full" />
                  <div className="apple-skeleton mt-4 h-3 w-1/2 rounded-full" />
                </BusinessGlassCard>
              ))}
            </div>
          ) : queue.length === 0 ? (
            <BusinessEmptyState
              icon={CheckCircle2}
              title={t("No submissions match")}
              description={
                pending.length === 0
                  ? t("No clips are waiting for review.")
                  : t("Try another queue filter or search term.")
              }
              actionHref="/business/campaigns"
              actionLabel={t("Back to campaigns")}
            />
          ) : (
            <div className="space-y-3">
              {queue.map((clip, index) => (
                <motion.div
                  key={clip.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.025, 0.16) }}
                >
                  <QueueRow
                    clip={clip}
                    active={selectedClip?.id === clip.id}
                    busy={busyId === clip.id}
                    pendingLabel={t("Pending")}
                    onSelect={() => setSelectedClipId(clip.id)}
                  />
                </motion.div>
              ))}
            </div>
          )}

          {flagged.length > 0 ? (
            <BusinessGlassCard variant="elevated" className="space-y-4 border-[rgba(248,113,113,0.18)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--business-danger)]">
                    {t("Fraud review")}
                  </p>
                  <h2 className="text-lg font-semibold text-[var(--business-text)]">
                    {t("Flagged tracking clips")}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--business-muted)]">
                    {t("These clips are still earning unless you disqualify them. Override only when the signal is a false positive.")}
                  </p>
                </div>
                <BusinessStatusPill tone="danger">{flagged.length} {t("flagged")}</BusinessStatusPill>
              </div>

              <div className="space-y-3">
                {flagged.map((clip) => (
                  <div key={clip.id} className="rounded-2xl border border-[rgba(248,113,113,0.20)] bg-[rgba(248,113,113,0.06)] p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <BusinessStatusPill tone="danger">
                            {t("Risk")} {clip.fraud_score ?? 0}
                          </BusinessStatusPill>
                          <BusinessStatusPill tone="info">{platformLabel(clip.platform)}</BusinessStatusPill>
                        </div>
                        <h3 className="truncate text-sm font-semibold text-[var(--business-text)]">
                          {clip.creatorName}
                        </h3>
                        <p className="mt-1 truncate text-xs text-[var(--business-muted)]">{clip.campaignTitle}</p>
                        {clip.fraud_reasons && clip.fraud_reasons.length > 0 ? (
                          <ul className="mt-3 space-y-1 text-xs leading-5 text-[var(--business-muted)]">
                            {clip.fraud_reasons.map((reason) => (
                              <li key={reason}>- {reason}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <BusinessActionButton
                          href={clip.post_url}
                          size="sm"
                          variant="ghost"
                          trailingIcon={ExternalLink}
                        >
                          {t("Watch")}
                        </BusinessActionButton>
                        <BusinessActionButton
                          type="button"
                          size="sm"
                          variant="secondary"
                          icon={busyId === clip.id ? Loader2 : Check}
                          onClick={() => handleOverride(clip.id)}
                          disabled={busyId === clip.id}
                          className={busyId === clip.id ? "[&_svg]:animate-spin" : undefined}
                        >
                          {t("Override")}
                        </BusinessActionButton>
                        <BusinessActionButton
                          type="button"
                          size="sm"
                          variant="danger"
                          icon={busyId === clip.id ? Loader2 : X}
                          onClick={() => handleDisqualify(clip.id)}
                          disabled={busyId === clip.id}
                          className={busyId === clip.id ? "[&_svg]:animate-spin" : undefined}
                        >
                          {t("Disqualify")}
                        </BusinessActionButton>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </BusinessGlassCard>
          ) : null}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6">
          <BusinessGlassCard variant="elevated" className="space-y-5">
            {selectedClip ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--business-primary)]">
                      {t("Review detail")}
                    </p>
                    <h2 className="truncate text-xl font-semibold tracking-normal text-[var(--business-text)]">
                      {selectedClip.creatorName}
                    </h2>
                    <p className="mt-1 truncate text-sm text-[var(--business-muted)]">
                      {selectedClip.campaignTitle}
                    </p>
                  </div>
                  <BusinessStatusPill tone={deadlineTone(selectedClip.approval_deadline)}>
                    <Clock size={10} /> {approvalCountdownLabel(selectedClip.approval_deadline)}
                  </BusinessStatusPill>
                </div>

                {selectedYouTubeId ? (
                  <div className="aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
                    <iframe
                      src={`https://www.youtube.com/embed/${selectedYouTubeId}`}
                      title={t("Clip preview")}
                      className="h-full w-full"
                      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <a
                    href={selectedClip.post_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
                  >
                    <span className="flex items-center gap-3">
                      <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(173,198,255,0.20)] bg-[rgba(173,198,255,0.10)] text-[var(--business-primary)]">
                        <Play size={17} />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-[var(--business-text)]">{t("Watch submission")}</span>
                        <span className="mt-0.5 block text-xs text-[var(--business-muted)]">{platformLabel(selectedClip.platform)}</span>
                      </span>
                    </span>
                    <ExternalLink size={16} className="text-[var(--business-muted)]" />
                  </a>
                )}

                <a
                  href={selectedClip.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-[var(--business-muted)] transition-colors hover:text-[var(--business-primary)]"
                >
                  {selectedClip.post_url}
                </a>

                <div className="grid grid-cols-2 gap-3">
                  <DetailMetric
                    label={t("Current views")}
                    value={compactNumber(selectedClip.current_views)}
                    icon={Eye}
                  />
                  <DetailMetric
                    label={t("Reward rate")}
                    value={`${money(selectedClip.creatorCpm ?? (selectedCampaign ? campaignRate(selectedCampaign) : 0), 2)} RPM`}
                    icon={TrendingUp}
                  />
                  <DetailMetric
                    label={t("Submitted")}
                    value={formatDate(selectedClip.submitted_at)}
                    icon={Clock}
                  />
                  <DetailMetric
                    label={t("Type")}
                    value={t(categoryLabel(selectedClip.campaignCategory))}
                    icon={Layers}
                  />
                </div>

                {selectedCampaign ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                        {t("Budget context")}
                      </p>
                      <BusinessStatusPill tone={campaignRemaining(selectedCampaign) > 0 ? "success" : "danger"}>
                        {money(campaignRemaining(selectedCampaign))} {t("left")}
                      </BusinessStatusPill>
                    </div>
                    <BusinessProgressBar
                      value={campaignUsed(selectedCampaign)}
                      max={campaignPool(selectedCampaign) || 100}
                      label={t("Pool usage")}
                      tone={campaignRemaining(selectedCampaign) <= 0 ? "danger" : "accent"}
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--business-muted)]">
                      <span>{t("Min payout")}: {money(numberValue(selectedCampaign.min_payout_threshold))}</span>
                      <span>{t("Cap")}: {selectedCampaign.max_payout_per_creator ? money(numberValue(selectedCampaign.max_payout_per_creator)) : t("None")}</span>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                      {t("Creator feedback")}
                    </label>
                    <textarea
                      rows={4}
                      placeholder={t("Feedback for the creator — required to request changes, optional when rejecting.")}
                      value={notes[selectedClip.id] ?? ""}
                      aria-label={t("Creator feedback")}
                      onChange={(event) =>
                        setNotes((current) => ({ ...current, [selectedClip.id]: event.target.value }))
                      }
                      className="business-input w-full resize-none rounded-xl px-4 py-3 text-sm leading-6 placeholder:text-[var(--business-muted)]"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                      {t("Quality score")}
                      <select
                        value={scores[selectedClip.id] ?? ""}
                        onChange={(event) =>
                          setScores((current) => ({ ...current, [selectedClip.id]: Number(event.target.value) }))
                        }
                        aria-label={t("Quality score")}
                        className="business-input h-9 rounded-xl px-3 text-xs"
                      >
                        <option value="">{t("—")}</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                          <option key={score} value={score}>{score}</option>
                        ))}
                      </select>
                    </label>
                    <BusinessStatusPill tone="neutral">
                      {platformLabel(selectedClip.platform)}
                    </BusinessStatusPill>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <BusinessActionButton
                    type="button"
                    size="sm"
                    icon={selectedBusy ? Loader2 : Check}
                    disabled={selectedBusy}
                    onClick={() => handleModerate(selectedClip.id, "approve")}
                    className={selectedBusy ? "[&_svg]:animate-spin" : undefined}
                  >
                    {t("Approve")}
                  </BusinessActionButton>
                  <BusinessActionButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={selectedBusy ? Loader2 : MessageSquare}
                    disabled={selectedBusy}
                    onClick={() => handleModerate(selectedClip.id, "request_changes")}
                    className={selectedBusy ? "[&_svg]:animate-spin" : undefined}
                  >
                    {t("Changes")}
                  </BusinessActionButton>
                  <BusinessActionButton
                    type="button"
                    size="sm"
                    variant="danger"
                    icon={selectedBusy ? Loader2 : X}
                    disabled={selectedBusy}
                    onClick={() => handleModerate(selectedClip.id, "reject")}
                    className={selectedBusy ? "[&_svg]:animate-spin" : undefined}
                  >
                    {t("Reject")}
                  </BusinessActionButton>
                </div>
              </>
            ) : (
              <BusinessEmptyState
                icon={Sparkles}
                title={t("Select a submission")}
                description={t("Choose a clip from the queue to inspect video, creator, payout, and budget context.")}
              />
            )}
          </BusinessGlassCard>

          <BusinessGlassCard variant="elevated" className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Budget burn-down")}
                </p>
                <h3 className="mt-1 text-base font-semibold text-[var(--business-text)]">
                  {t("Performance pools")}
                </h3>
              </div>
              <Gauge size={18} className="text-[var(--business-primary)]" />
            </div>
            {campaigns.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-center text-xs leading-5 text-[var(--business-muted)]">
                {t("No performance campaigns yet.")}
              </p>
            ) : (
              <div className="space-y-4">
                {campaigns.slice(0, 5).map((campaign) => {
                  const pool = campaignPool(campaign);
                  const paid = numberValue(campaign.budget_paid);
                  const reserved = numberValue(campaign.budget_reserved);
                  const used = paid + reserved;
                  const pct = pool > 0 ? Math.min((used / pool) * 100, 100) : 0;
                  return (
                    <div key={campaign.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-semibold text-[var(--business-text)]">{campaign.title}</span>
                        <span className="shrink-0 text-[10px] text-[var(--business-muted)]">{Math.round(pct)}%</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
                        <div className="flex h-full" style={{ width: `${pct}%` }}>
                          <div
                            className="h-full bg-[var(--business-accent)]"
                            style={{ width: used > 0 ? `${(paid / used) * 100}%` : "0%" }}
                          />
                          <div
                            className="h-full bg-[var(--business-warning)]"
                            style={{ width: used > 0 ? `${(reserved / used) * 100}%` : "0%" }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-between gap-2 text-[10px] text-[var(--business-muted)]">
                        <span>{t("Paid")} {money(paid)}</span>
                        <span>{t("Reserved")} {money(reserved)}</span>
                        <span>{t("Left")} {money(campaignRemaining(campaign))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BusinessGlassCard>
        </aside>
      </div>
    </div>
  );
}
