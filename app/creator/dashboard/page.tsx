"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Bell,
  CheckCircle2,
  Lock,
  Wallet,
  Grid,
  BarChart3,
  Eye,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getClientProfile, supabase } from "@/lib/supabase/client";
import { startStripeOnboardingAction } from "@/lib/stripe/actions";
import WalletUI from "@/components/wallet-ui";
import { CreatorPerformanceSummary } from "@/components/creator-performance-summary";
import { CreatorWallet } from "@/components/creator-wallet";
import { ReferFriendCard } from "@/components/refer-friend-card";
import { WeeklyChallengeWidget } from "@/components/weekly-challenge-widget";
import { GettingStartedChecklist } from "@/components/getting-started-checklist";
import { useFeatureFlags } from "@/lib/use-feature-flags";
import { Profile } from "@/types";
import { useTransactions, usePosts } from "@/lib/supabase/metrics";
import { useTranslation } from "@/lib/translations";
import { RefreshCw } from "lucide-react";
import { apiPost } from "@/lib/api/client";

export default function InfluencerDashboard() {
  const { t } = useTranslation();
  const flags = useFeatureFlags();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "trends" | "wallet">("overview");
  const [showLegacy, setShowLegacy] = useState(false);
  const [user, setUser] = useState<Profile | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const { transactions, refresh: refreshTransactions } = useTransactions();
  const { posts, aggregateMetrics, refresh: refreshPosts } = usePosts();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshMetrics = async () => {
    if (!user) return;
    setIsRefreshing(true);
    toast.loading(t("Syncing live creator metrics..."), { id: "refresh-metrics" });

    try {
      {
        // Query the creator's posts and sync live metrics.
        const { data: postsData } = await supabase
          .from("posts")
          .select("post_url, platform, participation_id, participations!inner(influencer_id)")
          .eq("participations.influencer_id", user.user_id);

        if (!postsData || postsData.length === 0) {
          toast.success(t("No live content URLs submitted yet."), { id: "refresh-metrics" });
          setIsRefreshing(false);
          return;
        }

        let successCount = 0;
        for (const post of postsData) {
          try {
            const data = await apiPost<{ success: boolean }>(
              "/api/metrics/fetch",
              {
                post_url: post.post_url,
                platform: post.platform,
                participation_id: post.participation_id,
              }
            );
            if (data.success) successCount++;
          } catch (e) {
            console.error("Failed to refresh influencer post:", post.post_url, e);
          }
        }

        toast.success(`${t("Refreshed metrics for")} ${successCount}/${postsData.length} ${t("live posts successfully!")}`, { id: "refresh-metrics" });
      }

      // Reload UI data
      refreshPosts();
      refreshTransactions();

    } catch (err) {
      toast.error(t("Failed to refresh metrics: ") + (err instanceof Error ? err.message : ""), { id: "refresh-metrics" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadUser = async () => {
    try {
      const p = await getClientProfile();
      setUser(p);
    } catch (e) {
      console.error(e);
    }
  };

  const loadAll = useCallback(async () => {
    await loadUser();
    refreshTransactions();
    refreshPosts();
  }, [refreshTransactions, refreshPosts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client mount guard + fetch-on-mount
    setMounted(true);
    loadAll();

    // Listen to profile updates (like Stripe callbacks)
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

  const handleOnboardStripe = async () => {
    setOnboardingLoading(true);
    toast.loading("Redirecting to Stripe Connect onboarding...", {
      id: "stripe-onboard",
    });

    try {
      const origin = window.location.origin;
      const res = await startStripeOnboardingAction("influencer", origin);

      if (res.success && res.url) {
        toast.success("Redirecting...", { id: "stripe-onboard" });
        window.location.href = res.url;
      } else {
        toast.error(res.error || "Failed to generate onboarding session.", { id: "stripe-onboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "An error occurred connecting to Stripe.", { id: "stripe-onboard" });
    } finally {
      setOnboardingLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 260,
        damping: 25
      }
    }
  };

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

  // Dynamic earnings aggregator
  const getEarningsChartData = () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    const monthlyEarnings: Record<string, number> = { Jan: 0, Feb: 0, Mar: 0, Apr: 0, May: 0, Jun: 0 };

    transactions.forEach((tx) => {
      if (tx.status !== "succeeded") return;
      if (tx.type !== "release") return;
      
      const date = new Date(tx.created_at);
      const mName = months[date.getMonth()];
      
      if (monthlyEarnings[mName] !== undefined) {
        monthlyEarnings[mName] += tx.amount;
      }
    });

    return months.map(m => ({
      month: m,
      earnings: monthlyEarnings[m]
    }));
  };

  const earningsData = getEarningsChartData();
  const totalEarnings = transactions.filter(t => t.type === "release" && t.status === "succeeded").reduce((sum, t) => sum + t.amount, 0);
  const engagementRate = aggregateMetrics.engagement_rate || user?.engagement_rate || 0;

  const isStripeConnected = !!user?.stripe_connect_id && !!user?.stripe_onboarding_completed;

  if (!mounted) return null;

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 md:py-16">
      {/* Header and Connect Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10">
        <div>
          <span className="text-xs font-semibold text-[#34C759] uppercase tracking-wider block mb-1.5">
            {t("Aether Creator Hub")}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {user?.full_name ? `${user.full_name.split(" ")[0]}'s ${t("Creator Hub")}` : t("Creator Hub")}
          </h1>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            onClick={handleRefreshMetrics}
            disabled={isRefreshing}
            variant="outline"
            className="rounded-full px-5 py-6 font-semibold border-border bg-card hover:bg-secondary/45 active:scale-[0.98] transition-transform cursor-pointer gap-2 text-foreground h-auto"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            {t("Refresh Metrics")}
          </Button>

          {isStripeConnected ? (
            <div className="bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/30 rounded-full px-5 py-3 flex items-center gap-2 text-xs font-bold select-none h-auto">
              <CheckCircle2 size={14} /> Stripe Connect Verified
            </div>
          ) : (
            <Button 
              onClick={handleOnboardStripe}
              disabled={onboardingLoading}
              className="rounded-full px-6 py-6 font-semibold bg-[#34C759] hover:bg-[#30b551] text-white hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer gap-2 border-0 shadow-md h-auto"
            >
              <Lock size={16} /> {t("Setup Stripe Payouts")}
            </Button>
          )}
        </div>
      </div>

      {/* Getting started — quick-win activation checklist (self-hides when done) */}
      <GettingStartedChecklist />

      {/* Creator wallet — balances + withdraw (most prominent) */}
      <div className="mb-8">
        <CreatorWallet />
      </div>

      {/* Virality — refer a friend + weekly challenge (feature-flag gated) */}
      {(flags.enable_referrals || flags.enable_challenges) && (
        <div id="refer-a-friend" className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 items-stretch">
          {flags.enable_referrals && <ReferFriendCard />}
          {flags.enable_challenges && <WeeklyChallengeWidget />}
        </div>
      )}

      {/* Performance clipping earnings + clips (new model) — primary content */}
      <CreatorPerformanceSummary />

      {/* Legacy profile overview + fixed-fee wallet/activity. Collapsed by
          default so performance clipping stays the primary focus. */}
      <button
        onClick={() => setShowLegacy((v) => !v)}
        className="w-full flex items-center gap-3 mb-6 group cursor-pointer"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 group-hover:text-foreground transition-colors flex items-center gap-1.5">
          <ChevronRight size={13} className={`transition-transform ${showLegacy ? "rotate-90" : ""}`} />
          {t("Profile & fixed-fee activity")}
          <span className="font-medium normal-case tracking-normal text-muted-foreground/50">{t("(legacy)")}</span>
        </span>
        <span className="h-px flex-1 bg-border/20" />
        <span className="text-[10px] font-semibold text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0">
          {showLegacy ? t("Hide") : t("Show")}
        </span>
      </button>

      {showLegacy && (
      <div className="rounded-3xl border border-border/15 bg-secondary/[0.04] p-4 sm:p-6">
      <p className="text-[11px] text-muted-foreground/60 mb-6 max-w-2xl leading-relaxed">
        {t("Your legacy profile analytics and fixed-fee wallet activity. Your performance clipping earnings live in the section above and on the Clips & Earnings page.")}
      </p>
      {/* Segmented Control / Apple Pill Tabs */}
      <div className="flex justify-center sm:justify-start mb-8">
        <div className="bg-secondary/40 border border-border/20 p-1.5 rounded-full flex gap-1 relative max-w-lg w-full sm:w-auto">
          {/* Active Tab Sliding Pill */}
          <div className="absolute inset-y-1.5 left-1.5 right-1.5 pointer-events-none">
            <motion.div
              layoutId="activeTabPill"
              className="bg-card shadow-sm border border-border/30 rounded-full h-full"
              initial={false}
              animate={{
                x: activeTab === "overview" ? "0%" : activeTab === "trends" ? "100%" : "200%",
                width: "33.33%"
              }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          </div>

          <button
            onClick={() => setActiveTab("overview")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-full relative z-10 transition-colors cursor-pointer select-none ${
              activeTab === "overview" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Grid size={13} />
            {t("Overview")}
          </button>

          <button
            onClick={() => setActiveTab("trends")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-full relative z-10 transition-colors cursor-pointer select-none ${
              activeTab === "trends" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 size={13} />
            {t("Analytics")}
          </button>
          
          <button
            onClick={() => setActiveTab("wallet")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-full relative z-10 transition-colors cursor-pointer select-none ${
              activeTab === "wallet" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wallet size={13} />
            {t("Wallet & Balance")}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "overview" ? (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={appleSpring}
            className="space-y-12"
          >
            {/* Grid Layout */}
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8"
            >
              {/* Metric Card 1: Followers */}
              <motion.div 
                variants={cardVariants}
                whileHover={{ y: -4, scale: 1.01 }}
                className="p-8 flex flex-col justify-between apple-card cursor-pointer"
              >
                <div className="flex justify-between items-start text-muted-foreground">
                  <span className="text-xs font-bold uppercase tracking-wider">{t("Audience Reach")}</span>
                  <span className="p-2.5 rounded-2xl bg-[#007AFF]/10 text-[#007AFF]"><Users size={16} /></span>
                </div>
                <div className="mt-6">
                  <h3 className="text-3xl font-bold tracking-tight">
                    {user?.followers ? user.followers.toLocaleString() : "—"}
                  </h3>
                </div>
              </motion.div>

              {/* Metric Card 2: Engagement */}
              <motion.div 
                variants={cardVariants}
                whileHover={{ y: -4, scale: 1.01 }}
                className="p-8 flex flex-col justify-between apple-card cursor-pointer"
              >
                <div className="flex justify-between items-start text-muted-foreground">
                  <span className="text-xs font-bold uppercase tracking-wider">{t("Engagement Rate")}</span>
                  <span className="p-2.5 rounded-2xl bg-[#34C759]/10 text-[#34C759]"><TrendingUp size={16} /></span>
                </div>
                <div className="mt-6">
                  <h3 className="text-3xl font-bold tracking-tight">{engagementRate.toFixed(1)}%</h3>
                  <span className="text-xs text-muted-foreground font-medium block mt-1.5">
                    {t("Benchmark average is 2.1%")}
                  </span>
                </div>
              </motion.div>

              {/* Metric Card 3: Earnings */}
              <motion.div 
                variants={cardVariants}
                whileHover={{ y: -4, scale: 1.01 }}
                onClick={() => setActiveTab("wallet")}
                className="p-8 flex flex-col justify-between apple-card cursor-pointer"
              >
                <div className="flex justify-between items-start text-muted-foreground">
                  <span className="text-xs font-bold uppercase tracking-wider">{t("Total Earnings")}</span>
                  <span className="p-2.5 rounded-2xl bg-[#FF9500]/10 text-[#FF9500]"><DollarSign size={16} /></span>
                </div>
                <div className="mt-6">
                  <h3 className="text-3xl font-bold tracking-tight">${totalEarnings.toLocaleString()}</h3>
                  <span className="text-xs text-muted-foreground font-medium block mt-1.5 hover:underline">
                    {t("Manage wallet & payouts")}
                  </span>
                </div>
              </motion.div>

              {/* Metric Card 4: Category */}
              <motion.div 
                variants={cardVariants}
                whileHover={{ y: -4, scale: 1.01 }}
                className="p-8 flex flex-col justify-between apple-card cursor-pointer"
              >
                <div className="flex justify-between items-start text-muted-foreground">
                  <span className="text-xs font-bold uppercase tracking-wider">{t("Creator Niche")}</span>
                  <span className="p-2.5 rounded-2xl bg-primary/10 text-primary"><Bell size={16} /></span>
                </div>
                <div className="mt-6">
                  <h3 className="text-3xl font-bold tracking-tight">{user?.niche || "—"}</h3>
                </div>
              </motion.div>
            </motion.div>

            {/* Large Modules */}
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              {/* Earnings Chart (spans full width in real mode, where the
                  legacy invites card beside it is hidden) */}
              <motion.div 
                variants={cardVariants}
                className="lg:col-span-3 p-8 apple-card flex flex-col justify-between min-h-[380px]"
              >
                <div>
                  <h2 className="text-xl font-bold tracking-tight mb-1">{t("Earnings Progress")}</h2>
                  <p className="text-xs text-muted-foreground mb-8">{t("Aggregate creator revenue generated inside Aether.")}</p>
                </div>
                <div className="flex-1 w-full h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={earningsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.4} />
                      <XAxis 
                        dataKey="month" 
                        stroke="var(--muted-foreground)" 
                        fontSize={11}
                        tickLine={false} 
                        axisLine={false} 
                      />
                      <YAxis 
                        stroke="var(--muted-foreground)" 
                        fontSize={11}
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(value) => `$${value}`} 
                      />
                      <Tooltip 
                        contentStyle={{ 
                          borderRadius: "16px", 
                          background: "var(--card)", 
                          border: "1px solid var(--border)", 
                          color: "var(--foreground)" 
                        }} 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="earnings" 
                        stroke="var(--primary)" 
                        strokeWidth={2.5}
                        fillOpacity={1} 
                        fill="url(#colorEarnings)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </motion.div>

            </motion.div>

          </motion.div>
        ) : activeTab === "trends" ? (
          <motion.div
            key="trends"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={appleSpring}
            className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-300"
          >
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
              <div className="p-8 flex flex-col justify-between apple-card">
                <div className="flex justify-between items-start text-muted-foreground">
                  <span className="text-xs font-bold uppercase tracking-wider">Audience Reach</span>
                  <span className="p-2.5 rounded-2xl bg-[#007AFF]/10 text-[#007AFF]"><Users size={16} /></span>
                </div>
                <div className="mt-6">
                  <h3 className="text-3xl font-bold tracking-tight">{(user?.followers || 0).toLocaleString()}</h3>
                  <span className="text-[10px] text-muted-foreground mt-1.5 block font-medium">Aggregated profile traffic</span>
                </div>
              </div>
              
              <div className="p-8 flex flex-col justify-between apple-card">
                <div className="flex justify-between items-start text-muted-foreground">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Impressions</span>
                  <span className="p-2.5 rounded-2xl bg-[#34C759]/10 text-[#34C759]"><Eye size={16} /></span>
                </div>
                <div className="mt-6">
                  <h3 className="text-3xl font-bold tracking-tight">{(aggregateMetrics.impressions || 0).toLocaleString()}</h3>
                  <span className="text-[10px] text-muted-foreground mt-1.5 block font-medium">Across all campaign posts</span>
                </div>
              </div>

              <div className="p-8 flex flex-col justify-between apple-card">
                <div className="flex justify-between items-start text-muted-foreground">
                  <span className="text-xs font-bold uppercase tracking-wider">Engagement Rate</span>
                  <span className="p-2.5 rounded-2xl bg-[#FF9500]/10 text-[#FF9500]"><TrendingUp size={16} /></span>
                </div>
                <div className="mt-6">
                  <h3 className="text-3xl font-bold tracking-tight">{engagementRate.toFixed(2)}%</h3>
                  <span className="text-[10px] text-muted-foreground mt-1.5 block font-medium">Average interaction ratio</span>
                </div>
              </div>

              <div className="p-8 flex flex-col justify-between apple-card">
                <div className="flex justify-between items-start text-muted-foreground">
                  <span className="text-xs font-bold uppercase tracking-wider">Brand Sales ROI</span>
                  <span className="p-2.5 rounded-2xl bg-primary/10 text-primary"><DollarSign size={16} /></span>
                </div>
                <div className="mt-6">
                  <h3 className="text-3xl font-bold tracking-tight">—</h3>
                  <span className="text-[10px] text-muted-foreground mt-1.5 block font-medium">Attributed sales generated</span>
                </div>
              </div>
            </div>

            {/* Performance Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-3 p-8 apple-card min-h-[380px] flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold tracking-tight mb-1">Reach & Engagement Trends</h3>
                  <p className="text-xs text-muted-foreground mb-8">Performance metrics tracked over completed campaigns.</p>
                </div>
                
                <div className="flex-1 w-full h-[220px] text-[10px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={
                        posts.length > 0 
                          ? posts.map(p => ({
                              name: p.campaignTitle?.substring(0, 15) || "Collab",
                              Impressions: p.metrics.impressions || 0,
                              Reach: p.metrics.reach || 0
                            }))
                          : []
                      } 
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
                      <XAxis dataKey="name" stroke="var(--muted-foreground)" />
                      <YAxis stroke="var(--muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "16px",
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)"
                        }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Bar dataKey="Impressions" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Reach" fill="#34C759" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </motion.div>
        ) : (
          <motion.div
            key="wallet"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={appleSpring}
          >
            <WalletUI />
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      )}

    </div>
  );
}
