"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  FileText,
  Lock,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Wallet,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import {
  CreatorActionButton,
  CreatorGlassCard,
  CreatorMetricCard,
  CreatorPageShell,
  CreatorSectionHeader,
  CreatorStatusPill,
} from "@/components/creator/creator-ui";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api/client";
import { startStripeOnboardingAction } from "@/lib/stripe/actions";
import { getClientProfile, supabase } from "@/lib/supabase/client";
import { useCreatorClips, useCreatorEarnings } from "@/lib/supabase/clips";
import { usePosts, useTransactions } from "@/lib/supabase/metrics";
import { useTranslation } from "@/lib/translations";
import type { CreatorDashboardInitialData } from "@/lib/supabase/dashboard-initial";
import type { Profile } from "@/types";
import { formatMoneyCompact } from "@/lib/currency";

function currency(value: number) {
  return formatMoneyCompact(value);
}

function compact(value: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function CreatorDashboardClient({
  initialData,
}: {
  initialData: CreatorDashboardInitialData | null;
}) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  // Server-fetched profile paints immediately; loadAll still refreshes it.
  const [user, setUser] = useState<Profile | null>(initialData?.profile ?? null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  const { transactions, refresh: refreshTransactions } = useTransactions();
  const { posts, aggregateMetrics, refresh: refreshPosts } = usePosts();
  const { clips } = useCreatorClips();
  const { breakdown, payouts } = useCreatorEarnings();

  const loadUser = async () => {
    try {
      const profile = await getClientProfile();
      setUser(profile);
    } catch (error) {
      console.error(error);
    }
  };

  const loadAll = useCallback(async () => {
    await loadUser();
    refreshTransactions();
    refreshPosts();
  }, [refreshPosts, refreshTransactions]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client mount guard + fetch-on-mount
    setMounted(true);
    loadAll();

    const handleProfileUpdate = () => {
      loadAll();
    };
    window.addEventListener("role-change", handleProfileUpdate);
    window.addEventListener("aether-metrics-update", handleProfileUpdate);
    window.addEventListener("aether-transactions-update", handleProfileUpdate);
    window.addEventListener("aether-posts-update", handleProfileUpdate);

    return () => {
      window.removeEventListener("role-change", handleProfileUpdate);
      window.removeEventListener("aether-metrics-update", handleProfileUpdate);
      window.removeEventListener("aether-transactions-update", handleProfileUpdate);
      window.removeEventListener("aether-posts-update", handleProfileUpdate);
    };
  }, [loadAll]);

  const handleRefreshMetrics = async () => {
    if (!user) return;
    setIsRefreshing(true);
    toast.loading(t("Syncing live creator metrics..."), { id: "refresh-metrics" });

    try {
      const { data: postsData } = await supabase
        .from("posts")
        .select("post_url, platform, participation_id, participations!inner(influencer_id)")
        .eq("participations.influencer_id", user.user_id);

      if (!postsData || postsData.length === 0) {
        toast.success(t("No live content URLs submitted yet."), { id: "refresh-metrics" });
        return;
      }

      let successCount = 0;
      for (const post of postsData) {
        try {
          const data = await apiPost<{ success: boolean }>("/api/metrics/fetch", {
            post_url: post.post_url,
            platform: post.platform,
            participation_id: post.participation_id,
          });
          if (data.success) successCount++;
        } catch (error) {
          console.error("Failed to refresh influencer post:", post.post_url, error);
        }
      }

      toast.success(`${t("Refreshed metrics for")} ${successCount}/${postsData.length} ${t("live posts successfully!")}`, {
        id: "refresh-metrics",
      });
      refreshPosts();
      refreshTransactions();
    } catch (error) {
      toast.error(t("Failed to refresh metrics: ") + (error instanceof Error ? error.message : ""), {
        id: "refresh-metrics",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleOnboardStripe = async () => {
    setOnboardingLoading(true);
    toast.loading(t("Redirecting to Stripe Connect onboarding..."), { id: "stripe-onboard" });

    try {
      const origin = window.location.origin;
      const res = await startStripeOnboardingAction("influencer", origin);

      if (res.success && res.url) {
        toast.success(t("Redirecting..."), { id: "stripe-onboard" });
        window.location.href = res.url;
      } else {
        toast.error(res.error || t("Failed to generate onboarding session."), { id: "stripe-onboard" });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("An error occurred connecting to Stripe."), {
        id: "stripe-onboard",
      });
    } finally {
      setOnboardingLoading(false);
    }
  };

  const totalLiveViews = clips
    .filter((clip) => clip.status === "tracking")
    .reduce((sum, clip) => sum + clip.current_views, 0);
  const totalClipEarnings = breakdown.readyForPayout + breakdown.inHoldback + breakdown.paid;
  const totalFixedEarnings = transactions
    .filter((tx) => tx.type === "release" && tx.status === "succeeded")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const activeContractsCount = useMemo(() => {
    const activeParticipationIds = new Set(
      posts.map((post) => post.participation_id).filter(Boolean)
    );
    const activeClipCampaigns = new Set(clips.map((clip) => clip.campaign_id));
    return activeParticipationIds.size + activeClipCampaigns.size;
  }, [clips, posts]);
  const pendingApplicationsCount = transactions.filter((tx) => tx.status === "pending").length;
  const engagementRate = aggregateMetrics.engagement_rate || Number(user?.engagement_rate ?? 0);
  const isStripeConnected = !!user?.stripe_connect_id && !!user?.stripe_onboarding_completed;

  const activity = [
    ...clips.slice(0, 3).map((clip) => ({
      id: `clip-${clip.id}`,
      icon: Eye,
      tone: "accent" as const,
      title: clip.status === "tracking" ? t("Clip tracking live") : t("Clip submitted"),
      subtitle: clip.campaignTitle,
      meta: `${clip.current_views.toLocaleString()} views`,
      badge: clip.status,
    })),
    ...payouts.slice(0, 2).map((payout) => ({
      id: `payout-${payout.id}`,
      icon: Wallet,
      tone: "success" as const,
      title: t("Payout requested"),
      subtitle: new Date(payout.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      meta: currency(Number(payout.amount)),
      badge: payout.status,
    })),
    ...posts.slice(0, 2).map((post) => ({
      id: `post-${post.id}`,
      icon: FileText,
      tone: "violet" as const,
      title: t("Deliverable synced"),
      subtitle: post.campaignTitle || t("Campaign Collab"),
      meta: post.platform,
      badge: post.approved_at ? t("Approved") : t("Submitted"),
    })),
  ].slice(0, 5);

  if (!mounted) return null;

  return (
    <CreatorPageShell>
      <CreatorSectionHeader
        eyebrow={t("Aether Creator Hub")}
        title={user?.full_name ? `${user.full_name.split(" ")[0]}'s CreatorHub` : t("CreatorHub")}
        description={t("Track creator contracts, campaign matches, view-verified earnings, and payout readiness in one place.")}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={handleRefreshMetrics}
              disabled={isRefreshing}
              className="creator-glass h-10 rounded-xl border-white/10 bg-white/[0.05] px-4 text-xs font-semibold text-white hover:bg-white/[0.08]"
            >
              <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
              {t("Refresh Metrics")}
            </Button>
            {isStripeConnected ? (
              <CreatorStatusPill tone="success" className="h-10 justify-center px-3">
                <CheckCircle2 size={13} />
                Stripe Verified
              </CreatorStatusPill>
            ) : (
              <Button
                onClick={handleOnboardStripe}
                disabled={onboardingLoading}
                className="creator-gradient-accent h-10 rounded-xl border-0 px-4 text-xs font-semibold text-white hover:brightness-105"
              >
                <Lock size={14} />
                {t("Setup Payouts")}
              </Button>
            )}
          </div>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26, mass: 0.8 }}
        className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3"
      >
        <CreatorMetricCard
          label={t("Active contracts")}
          value={activeContractsCount.toString()}
          icon={FileText}
          detail={t("Live posts and joined clipping campaigns")}
          tone="accent"
        />
        <CreatorMetricCard
          label={t("Pending applications")}
          value={pendingApplicationsCount.toString()}
          icon={Workflow}
          detail={t("Awaiting brand or payout movement")}
          tone="violet"
        />
        <CreatorMetricCard
          label={t("Creator earnings")}
          value={currency(totalClipEarnings + totalFixedEarnings)}
          icon={DollarSign}
          detail={`${currency(breakdown.readyForPayout)} ${t("ready")}`}
          tone="cyan"
        />
      </motion.div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="space-y-4">
          <CreatorGlassCard className="p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <CreatorActionButton href="/creator/discover" className="min-h-14 justify-center">
                <Sparkles size={16} />
                {t("Discover Campaigns")}
              </CreatorActionButton>
              <CreatorActionButton href="/creator/campaigns" variant="secondary" className="min-h-14 justify-center">
                <TrendingUp size={16} className="text-[var(--creator-violet)]" />
                {t("View Active Campaigns")}
              </CreatorActionButton>
            </div>
          </CreatorGlassCard>

          <CreatorGlassCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="creator-label text-white/40">{t("Recent activity")}</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">
                  {t("Latest creator movement")}
                </h2>
              </div>
              <CreatorStatusPill tone="neutral">{activity.length} live</CreatorStatusPill>
            </div>
            <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5">
              {activity.length === 0 ? (
                <div className="p-6 text-sm text-white/45">
                  {t("No creator activity yet. Join a campaign or submit a clip to start building your feed.")}
                </div>
              ) : (
                activity.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.id} className="flex gap-3.5 p-4 transition-colors hover:bg-white/[0.025]">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[var(--creator-primary)]">
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="truncate text-sm font-semibold text-white">{item.title}</h3>
                          <span className="shrink-0 text-[10px] font-semibold text-white/35">{item.meta}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-white/55">{item.subtitle}</p>
                        <CreatorStatusPill tone={item.tone} className="mt-2">
                          {String(item.badge).replaceAll("_", " ")}
                        </CreatorStatusPill>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CreatorGlassCard>
        </div>

        <div className="space-y-4">
          <CreatorGlassCard>
            <p className="creator-label text-white/40">{t("Performance pulse")}</p>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-white/45">{t("Live tracked views")}</p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-white">
                      {compact(totalLiveViews)}
                    </p>
                  </div>
                  <Eye className="text-[var(--creator-primary)]" size={22} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                    {t("Engagement")}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">{engagementRate.toFixed(1)}%</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                    {t("Holdback")}
                  </p>
                  <p className="mt-2 text-xl font-semibold text-white">{currency(breakdown.inHoldback)}</p>
                </div>
              </div>
            </div>
          </CreatorGlassCard>

          <CreatorGlassCard>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="creator-label text-white/40">{t("Payout status")}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{currency(breakdown.readyForPayout)}</h2>
              </div>
              <Wallet size={22} className="text-[var(--creator-success)]" />
            </div>
            <div className="mt-4 space-y-2 text-xs text-white/55">
              <div className="flex items-center justify-between">
                <span>{t("In holdback")}</span>
                <span className="font-semibold text-white">{currency(breakdown.inHoldback)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{t("Paid out")}</span>
                <span className="font-semibold text-white">{currency(breakdown.paid)}</span>
              </div>
              <div className="flex items-center gap-2 border-t border-white/5 pt-3 text-[10px] leading-5">
                <Clock size={13} className="shrink-0 text-[var(--creator-warning)]" />
                <span>{t("Earnings clear after the holdback window, then become withdrawable from the UGC or clipping workspace.")}</span>
              </div>
            </div>
          </CreatorGlassCard>
        </div>
      </div>
    </CreatorPageShell>
  );
}
