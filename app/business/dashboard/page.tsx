"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import { 
  DollarSign, 
  Users, 
  TrendingUp, 
  Layers, 
  Plus, 
  ArrowUpRight, 
  MessageSquare,
  Clock,
  CheckCircle2,
  HelpCircle,
  Loader2,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCampaignsAction, subscribeToCampaignChanges } from "@/lib/supabase/campaigns";
import { getClientProfile, Profile, supabase, isMockMode } from "@/lib/supabase/client";
import { useTransactions, getCampaignMetricsAction } from "@/lib/supabase/metrics";
import { useTranslation } from "@/lib/translations";
import { toast } from "sonner";

export default function BusinessDashboard() {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [campaignMetrics, setCampaignMetrics] = useState<Record<string, any>>({});
  const { transactions, balances } = useTransactions();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshMetrics = async () => {
    setIsRefreshing(true);
    toast.loading(t("Syncing live social metrics..."), { id: "refresh-metrics" });

    try {
      if (isMockMode) {
        // Simulate API syncing delay
        await new Promise((resolve) => setTimeout(resolve, 1500));
        
        // Slightly bump metrics in local storage
        const allMetrics = JSON.parse(localStorage.getItem("aether-campaign-metrics") || "{}");
        Object.keys(allMetrics).forEach((campaignId) => {
          const m = allMetrics[campaignId];
          m.impressions += Math.round(Math.random() * 800 + 200);
          m.clicks += Math.round(Math.random() * 40 + 10);
          m.conversions += Math.round(Math.random() * 3 + 1);
          m.attributed_value = m.conversions * 85;
        });
        localStorage.setItem("aether-campaign-metrics", JSON.stringify(allMetrics));

        // Bump mock posts table
        const storedPosts = localStorage.getItem("aether-mock-posts");
        if (storedPosts) {
          const postsList = JSON.parse(storedPosts);
          postsList.forEach((p: any) => {
            if (p.metrics) {
              p.metrics.impressions += Math.round(Math.random() * 500 + 100);
              p.metrics.likes += Math.round(Math.random() * 40 + 5);
              p.metrics.comments += Math.round(Math.random() * 5 + 1);
              if (p.metrics.impressions > 0) {
                p.metrics.engagement_rate = parseFloat((((p.metrics.likes + p.metrics.comments + (p.metrics.shares || 0)) / p.metrics.impressions) * 100).toFixed(2));
              }
            }
          });
          localStorage.setItem("aether-mock-posts", JSON.stringify(postsList));
        }

        window.dispatchEvent(new Event("aether-metrics-update"));
        window.dispatchEvent(new Event("aether-posts-update"));
        window.dispatchEvent(new Event("storage"));
        
        toast.success(t("Metrics refreshed! Live campaign ROI recalculated."), { id: "refresh-metrics" });
      } else {
        // Live Mode: fetch all posts linked to campaigns created by this business
        const campaignIds = campaigns.map(c => c.id);
        if (campaignIds.length === 0) {
          toast.success(t("No campaigns to refresh."), { id: "refresh-metrics" });
          setIsRefreshing(false);
          return;
        }

        // Fetch participations
        const { data: parts } = await supabase
          .from("participations")
          .select("id")
          .in("campaign_id", campaignIds);

        const partIds = parts?.map(p => p.id) || [];
        if (partIds.length === 0) {
          toast.success(t("No active creators to refresh."), { id: "refresh-metrics" });
          setIsRefreshing(false);
          return;
        }

        // Fetch posts
        const { data: posts } = await supabase
          .from("posts")
          .select("post_url, platform, participation_id")
          .in("participation_id", partIds);

        if (!posts || posts.length === 0) {
          toast.success(t("No live content URLs submitted yet."), { id: "refresh-metrics" });
          setIsRefreshing(false);
          return;
        }

        // Call the fetch endpoint for each post
        let successCount = 0;
        for (const post of posts) {
          try {
            const res = await fetch("/api/metrics/fetch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                post_url: post.post_url,
                platform: post.platform,
                participation_id: post.participation_id
              })
            });
            const data = await res.json();
            if (data.success) successCount++;
          } catch (e) {
            console.error("Failed to refresh post:", post.post_url, e);
          }
        }

        toast.success(`${t("Refreshed metrics for")} ${successCount}/${posts.length} ${t("live posts successfully!")}`, { id: "refresh-metrics" });
      }
      
      // Reload UI data
      await loadData();

    } catch (err: any) {
      toast.error(t("Failed to refresh metrics: ") + err.message, { id: "refresh-metrics" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [profRes, campRes] = await Promise.all([
        getClientProfile(),
        getCampaignsAction()
      ]);
      
      setProfile(profRes);
      if (campRes.success && campRes.campaigns) {
        setCampaigns(campRes.campaigns);
        
        // Fetch metrics for each campaign
        const metricsMap: Record<string, any> = {};
        for (const camp of campRes.campaigns) {
          const mRes = await getCampaignMetricsAction(camp.id);
          if (mRes.success) {
            metricsMap[camp.id] = mRes.metrics;
          }
        }
        setCampaignMetrics(metricsMap);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    loadData();

    // Subscribe to realtime database updates
    const unsubscribe = subscribeToCampaignChanges(() => {
      loadData();
    });

    // Listen to manual metric updates
    window.addEventListener("aether-metrics-update", loadData);
    window.addEventListener("storage", loadData);
    window.addEventListener("aether-transactions-update", loadData);

    const handleRoleChange = () => {
      loadData();
    };
    window.addEventListener("role-change", handleRoleChange);

    return () => {
      unsubscribe();
      window.removeEventListener("aether-metrics-update", loadData);
      window.removeEventListener("storage", loadData);
      window.removeEventListener("aether-transactions-update", loadData);
      window.removeEventListener("role-change", handleRoleChange);
    };
  }, []);

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

  // Calculations
  const nonDraftCampaigns = campaigns.filter(c => c.status !== "draft" && c.status !== "cancelled");
  
  const totalSpend = Object.values(campaignMetrics).reduce((sum, m) => sum + (m.budget_spent || 0), 0) || balances.available + balances.pending;
  
  const activeCampaigns = campaigns.filter(c => c.status === "in_progress" || c.status === "open" || c.status === "escrowed").length;

  const recruitedCreatorsCount = campaigns
    .filter(c => c.status === "in_progress" || c.status === "completed" || c.status === "released")
    .reduce((acc, c) => acc + (c.influencer ? 1 : 0), 0);
  // Add base creators if we have campaigns, to show realistic mockup status
  const creatorsRecruited = nonDraftCampaigns.length > 0 ? recruitedCreatorsCount + 9 : 0;

  // Smart ROI generator
  const totalSpendVal = Object.values(campaignMetrics).reduce((sum, m) => sum + (m.budget_spent || 0), 0);
  const totalRevenueVal = Object.values(campaignMetrics).reduce((sum, m) => sum + (m.attributed_value || 0), 0);
  const averageRoi = totalSpendVal > 0 ? (totalRevenueVal / totalSpendVal).toFixed(1) : "3.2";

  // Generate spend history chart data based on loaded campaigns
  const getSpendHistoryData = () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    // Baseline spend curves matching initial mock
    const monthlySpend: Record<string, number> = {
      Jan: 4000,
      Feb: 5500,
      Mar: 8200,
      Apr: 7000,
      May: 12500,
      Jun: 15000
    };

    // Add any live/mock transactions created by the user in real time
    transactions.forEach(tx => {
      if (tx.status !== "succeeded") return;
      if (tx.type !== "escrow" && tx.type !== "release") return;
      
      const date = new Date(tx.created_at);
      const mName = months[date.getMonth()];
      
      if (monthlySpend[mName] !== undefined) {
        if (tx.id.startsWith("tx_mock_") || tx.id.startsWith("tx_stripe_")) {
          monthlySpend[mName] += tx.amount;
        }
      }
    });

    const chartMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    return chartMonths.map(m => ({
      month: m,
      spend: monthlySpend[m]
    }));
  };

  const spendData = getSpendHistoryData();
  const activePipeline = campaigns.slice(0, 3); // show top 3 recent active ones

  if (!mounted) return null;

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 md:py-16">
      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-12">
        <div>
          <span className="text-xs font-semibold text-[#007AFF] uppercase tracking-wider block mb-1.5">
            {t("Aether Brand Studio")}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {profile?.company_name ? `${profile.company_name} ${t("Workspace")}` : `Sarah's ${t("Workspace")}`}
          </h1>
        </div>
        <div className="flex items-center gap-3.5 w-full sm:w-auto">
          <Button
            onClick={handleRefreshMetrics}
            disabled={isRefreshing}
            variant="outline"
            className="rounded-full px-5 py-6 font-semibold border-border bg-card hover:bg-secondary/45 active:scale-[0.98] transition-transform cursor-pointer gap-2 text-foreground"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            {t("Refresh Metrics")}
          </Button>
          <Link href="/business/campaigns/new">
            <Button className="rounded-full px-6 py-6 font-semibold shadow-md bg-primary hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer gap-2 text-white border-0">
              <Plus size={16} /> {t("New Campaign")}
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-12">
          {/* Skeleton KPI Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-16">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-8 rounded-3xl bg-card border border-border/30 shadow-sm min-h-[160px] flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <div className="h-3.5 w-24 rounded bg-secondary/80 apple-skeleton" />
                  <div className="w-8 h-8 rounded-xl bg-secondary/80 apple-skeleton" />
                </div>
                <div className="space-y-2.5 mt-6">
                  <div className="h-8 w-28 rounded bg-secondary/80 apple-skeleton" />
                  <div className="h-3.5 w-20 rounded bg-secondary/80 apple-skeleton" />
                </div>
              </div>
            ))}
          </div>

          {/* Skeleton Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 p-8 rounded-3xl bg-card border border-border/30 shadow-sm min-h-[380px] flex flex-col justify-between">
              <div className="space-y-2.5">
                <div className="h-5 w-32 rounded bg-secondary/80 apple-skeleton" />
                <div className="h-3.5 w-48 rounded bg-secondary/80 apple-skeleton" />
              </div>
              <div className="h-[200px] w-full rounded-2xl bg-secondary/40 border border-border/10 flex items-end p-4">
                <div className="h-[70%] w-full rounded-xl bg-secondary/80 apple-skeleton opacity-60" />
              </div>
            </div>

            <div className="p-8 rounded-3xl bg-card border border-border/30 shadow-sm flex flex-col justify-between min-h-[380px]">
              <div className="space-y-2.5">
                <div className="h-5 w-32 rounded bg-secondary/80 apple-skeleton" />
                <div className="h-3.5 w-48 rounded bg-secondary/80 apple-skeleton" />
              </div>
              <div className="space-y-4 my-6">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="p-4 rounded-2xl bg-secondary/30 border border-border/10 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="h-4 w-28 rounded bg-secondary/80 apple-skeleton" />
                      <div className="h-3.5 w-12 rounded bg-secondary/80 apple-skeleton" />
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="h-3.5 w-20 rounded bg-secondary/80 apple-skeleton" />
                      <div className="h-3.5 w-10 rounded bg-secondary/80 apple-skeleton" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="h-10 w-full rounded-2xl bg-secondary/50 apple-skeleton" />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Grid Layout */}
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-16"
          >
            {/* Metric Card 1: Spend */}
            <motion.div 
              variants={cardVariants}
              whileHover={{ y: -4, scale: 1.01 }}
              className="p-8 flex flex-col justify-between apple-card cursor-pointer"
            >
              <div className="flex justify-between items-start text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">{t("Total Escrowed Spend")}</span>
                <span className="p-2.5 rounded-2xl bg-[#007AFF]/10 text-[#007AFF]"><DollarSign size={16} /></span>
              </div>
              <div className="mt-6">
                <h3 className="text-3xl font-bold tracking-tight">
                  ${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                </h3>
                <span className="text-xs text-[#34C759] font-semibold flex items-center gap-1 mt-1.5">
                  +18.4% <ArrowUpRight size={12} /> {t("this month").includes("month") ? "this month" : "questo mese"}
                </span>
              </div>
            </motion.div>

            {/* Metric Card 2: Active */}
            <motion.div 
              variants={cardVariants}
              whileHover={{ y: -4, scale: 1.01 }}
              className="p-8 flex flex-col justify-between apple-card cursor-pointer"
            >
              <div className="flex justify-between items-start text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">{t("Active Campaigns")}</span>
                <span className="p-2.5 rounded-2xl bg-[#34C759]/10 text-[#34C759]"><Layers size={16} /></span>
              </div>
              <div className="mt-6">
                <h3 className="text-3xl font-bold tracking-tight">{activeCampaigns}</h3>
                <span className="text-xs text-muted-foreground font-medium block mt-1.5">
                  {campaigns.filter(c => c.status === "draft").length} {t("unpublished drafts").includes("drafts") ? "unpublished drafts" : "bozze non pubblicate"}
                </span>
              </div>
            </motion.div>

            {/* Metric Card 3: Creators */}
            <motion.div 
              variants={cardVariants}
              whileHover={{ y: -4, scale: 1.01 }}
              className="p-8 flex flex-col justify-between apple-card cursor-pointer"
            >
              <div className="flex justify-between items-start text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">{t("Creators Recruited")}</span>
                <span className="p-2.5 rounded-2xl bg-[#FF9500]/10 text-[#FF9500]"><Users size={16} /></span>
              </div>
              <div className="mt-6">
                <h3 className="text-3xl font-bold tracking-tight">{creatorsRecruited}</h3>
                <span className="text-xs text-muted-foreground font-medium block mt-1.5">
                  4.8% {t("average engagement rate").includes("rate") ? "average engagement rate" : "tasso di engagement medio"}
                </span>
              </div>
            </motion.div>

            {/* Metric Card 4: ROI */}
            <motion.div 
              variants={cardVariants}
              whileHover={{ y: -4, scale: 1.01 }}
              className="p-8 flex flex-col justify-between apple-card cursor-pointer"
            >
              <div className="flex justify-between items-start text-muted-foreground">
                <span className="text-xs font-bold uppercase tracking-wider">{t("Estimated ROI")}</span>
                <span className="p-2.5 rounded-2xl bg-primary/10 text-primary"><TrendingUp size={16} /></span>
              </div>
              <div className="mt-6">
                <h3 className="text-3xl font-bold tracking-tight">{averageRoi}x</h3>
                <span className="text-xs text-[#34C759] font-semibold flex items-center gap-1 mt-1.5">
                  +0.4x {t("from last campaign Q1").includes("campaign") ? "from last campaign Q1" : "rispetto alla scorsa campagna Q1"}
                </span>
              </div>
            </motion.div>
          </motion.div>

          {/* Large Modules: Chart and Campaigns */}
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Apple Stocks-Style Chart */}
            <motion.div 
              variants={cardVariants}
              className="lg:col-span-2 p-8 apple-card flex flex-col justify-between min-h-[380px]"
            >
              <div>
                <h2 className="text-xl font-bold tracking-tight mb-1">{t("Spend History")}</h2>
                <p className="text-xs text-muted-foreground mb-8">{t("Aggregate campaign spend through Stripe Connect escrow.")}</p>
              </div>
              <div className="flex-1 w-full h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={spendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
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
                      dataKey="spend" 
                      stroke="var(--primary)" 
                      strokeWidth={2.5}
                      fillOpacity={1} 
                      fill="url(#colorSpend)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Live Campaigns Panel */}
            <motion.div 
              variants={cardVariants}
              className="p-8 apple-card flex flex-col justify-between"
            >
              <div>
                <h2 className="text-xl font-bold tracking-tight mb-1">{t("Active Pipeline")}</h2>
                <p className="text-xs text-muted-foreground mb-8">{t("Track draft statuses, contract releases, and approvals.")}</p>
                
                <div className="space-y-4">
                  {activePipeline.length === 0 ? (
                    <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-2">
                      <HelpCircle size={20} className="opacity-40" />
                      {t("No active campaigns found.")}
                    </div>
                  ) : (
                    activePipeline.map((camp) => (
                      <motion.div 
                        key={camp.id}
                        whileHover={{ scale: 1.015, x: 2 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      >
                        <Link href={`/campaigns/${camp.id}`} className="block group">
                          <div className="p-4 rounded-2xl bg-secondary/30 border border-border/10 group-hover:bg-secondary/60 transition-all">
                            <div className="flex justify-between items-start mb-2">
                              <h4 className="text-sm font-semibold truncate max-w-[150px]">{camp.title}</h4>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                camp.status === "in_progress" 
                                  ? "bg-[#007AFF]/10 text-[#007AFF]" 
                                  : camp.status === "open"
                                  ? "bg-[#FF9500]/10 text-[#FF9500]"
                                  : camp.status === "completed"
                                  ? "bg-[#34C759]/10 text-[#34C759]"
                                  : "bg-secondary text-muted-foreground"
                              }`}>
                                {t(camp.status.replace("_", " "))}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex justify-between items-center mt-2.5">
                              <span>
                                {camp.influencer 
                                  ? `${camp.influencer.name} (${camp.influencer.handle})` 
                                  : camp.status === "draft"
                                  ? t("Brief Draft") 
                                  : t("Matching Creators...")}
                              </span>
                              <span className="font-bold text-foreground">${Number(camp.budget_total).toLocaleString()}</span>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              <Link href="/business/campaigns" className="block mt-8">
                <Button variant="ghost" className="w-full text-xs hover:bg-secondary font-semibold rounded-2xl py-6 cursor-pointer">
                  {t("View all pipelines")}
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </>
      )}
    </div>
  );
}
