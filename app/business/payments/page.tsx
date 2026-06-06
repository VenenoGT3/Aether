"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  DollarSign,
  Eye,
  Layers,
  Loader2,
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
  type BusinessTone,
} from "@/components/business/business-ui";
import { budgetUsage } from "@/lib/campaign-budget";
import { campaignCategoryLabel } from "@/lib/campaign-category";
import { cn } from "@/lib/utils";
import { getCampaignsAction, subscribeToCampaignChanges } from "@/lib/supabase/campaigns";
import { getClientProfile, supabase, type Profile } from "@/lib/supabase/client";
import { type TransactionRecord, useTransactions } from "@/lib/supabase/metrics";
import { startStripeOnboardingAction } from "@/lib/stripe/actions";
import { useTranslation } from "@/lib/translations";
import type { DbCampaign } from "@/types/database";

type TreasuryCampaign = Omit<DbCampaign, "status"> & {
  status: string;
  brand_cpm_rate?: number | null;
};

interface TreasuryClip {
  id: string;
  campaign_id: string;
  status: string;
  current_views: number | null;
  counted_views: number | null;
  creator_id: string | null;
  created_at: string;
  updated_at: string;
}

interface TreasuryEarning {
  id: string;
  clip_id: string;
  participation_id: string;
  campaign_id: string;
  creator_id: string;
  billable_views: number | string | null;
  effective_cpm: number | string | null;
  amount: number | string | null;
  status: "accrued" | "approved" | "paid" | "reversed" | string;
  payout_id: string | null;
  accrued_at: string;
}

interface PlatformTransaction {
  id: string;
  campaign_id: string;
  business_id: string;
  amount: number | string | null;
  fee_pct: number | string | null;
  type: string;
  created_at: string;
}

type LedgerKind = "funding" | "earnings" | "fees" | "legacy";
type LedgerFilter = "all" | LedgerKind;

interface LedgerRow {
  id: string;
  kind: LedgerKind;
  title: string;
  subtitle: string;
  amount: number;
  status: string;
  date: string;
  timestamp: number;
  tone: BusinessTone;
  icon: LucideIcon;
  href?: string;
}

const ledgerFilters: Array<{ id: LedgerFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "funding", label: "Funding" },
  { id: "earnings", label: "Earnings" },
  { id: "fees", label: "Fees" },
  { id: "legacy", label: "Legacy" },
];

const VERIFIED_CLIP_STATUSES = new Set(["approved", "tracking"]);
const ACTIVE_CAMPAIGN_STATUSES = new Set(["open", "in_progress"]);

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

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function statusLabel(value: string): string {
  if (value === "in_progress") return "Tracking";
  if (value === "open") return "Live";
  if (value === "exhausted") return "Budget exhausted";
  return value.replace(/_/g, " ");
}

function campaignTone(status: string): BusinessTone {
  if (status === "completed") return "success";
  if (status === "draft") return "warning";
  if (status === "cancelled" || status === "exhausted") return "danger";
  if (ACTIVE_CAMPAIGN_STATUSES.has(status)) return "accent";
  return "neutral";
}

function earningTone(status: string): BusinessTone {
  if (status === "paid") return "success";
  if (status === "approved") return "accent";
  if (status === "accrued") return "warning";
  if (status === "reversed") return "danger";
  return "neutral";
}

function transactionTone(status: TransactionRecord["status"]): BusinessTone {
  if (status === "succeeded") return "success";
  if (status === "pending") return "warning";
  if (status === "failed" || status === "refunded") return "danger";
  return "neutral";
}

function transactionLabel(type: TransactionRecord["type"]): string {
  switch (type) {
    case "escrow":
      return "Legacy escrow funded";
    case "release":
      return "Legacy escrow released";
    case "bonus":
      return "Creator bonus";
    case "refund":
      return "Refund recorded";
    case "payout":
      return "Creator payout";
  }
}

function transactionAmount(type: TransactionRecord["type"], amount: number): number {
  if (type === "refund") return amount;
  return -Math.abs(amount);
}

function campaignUsage(campaign: TreasuryCampaign) {
  return budgetUsage({
    budget_pool: numberValue(campaign.budget_pool ?? campaign.budget_total),
    available_pool:
      campaign.available_pool == null ? null : numberValue(campaign.available_pool),
    budget_reserved: numberValue(campaign.budget_reserved),
    budget_paid: numberValue(campaign.budget_paid),
  });
}

function rewardRate(campaign: TreasuryCampaign): number {
  return numberValue(campaign.brand_cpm_rate ?? campaign.cpm_rate);
}

function campaignTypeLabel(campaign: TreasuryCampaign): string {
  if (campaign.campaign_type !== "performance") return "Fixed fee";
  return campaignCategoryLabel(campaign.campaign_category) ?? "Performance";
}

async function loadTreasuryClips(campaignIds: string[]): Promise<TreasuryClip[]> {
  if (campaignIds.length === 0) return [];

  const { data, error } = await supabase
    .from("clips")
    .select("id, campaign_id, status, current_views, counted_views, creator_id, created_at, updated_at")
    .in("campaign_id", campaignIds)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TreasuryClip[];
}

async function loadTreasuryEarnings(campaignIds: string[]): Promise<TreasuryEarning[]> {
  if (campaignIds.length === 0) return [];

  const { data, error } = await supabase
    .from("earnings")
    .select(
      "id, clip_id, participation_id, campaign_id, creator_id, billable_views, effective_cpm, amount, status, payout_id, accrued_at"
    )
    .in("campaign_id", campaignIds)
    .order("accrued_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as TreasuryEarning[];
}

async function loadPlatformTransactions(campaignIds: string[]): Promise<PlatformTransaction[]> {
  if (campaignIds.length === 0) return [];

  const { data, error } = await supabase
    .from("platform_transactions")
    .select("id, campaign_id, business_id, amount, fee_pct, type, created_at")
    .in("campaign_id", campaignIds)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as PlatformTransaction[];
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <span className="text-xs text-[var(--business-muted)]">{label}</span>
      <span className="text-xs font-semibold text-[var(--business-text)]">{value}</span>
    </div>
  );
}

function LoadingCard() {
  return (
    <BusinessGlassCard className="min-h-36">
      <div className="apple-skeleton h-3 w-24 rounded-full" />
      <div className="apple-skeleton mt-8 h-8 w-28 rounded-full" />
      <div className="apple-skeleton mt-4 h-3 w-32 rounded-full" />
    </BusinessGlassCard>
  );
}

export default function BusinessPaymentsPage() {
  const { t } = useTranslation();
  const {
    transactions,
    balances,
    loading: transactionsLoading,
    refresh: refreshTransactions,
  } = useTransactions();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [campaigns, setCampaigns] = useState<TreasuryCampaign[]>([]);
  const [clips, setClips] = useState<TreasuryClip[]>([]);
  const [earnings, setEarnings] = useState<TreasuryEarning[]>([]);
  const [platformTransactions, setPlatformTransactions] = useState<PlatformTransaction[]>([]);
  const [activeLedgerFilter, setActiveLedgerFilter] = useState<LedgerFilter>("all");
  const [treasuryError, setTreasuryError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setTreasuryError(null);
      const [profileRow, campaignsResult] = await Promise.all([
        getClientProfile(),
        getCampaignsAction(),
      ]);

      setProfile(profileRow);

      if (!campaignsResult.success || !campaignsResult.campaigns) {
        setCampaigns([]);
        setClips([]);
        setEarnings([]);
        setPlatformTransactions([]);
        if (campaignsResult.error) setTreasuryError(campaignsResult.error);
        return;
      }

      const campaignRows = campaignsResult.campaigns as TreasuryCampaign[];
      const campaignIds = campaignRows.map((campaign) => campaign.id);
      const [clipRows, earningRows, platformRows] = await Promise.all([
        loadTreasuryClips(campaignIds),
        loadTreasuryEarnings(campaignIds),
        loadPlatformTransactions(campaignIds),
      ]);

      setCampaigns(campaignRows);
      setClips(clipRows);
      setEarnings(earningRows);
      setPlatformTransactions(platformRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Treasury data failed to load.";
      console.error("Failed to load business treasury data:", error);
      setTreasuryError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial client hydration and realtime data load.
    setMounted(true);
    setLoading(true);
    loadData();

    const unsubscribeCampaigns = subscribeToCampaignChanges(() => {
      loadData();
    });

    const clipsChannel = supabase
      .channel("business-payments-clips")
      .on("postgres_changes", { event: "*", schema: "public", table: "clips" }, () => {
        loadData();
      })
      .subscribe();

    const earningsChannel = supabase
      .channel("business-payments-earnings")
      .on("postgres_changes", { event: "*", schema: "public", table: "earnings" }, () => {
        loadData();
      })
      .subscribe();

    const platformChannel = supabase
      .channel("business-payments-platform-transactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_transactions" }, () => {
        loadData();
      })
      .subscribe();

    const handleExternalRefresh = () => {
      loadData();
      refreshTransactions();
    };

    window.addEventListener("aether-transactions-update", handleExternalRefresh);
    window.addEventListener("aether-clips-update", handleExternalRefresh);
    window.addEventListener("campaigns-update", handleExternalRefresh);
    window.addEventListener("role-change", handleExternalRefresh);

    return () => {
      unsubscribeCampaigns();
      supabase.removeChannel(clipsChannel);
      supabase.removeChannel(earningsChannel);
      supabase.removeChannel(platformChannel);
      window.removeEventListener("aether-transactions-update", handleExternalRefresh);
      window.removeEventListener("aether-clips-update", handleExternalRefresh);
      window.removeEventListener("campaigns-update", handleExternalRefresh);
      window.removeEventListener("role-change", handleExternalRefresh);
    };
  }, [loadData, refreshTransactions]);

  const handleRefresh = async () => {
    setRefreshing(true);
    toast.loading(t("Refreshing treasury data..."), { id: "treasury-refresh" });
    try {
      refreshTransactions();
      await loadData();
      toast.success(t("Treasury data refreshed."), { id: "treasury-refresh" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Treasury refresh failed."), {
        id: "treasury-refresh",
      });
    } finally {
      setRefreshing(false);
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

  const campaignById = useMemo(() => {
    return new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  }, [campaigns]);

  const treasury = useMemo(() => {
    const performanceCampaigns = campaigns.filter((campaign) => campaign.campaign_type === "performance");
    const fixedFeeCampaigns = campaigns.filter((campaign) => (campaign.campaign_type ?? "fixed") === "fixed");
    const verifiedClips = clips.filter((clip) => VERIFIED_CLIP_STATUSES.has(clip.status));
    const verifiedViews = verifiedClips.reduce(
      (sum, clip) => sum + numberValue(clip.current_views ?? clip.counted_views),
      0
    );
    const activeCreators = new Set(
      verifiedClips.map((clip) => clip.creator_id).filter(Boolean)
    ).size;

    const usages = performanceCampaigns.map(campaignUsage);
    const fundedPool = usages.reduce((sum, usage) => sum + usage.totalFunded, 0);
    const creatorPool = usages.reduce((sum, usage) => sum + usage.pool, 0);
    const reservedPool = usages.reduce((sum, usage) => sum + usage.reserved, 0);
    const paidPool = usages.reduce((sum, usage) => sum + usage.paid, 0);
    const platformFeeFromCampaigns = usages.reduce((sum, usage) => sum + usage.platformFee, 0);
    const platformFeeBooked = platformTransactions.reduce(
      (sum, row) => sum + numberValue(row.amount),
      0
    );
    const platformFees = Math.max(platformFeeFromCampaigns, platformFeeBooked);
    const usedPool = reservedPool + paidPool;
    const remainingPool = Math.max(creatorPool - usedPool, 0);
    const usedPct = creatorPool > 0 ? Math.min((usedPool / creatorPool) * 100, 100) : 0;

    const earningsByStatus = earnings.reduce(
      (acc, earning) => {
        if (earning.status === "accrued") acc.accrued += numberValue(earning.amount);
        else if (earning.status === "approved") acc.approved += numberValue(earning.amount);
        else if (earning.status === "paid") acc.paid += numberValue(earning.amount);
        else if (earning.status === "reversed") acc.reversed += numberValue(earning.amount);
        return acc;
      },
      { accrued: 0, approved: 0, paid: 0, reversed: 0 }
    );
    const pendingEarnings = earningsByStatus.accrued + earningsByStatus.approved;
    const reservedDrift = Math.abs(pendingEarnings - reservedPool);

    return {
      activeCreators,
      creatorPool,
      earningsByStatus,
      fixedFeeCampaigns,
      fundedPool,
      paidPool,
      pendingEarnings,
      performanceCampaigns,
      platformFeeBooked,
      platformFees,
      remainingPool,
      reservedDrift,
      reservedPool,
      usedPct,
      usedPool,
      verifiedClips,
      verifiedViews,
    };
  }, [campaigns, clips, earnings, platformTransactions]);

  const ledgerRows = useMemo<LedgerRow[]>(() => {
    const rows: LedgerRow[] = [];

    for (const campaign of treasury.performanceCampaigns) {
      if (!campaign.funded_at) continue;
      const usage = campaignUsage(campaign);
      rows.push({
        id: `funding-${campaign.id}`,
        kind: "funding",
        title: "Budget pool funded",
        subtitle: campaign.title,
        amount: usage.totalFunded,
        status: campaign.funding_payment_intent_id ? "Stripe confirmed" : "Funded",
        date: formatDate(campaign.funded_at),
        timestamp: new Date(campaign.funded_at).getTime(),
        tone: "success",
        icon: Wallet,
        href: `/campaigns/${campaign.id}`,
      });
    }

    for (const platformTransaction of platformTransactions) {
      const campaign = campaignById.get(platformTransaction.campaign_id);
      rows.push({
        id: `fee-${platformTransaction.id}`,
        kind: "fees",
        title: "Platform fee booked",
        subtitle: campaign?.title ?? "Performance pool",
        amount: -Math.abs(numberValue(platformTransaction.amount)),
        status: `${Math.round(numberValue(platformTransaction.fee_pct) * 100)}% fee`,
        date: formatDate(platformTransaction.created_at),
        timestamp: new Date(platformTransaction.created_at).getTime(),
        tone: "info",
        icon: CircleDollarSign,
        href: campaign ? `/campaigns/${campaign.id}` : undefined,
      });
    }

    for (const earning of earnings) {
      const campaign = campaignById.get(earning.campaign_id);
      rows.push({
        id: `earning-${earning.id}`,
        kind: "earnings",
        title: earning.status === "paid" ? "Creator earnings paid" : "Creator earnings reserved",
        subtitle: `${campaign?.title ?? "Campaign"} - ${compactNumber(numberValue(earning.billable_views))} views`,
        amount: -Math.abs(numberValue(earning.amount)),
        status: statusLabel(earning.status),
        date: formatDate(earning.accrued_at),
        timestamp: new Date(earning.accrued_at).getTime(),
        tone: earningTone(earning.status),
        icon: TrendingUp,
        href: campaign ? `/campaigns/${campaign.id}` : undefined,
      });
    }

    for (const transaction of transactions) {
      rows.push({
        id: `tx-${transaction.id}`,
        kind: "legacy",
        title: transactionLabel(transaction.type),
        subtitle: transaction.campaignTitle ?? "Legacy transaction",
        amount: transactionAmount(transaction.type, numberValue(transaction.amount)),
        status: statusLabel(transaction.status),
        date: formatDate(transaction.created_at),
        timestamp: new Date(transaction.created_at).getTime(),
        tone: transactionTone(transaction.status),
        icon: DollarSign,
        href: "/business/campaigns",
      });
    }

    return rows
      .filter((row) => Number.isFinite(row.timestamp))
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [campaignById, earnings, platformTransactions, transactions, treasury.performanceCampaigns]);

  const filteredLedgerRows = useMemo(() => {
    if (activeLedgerFilter === "all") return ledgerRows;
    return ledgerRows.filter((row) => row.kind === activeLedgerFilter);
  }, [activeLedgerFilter, ledgerRows]);

  const movementChart = useMemo(() => {
    const now = new Date();
    const starts = Array.from({ length: 6 }, (_, index) => {
      return new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    });
    const rows = new Map(
      starts.map((date) => [
        monthKey(date),
        {
          month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date),
          funding: 0,
          reserved: 0,
          fees: 0,
        },
      ])
    );

    for (const row of ledgerRows) {
      const key = monthKey(new Date(row.timestamp));
      const chartRow = rows.get(key);
      if (!chartRow) continue;
      if (row.kind === "funding") chartRow.funding += Math.abs(row.amount);
      if (row.kind === "earnings") chartRow.reserved += Math.abs(row.amount);
      if (row.kind === "fees") chartRow.fees += Math.abs(row.amount);
    }

    return Array.from(rows.values());
  }, [ledgerRows]);

  const isStripeConnected = !!profile?.stripe_connect_id && !!profile?.stripe_onboarding_completed;
  const isLoading = loading || transactionsLoading;
  const hasCampaigns = campaigns.length > 0;
  const hasPerformanceCampaigns = treasury.performanceCampaigns.length > 0;
  const ledgerSyncTone: BusinessTone =
    treasury.performanceCampaigns.length === 0
      ? "neutral"
      : treasury.reservedDrift > 1
        ? "warning"
        : "success";
  const ledgerSyncLabel =
    ledgerSyncTone === "warning"
      ? `Review ${money(treasury.reservedDrift, 2)} drift`
      : ledgerSyncTone === "success"
        ? "Rollups aligned"
        : "No performance ledger";

  if (!mounted) return null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <BusinessSectionHeader
        eyebrow={t("Treasury")}
        title={t("Budget pools and ledger")}
        description={t("Track funded campaign pools, creator earning reserves, paid performance spend, platform fees, and legacy escrow movements.")}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <BusinessActionButton
              variant="secondary"
              onClick={handleRefresh}
              disabled={refreshing}
              icon={RefreshCw}
              className={refreshing ? "[&_svg]:animate-spin" : undefined}
            >
              {t("Refresh")}
            </BusinessActionButton>
            <BusinessActionButton href="/business/campaigns/new" icon={Plus}>
              {t("Fund Campaign")}
            </BusinessActionButton>
          </div>
        }
      />

      {treasuryError ? (
        <BusinessGlassCard variant="elevated" className="border-[rgba(248,113,113,0.25)]">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--business-danger)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--business-text)]">{t("Treasury sync issue")}</p>
              <p className="mt-1 text-sm text-[var(--business-muted)]">{treasuryError}</p>
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
                  {t("Stripe funding is not connected")}
                </p>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--business-muted)]">
                  {t("Connect Stripe to fund performance pools and keep treasury actions available from the business workspace.")}
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
            <LoadingCard key={item} />
          ))}
        </div>
      ) : !hasCampaigns ? (
        <BusinessEmptyState
          icon={Wallet}
          title={t("No treasury activity yet")}
          description={t("Create and fund a performance campaign to see budget pools, creator reserves, paid spend, and ledger history here.")}
          actionHref="/business/campaigns/new"
          actionLabel={t("Create Campaign")}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <BusinessMetricCard
              label={t("Funded pool")}
              value={money(treasury.fundedPool)}
              detail={`${money(treasury.creatorPool)} ${t("creator-available")}`}
              trend={`${treasury.performanceCampaigns.length} ${t("performance campaigns")}`}
              icon={Wallet}
              tone="accent"
            />
            <BusinessMetricCard
              label={t("Remaining pool")}
              value={money(treasury.remainingPool)}
              detail={`${Math.round(100 - treasury.usedPct)}% ${t("remaining")}`}
              trend={`${Math.round(treasury.usedPct)}% ${t("used")}`}
              icon={CircleDollarSign}
              tone={treasury.usedPct >= 90 ? "warning" : "success"}
            />
            <BusinessMetricCard
              label={t("Reserved earnings")}
              value={money(treasury.reservedPool)}
              detail={`${money(treasury.earningsByStatus.approved, 2)} ${t("approved")}`}
              trend={`${money(treasury.earningsByStatus.accrued, 2)} ${t("holdback")}`}
              icon={Clock}
              tone="warning"
            />
            <BusinessMetricCard
              label={t("Paid to creators")}
              value={money(treasury.paidPool)}
              detail={`${money(treasury.platformFees, 2)} ${t("platform fees")}`}
              trend={`${compactNumber(treasury.verifiedViews)} ${t("verified views")}`}
              icon={CheckCircle2}
              tone="success"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <BusinessGlassCard variant="elevated" className="overflow-hidden">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                      {t("Pool utilization")}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-normal text-[var(--business-text)]">
                      {money(treasury.usedPool)} {t("committed")} / {money(treasury.creatorPool)}
                    </h2>
                  </div>
                  <BusinessStatusPill tone={treasury.usedPct >= 90 ? "warning" : "accent"}>
                    {Math.round(treasury.usedPct)}% {t("used")}
                  </BusinessStatusPill>
                </div>

                <div className="relative">
                  <div className="h-4 overflow-hidden rounded-full border border-white/10 bg-white/[0.06]">
                    <motion.div
                      className="h-full bg-[var(--business-success)]"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${treasury.creatorPool > 0 ? Math.min((treasury.paidPool / treasury.creatorPool) * 100, 100) : 0}%`,
                      }}
                      transition={{ type: "spring", stiffness: 120, damping: 22 }}
                    />
                    <motion.div
                      className="-mt-4 h-full bg-[var(--business-warning)]"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${treasury.creatorPool > 0 ? Math.min((treasury.reservedPool / treasury.creatorPool) * 100, 100) : 0}%`,
                      }}
                      transition={{ type: "spring", stiffness: 120, damping: 22, delay: 0.05 }}
                      style={{
                        marginLeft: `${treasury.creatorPool > 0 ? Math.min((treasury.paidPool / treasury.creatorPool) * 100, 100) : 0}%`,
                      }}
                    />
                  </div>
                  <span
                    className="absolute -top-1 -bottom-1 w-px bg-[var(--business-warning)]/70"
                    style={{ left: "90%" }}
                    aria-hidden="true"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <StatLine label={t("Paid")} value={money(treasury.paidPool, 2)} />
                  <StatLine label={t("Reserved")} value={money(treasury.reservedPool, 2)} />
                  <StatLine label={t("Remaining")} value={money(treasury.remainingPool, 2)} />
                  <StatLine label={t("Platform fees")} value={money(treasury.platformFees, 2)} />
                </div>
              </div>
            </BusinessGlassCard>

            <BusinessGlassCard variant="elevated">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                    {t("Treasury health")}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-normal text-[var(--business-text)]">
                    {isStripeConnected ? t("Stripe ready") : t("Stripe pending")}
                  </h2>
                </div>
                <BusinessStatusPill tone={isStripeConnected ? "success" : "warning"}>
                  {isStripeConnected ? t("Connected") : t("Action needed")}
                </BusinessStatusPill>
              </div>
              <div className="mt-5 space-y-3">
                <StatLine
                  label={t("Active pools")}
                  value={treasury.performanceCampaigns.filter((campaign) => ACTIVE_CAMPAIGN_STATUSES.has(campaign.status)).length.toLocaleString()}
                />
                <StatLine
                  label={t("Creator count")}
                  value={treasury.activeCreators.toLocaleString()}
                />
                <StatLine
                  label={t("Fixed-fee pending")}
                  value={money(balances.pending, 2)}
                />
                <StatLine
                  label={t("Rollup check")}
                  value={ledgerSyncLabel}
                />
              </div>
            </BusinessGlassCard>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.82fr)]">
            <BusinessGlassCard variant="elevated">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                    {t("Performance pools")}
                  </p>
                  <h2 className="mt-2 text-lg font-semibold tracking-normal text-[var(--business-text)]">
                    {t("Campaign budget burn-down")}
                  </h2>
                </div>
                <BusinessActionButton href="/business/campaigns" variant="secondary" size="sm" trailingIcon={ArrowRight}>
                  {t("Campaigns")}
                </BusinessActionButton>
              </div>

              {!hasPerformanceCampaigns ? (
                <BusinessEmptyState
                  icon={Zap}
                  title={t("No performance pools")}
                  description={t("Fixed-fee campaigns can still appear in legacy transactions; funded performance pools will appear here.")}
                  actionHref="/business/campaigns/new"
                  actionLabel={t("Create Pool")}
                  className="min-h-72"
                />
              ) : (
                <div className="space-y-3">
                  {treasury.performanceCampaigns.slice(0, 7).map((campaign) => {
                    const usage = campaignUsage(campaign);
                    const rate = rewardRate(campaign);
                    return (
                      <Link
                        key={campaign.id}
                        href={`/campaigns/${campaign.id}`}
                        className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <BusinessStatusPill tone={campaignTone(campaign.status)}>
                                {statusLabel(campaign.status)}
                              </BusinessStatusPill>
                              <BusinessStatusPill tone="info">{campaignTypeLabel(campaign)}</BusinessStatusPill>
                              {campaign.funded_at ? (
                                <BusinessStatusPill tone="success">{t("Funded")}</BusinessStatusPill>
                              ) : (
                                <BusinessStatusPill tone="warning">{t("Unfunded")}</BusinessStatusPill>
                              )}
                            </div>
                            <h3 className="truncate text-sm font-semibold text-[var(--business-text)]">
                              {campaign.title}
                            </h3>
                            <p className="mt-1 text-xs text-[var(--business-muted)]">
                              {rate > 0 ? `${money(rate, 2)} RPM` : t("No RPM set")} - {formatDate(campaign.funded_at ?? campaign.created_at)}
                            </p>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-right text-xs sm:min-w-64">
                            <div>
                              <p className="font-semibold text-[var(--business-text)]">{money(usage.remaining)}</p>
                              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--business-muted)]">
                                {t("left")}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold text-[var(--business-text)]">{money(usage.reserved)}</p>
                              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--business-muted)]">
                                {t("reserved")}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold text-[var(--business-text)]">{money(usage.paid)}</p>
                              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--business-muted)]">
                                {t("paid")}
                              </p>
                            </div>
                          </div>
                        </div>
                        <BusinessProgressBar
                          className="mt-4"
                          value={usage.used}
                          max={usage.pool}
                          label={`${money(usage.used, 2)} / ${money(usage.pool, 2)}`}
                          tone={usage.pct >= 0.9 ? "warning" : "accent"}
                        />
                      </Link>
                    );
                  })}
                </div>
              )}
            </BusinessGlassCard>

            <BusinessGlassCard variant="elevated">
              <div className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Monthly movement")}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-normal text-[var(--business-text)]">
                  {t("Funding, fees, and reserves")}
                </h2>
              </div>

              <div className="space-y-4">
                {movementChart.map((row) => {
                  const max = Math.max(row.funding, row.reserved, row.fees, 1);
                  return (
                    <div key={row.month} className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3">
                      <span className="text-xs font-semibold text-[var(--business-muted)]">{row.month}</span>
                      <div className="space-y-1.5">
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            className="h-full rounded-full bg-[var(--business-primary)]"
                            style={{ width: `${(row.funding / max) * 100}%` }}
                          />
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            className="h-full rounded-full bg-[var(--business-warning)]"
                            style={{ width: `${(row.reserved / max) * 100}%` }}
                          />
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            className="h-full rounded-full bg-[var(--business-secondary)]"
                            style={{ width: `${(row.fees / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--business-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[var(--business-primary)]" /> {t("Funding")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[var(--business-warning)]" /> {t("Reserves")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-[var(--business-secondary)]" /> {t("Fees")}
                </span>
              </div>
            </BusinessGlassCard>
          </div>

          <BusinessGlassCard variant="elevated">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Ledger")}
                </p>
                <h2 className="mt-2 text-lg font-semibold tracking-normal text-[var(--business-text)]">
                  {t("Recent treasury movements")}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {ledgerFilters.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setActiveLedgerFilter(filter.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
                      activeLedgerFilter === filter.id
                        ? "border-[rgba(173,198,255,0.30)] bg-[rgba(173,198,255,0.12)] text-[var(--business-primary)]"
                        : "border-white/10 bg-white/[0.04] text-[var(--business-muted)] hover:text-[var(--business-text)]"
                    )}
                  >
                    {t(filter.label)}
                  </button>
                ))}
              </div>
            </div>

            {filteredLedgerRows.length === 0 ? (
              <BusinessEmptyState
                icon={Layers}
                title={t("No ledger rows in this view")}
                description={t("Funding, creator reserves, fees, and fixed-fee movements will appear here as they are recorded.")}
                className="min-h-72"
              />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-white/10">
                <div className="hidden grid-cols-[1.25fr_1fr_120px_128px] gap-4 border-b border-white/10 bg-white/[0.04] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)] md:grid">
                  <span>{t("Movement")}</span>
                  <span>{t("Status")}</span>
                  <span className="text-right">{t("Amount")}</span>
                  <span className="text-right">{t("Date")}</span>
                </div>
                <div className="divide-y divide-white/10">
                  {filteredLedgerRows.slice(0, 16).map((row) => (
                    <Link
                      key={row.id}
                      href={row.href ?? "/business/payments"}
                      className="grid gap-3 px-4 py-4 transition-colors hover:bg-white/[0.04] md:grid-cols-[1.25fr_1fr_120px_128px] md:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[var(--business-primary)]">
                          <row.icon size={17} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--business-text)]">{row.title}</p>
                          <p className="mt-1 truncate text-xs text-[var(--business-muted)]">{row.subtitle}</p>
                        </div>
                      </div>
                      <div>
                        <BusinessStatusPill tone={row.tone}>{t(row.status)}</BusinessStatusPill>
                      </div>
                      <p
                        className={cn(
                          "text-sm font-semibold md:text-right",
                          row.amount < 0 ? "text-[var(--business-danger)]" : "text-[var(--business-success)]"
                        )}
                      >
                        {row.amount < 0 ? "-" : "+"}
                        {money(Math.abs(row.amount), 2)}
                      </p>
                      <p className="text-xs text-[var(--business-muted)] md:text-right">{row.date}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </BusinessGlassCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BusinessGlassCard variant="elevated">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                    {t("Creator demand")}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--business-text)]">
                    {treasury.verifiedClips.length.toLocaleString()} {t("verified clips")}
                  </h3>
                </div>
                <Eye size={18} className="text-[var(--business-primary)]" />
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--business-muted)]">
                {compactNumber(treasury.verifiedViews)} {t("views are currently tied to approved or tracking submissions.")}
              </p>
            </BusinessGlassCard>

            <BusinessGlassCard variant="elevated">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                    {t("Legacy fixed-fee")}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--business-text)]">
                    {money(balances.available, 2)}
                  </h3>
                </div>
                <DollarSign size={18} className="text-[var(--business-primary)]" />
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--business-muted)]">
                {treasury.fixedFeeCampaigns.length} {t("fixed-fee campaigns")} - {money(balances.pending, 2)} {t("pending fixed-fee escrow")}
              </p>
            </BusinessGlassCard>

            <BusinessGlassCard variant="elevated">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                    {t("Reconciliation")}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-[var(--business-text)]">
                    {ledgerSyncLabel}
                  </h3>
                </div>
                {ledgerSyncTone === "warning" ? (
                  <AlertTriangle size={18} className="text-[var(--business-warning)]" />
                ) : (
                  <CheckCircle2 size={18} className="text-[var(--business-success)]" />
                )}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--business-muted)]">
                {money(treasury.pendingEarnings, 2)} {t("earnings pending payout")} - {money(treasury.earningsByStatus.reversed, 2)} {t("reversed")}
              </p>
            </BusinessGlassCard>
          </div>
        </>
      )}
    </div>
  );
}
