"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Clock, 
  CheckCircle2, 
  HelpCircle, 
  Loader2, 
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Wallet,
  Play,
  FileCheck,
  Check,
  X,
  ExternalLink,
  ChevronRight,
  MessageSquare,
  Sparkles,
  Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandPerformanceSummary } from "@/components/brand-performance-summary";
import { getCampaignsAction, subscribeToCampaignChanges } from "@/lib/supabase/campaigns";
import { getClientProfile, Profile, supabase, isMockMode } from "@/lib/supabase/client";
import { useTransactions, getCampaignMetricsAction } from "@/lib/supabase/metrics";
import { fundEscrowAction, releaseEscrowAction, startStripeOnboardingAction } from "@/lib/stripe/actions";
import { useTranslation } from "@/lib/translations";
import { toast } from "sonner";
import confetti from "canvas-confetti";

interface Participant {
  id: string;
  fullName: string;
  handle: string;
  avatarUrl: string;
  status: "applied" | "escrowed" | "submitted" | "released" | "declined";
  payout: number;
  submissions: Array<{
    version: number;
    submittedAt: string;
    postUrl: string;
    imageUrl: string;
    caption?: string;
    metrics?: any;
    annotations?: any[];
  }>;
}

export default function BusinessDashboard() {
  const { t } = useTranslation();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [campaignMetrics, setCampaignMetrics] = useState<Record<string, any>>({});
  const [campaignDetails, setCampaignDetails] = useState<Record<string, any>>({});
  const { transactions, balances, refresh: refreshTransactions } = useTransactions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "review" | "billing">("overview");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

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
            await supabase.functions.invoke("metrics-fetch", {
              body: {
                post_url: post.post_url,
                platform: post.platform,
                participation_id: post.participation_id,
              }
            });
            successCount++;
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
      const [profRes, campRes] = await Promise.all([
        getClientProfile(),
        getCampaignsAction()
      ]);
      
      setProfile(profRes);
      if (campRes.success && campRes.campaigns) {
        setCampaigns(campRes.campaigns);
        
        // Fetch metrics and rich data details for each campaign
        const metricsMap: Record<string, any> = {};
        const detailsMap: Record<string, any> = {};
        
        for (const camp of campRes.campaigns) {
          const mRes = await getCampaignMetricsAction(camp.id);
          if (mRes.success) {
            metricsMap[camp.id] = mRes.metrics;
          }

          // Fetch local storage rich data (participants and deliverables)
          const key = `aether-campaign-rich-data-${camp.id}`;
          const storedState = localStorage.getItem(key);
          if (storedState) {
            try {
              detailsMap[camp.id] = JSON.parse(storedState);
            } catch (e) {
              console.error("Failed to parse campaign rich data for", camp.id, e);
            }
          }
        }
        setCampaignMetrics(metricsMap);
        setCampaignDetails(detailsMap);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    setLoading(true);
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

  const handleOnboardStripe = async () => {
    setOnboardingLoading(true);
    toast.loading("Redirecting to Stripe Connect onboarding...", {
      id: "stripe-onboard",
    });

    try {
      const origin = window.location.origin;
      const res = await startStripeOnboardingAction("business", origin);

      if (res.success && res.url) {
        toast.success("Redirecting...", { id: "stripe-onboard" });
        window.location.href = res.url;
      } else {
        toast.error(res.error || "Failed to generate onboarding session.", { id: "stripe-onboard" });
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred connecting to Stripe.", { id: "stripe-onboard" });
    } finally {
      setOnboardingLoading(false);
    }
  };

  // --- ACTIONS FROM THE CENTRAL REVIEW QUEUE ---

  // Fund Escrow (Approve application)
  const handleFundEscrowCentral = async (campaignId: string, participant: Participant) => {
    const actionId = `fund-${campaignId}-${participant.id}`;
    setActionLoadingId(actionId);
    toast.loading("Initializing secure escrow funding...", { id: "escrow-funding" });

    try {
      const res = await fundEscrowAction(campaignId, participant.payout);

      if (res.success) {
        // Update campaign local state
        const richCampaign = campaignDetails[campaignId];
        if (richCampaign) {
          const updatedParticipants = richCampaign.participants.map((p: Participant) => {
            if (p.id === participant.id) {
              return { ...p, status: "escrowed" as const };
            }
            return p;
          });

          const updatedTimeline = richCampaign.timeline.map((t: any) => {
            if (t.label.includes("Stripe Escrow")) return { ...t, completed: true };
            return t;
          });

          const updated = {
            ...richCampaign,
            participants: updatedParticipants,
            timeline: updatedTimeline,
            status: "escrowed" as const
          };

          localStorage.setItem(`aether-campaign-rich-data-${campaignId}`, JSON.stringify(updated));
        }

        // Store transaction locally if mock mode
        if (res.isMock) {
          const stored = localStorage.getItem("aether-mock-transactions");
          const txList = stored ? JSON.parse(stored) : [];
          const newTx = {
            id: "tx_mock_" + Math.random().toString(36).substring(7),
            amount: participant.payout,
            type: "escrow",
            status: "succeeded",
            created_at: new Date().toISOString(),
            campaignTitle: richCampaign?.title || "Campaign Contract",
            partner: participant.fullName
          };
          localStorage.setItem("aether-mock-transactions", JSON.stringify([newTx, ...txList]));
        }

        window.dispatchEvent(new Event("storage"));
        toast.success("Application Approved & Escrow Funded!", {
          id: "escrow-funding",
          description: `Locked $${participant.payout.toLocaleString()} in Stripe escrow for ${participant.fullName}.`
        });
      } else {
        toast.error(res.error || "Funding failed.", { id: "escrow-funding" });
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred.", { id: "escrow-funding" });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Decline Application
  const handleDeclineApplication = (campaignId: string, participantId: string) => {
    toast.loading("Declining application...", { id: "decline-app" });
    try {
      const richCampaign = campaignDetails[campaignId];
      if (richCampaign) {
        const updatedParticipants = richCampaign.participants.map((p: Participant) => {
          if (p.id === participantId) {
            return { ...p, status: "declined" as const };
          }
          return p;
        });

        const updated = {
          ...richCampaign,
          participants: updatedParticipants
        };

        localStorage.setItem(`aether-campaign-rich-data-${campaignId}`, JSON.stringify(updated));
        window.dispatchEvent(new Event("storage"));
        toast.success("Application declined successfully", {
          id: "decline-app",
          description: "Influencer was moved out of active pipelines."
        });
      }
    } catch (err: any) {
      toast.error("Declining failed: " + err.message, { id: "decline-app" });
    }
  };

  // Approve content & Release Escrow
  const handleApproveReleaseCentral = async (campaignId: string, participant: Participant) => {
    const actionId = `release-${campaignId}-${participant.id}`;
    setActionLoadingId(actionId);
    toast.loading("Releasing Stripe Connect payout...", { id: "release-escrow" });

    try {
      const res = await releaseEscrowAction(campaignId);

      if (res.success) {
        const richCampaign = campaignDetails[campaignId];
        if (richCampaign) {
          const updatedParticipants = richCampaign.participants.map((p: Participant) => {
            if (p.id === participant.id) {
              return { ...p, status: "released" as const };
            }
            return p;
          });

          const updatedTimeline = richCampaign.timeline.map((t: any) => {
            if (t.label.includes("Content Release") || t.label.includes("Draft Deliverable") || t.label.includes("Review")) {
              return { ...t, completed: true };
            }
            return t;
          });

          const updated = {
            ...richCampaign,
            participants: updatedParticipants,
            timeline: updatedTimeline,
            status: "released" as const
          };

          localStorage.setItem(`aether-campaign-rich-data-${campaignId}`, JSON.stringify(updated));
        }

        // Store transaction locally if mock mode
        if (res.isMock) {
          const stored = localStorage.getItem("aether-mock-transactions");
          const txList = stored ? JSON.parse(stored) : [];
          const newTx = {
            id: "tx_mock_" + Math.random().toString(36).substring(7),
            amount: participant.payout,
            type: "release",
            status: "succeeded",
            created_at: new Date().toISOString(),
            campaignTitle: richCampaign?.title || "Campaign Contract",
            partner: participant.fullName
          };
          localStorage.setItem("aether-mock-transactions", JSON.stringify([newTx, ...txList]));
        }

        // Trigger confetti celebration!
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.65 },
          colors: ["#34C759", "#007AFF", "#FF9500"]
        });

        window.dispatchEvent(new Event("storage"));
        toast.success("Payout Released Instantly!", {
          id: "release-escrow",
          description: `Contract completed successfully. Payout dispatched to ${participant.fullName}.`
        });
      } else {
        toast.error(res.error || "Escrow release failed.", { id: "release-escrow" });
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred.", { id: "release-escrow" });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Calculations
  const nonDraftCampaigns = campaigns.filter(c => c.status !== "draft" && c.status !== "cancelled");
  const totalSpend = Object.values(campaignMetrics).reduce((sum, m) => sum + (m.budget_spent || 0), 0) || balances.available + balances.pending;
  const activeCampaigns = campaigns.filter(c => c.status === "in_progress" || c.status === "open" || c.status === "escrowed").length;
  
  // Aggregate recruited creators count from campaigns
  const recruitedCreatorsCount = campaigns
    .filter(c => c.status === "in_progress" || c.status === "completed" || c.status === "released")
    .reduce((acc, c) => acc + (c.influencer ? 1 : 0), 0);
  const creatorsRecruited = nonDraftCampaigns.length > 0 ? recruitedCreatorsCount + 9 : 0;

  // Smart ROI calculations
  const totalSpendVal = Object.values(campaignMetrics).reduce((sum, m) => sum + (m.budget_spent || 0), 0);
  const totalRevenueVal = Object.values(campaignMetrics).reduce((sum, m) => sum + (m.attributed_value || 0), 0);
  const averageRoi = totalSpendVal > 0 ? (totalRevenueVal / totalSpendVal).toFixed(1) : "3.2";

  // Recharts Chart Data
  const getSpendHistoryData = () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlySpend: Record<string, number> = {
      Jan: 4000,
      Feb: 5500,
      Mar: 8200,
      Apr: 7000,
      May: 12500,
      Jun: 15000
    };

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
  const activePipeline = campaigns.slice(0, 3); // top 3 active campaigns

  // Review Queue Processing: extract all applications and submissions across all rich campaign details
  const getReviewQueueData = () => {
    const pendingApplications: Array<{ campaignId: string; campaignTitle: string; participant: Participant }> = [];
    const pendingDeliverables: Array<{ campaignId: string; campaignTitle: string; participant: Participant }> = [];

    Object.keys(campaignDetails).forEach((campaignId) => {
      const details = campaignDetails[campaignId];
      if (details && details.participants) {
        details.participants.forEach((part: Participant) => {
          if (part.status === "applied") {
            pendingApplications.push({ campaignId, campaignTitle: details.title, participant: part });
          } else if (part.status === "submitted" && part.submissions && part.submissions.length > 0) {
            pendingDeliverables.push({ campaignId, campaignTitle: details.title, participant: part });
          }
        });
      }
    });

    return { pendingApplications, pendingDeliverables };
  };

  const { pendingApplications, pendingDeliverables } = getReviewQueueData();
  const isStripeConnected = !!profile?.stripe_connect_id && !!profile?.stripe_onboarding_completed;

  if (!mounted) return null;

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 md:py-16 relative overflow-hidden">
      {/* Background Decorative Glows */}
      <div className="absolute top-0 right-1/4 w-[350px] h-[350px] bg-gradient-to-tr from-[#007AFF]/5 to-transparent blur-[90px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 left-10 w-[300px] h-[300px] bg-gradient-to-tr from-secondary/3 to-transparent blur-[80px] pointer-events-none rounded-full" />

      {/* Header and Add Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-10 relative z-10">
        <div>
          <span className="text-xs font-semibold text-[#007AFF] uppercase tracking-wider block mb-1.5">
            {t("Aether Brand Studio")}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-heading">
            {profile?.company_name ? `${profile.company_name} ${t("Workspace")}` : `Sarah's ${t("Workspace")}`}
          </h1>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
          <Button
            onClick={handleRefreshMetrics}
            disabled={isRefreshing}
            variant="outline"
            className="rounded-full px-5 py-6 font-semibold border-border bg-card hover:bg-secondary/45 active:scale-[0.98] transition-transform cursor-pointer gap-2 text-foreground h-auto"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            {t("Refresh Metrics")}
          </Button>
          <Link href="/business/campaigns/new">
            <Button className="rounded-full px-6 py-6 font-semibold shadow-md bg-primary hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer gap-2 text-white border-0 h-auto">
              <Plus size={16} /> {t("New Campaign")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stripe Connect Warning Banner */}
      {!isStripeConnected && !loading && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 p-5 rounded-3xl bg-[#FF9500]/5 border border-[#FF9500]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10"
        >
          <div className="flex items-start gap-3">
            <span className="p-2 rounded-2xl bg-[#FF9500]/10 text-[#FF9500] shrink-0 mt-0.5 sm:mt-0">
              <ShieldAlert size={16} />
            </span>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-foreground">{t("Payment Wallet Connection Required")}</h4>
              <p className="text-[11px] text-muted-foreground leading-normal">
                {t("Connect your checking account via Stripe Connect simulator to fund campaign escrows and match with micro-influencers.")}
              </p>
            </div>
          </div>
          <Button 
            onClick={handleOnboardStripe}
            disabled={onboardingLoading}
            className="rounded-full text-xs font-semibold px-4.5 py-4 bg-[#FF9500] hover:bg-[#e08300] text-white border-0 shadow-sm transition-all h-auto shrink-0 self-start sm:self-center"
          >
            {onboardingLoading ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />} Setup Stripe Gateway
          </Button>
        </motion.div>
      )}

      {/* Segmented Control / Apple Pill Tabs */}
      <div className="flex justify-center sm:justify-start mb-8 relative z-10">
        <div className="bg-secondary/40 border border-border/20 p-1.5 rounded-full flex gap-1 relative max-w-xl w-full sm:w-auto">
          {/* Active Tab Sliding Pill */}
          <div className="absolute inset-y-1.5 left-1.5 right-1.5 pointer-events-none">
            <motion.div
              layoutId="activeBusinessTabPill"
              className="bg-card shadow-sm border border-border/30 rounded-full h-full"
              initial={false}
              animate={{
                x: activeTab === "overview" ? "0%" : activeTab === "review" ? "100%" : "200%",
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
            <Layers size={13} />
            {t("Overview")}
          </button>

          <button
            onClick={() => setActiveTab("review")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-full relative z-10 transition-colors cursor-pointer select-none ${
              activeTab === "review" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileCheck size={13} />
            {t("Review Queue")}
            {(pendingApplications.length + pendingDeliverables.length) > 0 && (
              <span className="w-2 h-2 rounded-full bg-[#FF9500] animate-pulse" />
            )}
          </button>
          
          <button
            onClick={() => setActiveTab("billing")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-full relative z-10 transition-colors cursor-pointer select-none ${
              activeTab === "billing" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wallet size={13} />
            {t("Billing & Escrows")}
          </button>
        </div>
      </div>

      {/* Performance campaigns at a glance (new model) */}
      <BrandPerformanceSummary />

      {/* Everything below is the legacy fixed-fee escrow model (campaigns,
          review queue, billing). Labeled so the two models are distinct. */}
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
          {t("Fixed-fee Escrow Activity")}
        </span>
        <span className="h-px flex-1 bg-border/20" />
      </div>

      {loading ? (
        <div className="space-y-12 relative z-10">
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
        <AnimatePresence mode="wait">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={appleSpring}
              className="space-y-12 relative z-10"
            >
              {/* Grid Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
                {/* Spend Metric */}
                <div className="p-8 flex flex-col justify-between apple-card cursor-pointer" onClick={() => setActiveTab("billing")}>
                  <div className="flex justify-between items-start text-muted-foreground">
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t("Total Committed Spend")}</span>
                    <span className="p-2.5 rounded-2xl bg-[#007AFF]/10 text-[#007AFF]"><DollarSign size={15} /></span>
                  </div>
                  <div className="mt-6">
                    <h3 className="text-3xl font-bold tracking-tight text-foreground">
                      ${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </h3>
                    <span className="text-xs text-[#34C759] font-bold flex items-center gap-1 mt-1.5">
                      +18.4% <ArrowUpRight size={12} /> {t("this month")}
                    </span>
                  </div>
                </div>

                {/* Active Campaigns */}
                <div className="p-8 flex flex-col justify-between apple-card cursor-pointer" onClick={() => router.push("/business/campaigns")}>
                  <div className="flex justify-between items-start text-muted-foreground">
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t("Active Pipelines")}</span>
                    <span className="p-2.5 rounded-2xl bg-[#007AFF]/10 text-[#007AFF]"><Layers size={15} /></span>
                  </div>
                  <div className="mt-6">
                    <h3 className="text-3xl font-bold tracking-tight text-foreground">{activeCampaigns}</h3>
                    <span className="text-xs text-muted-foreground font-semibold block mt-1.5">
                      {campaigns.filter(c => c.status === "draft").length} {t("unpublished drafts")}
                    </span>
                  </div>
                </div>

                {/* Creators Recruited */}
                <div className="p-8 flex flex-col justify-between apple-card cursor-pointer" onClick={() => setActiveTab("review")}>
                  <div className="flex justify-between items-start text-muted-foreground">
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t("Creators Recruited")}</span>
                    <span className="p-2.5 rounded-2xl bg-[#34C759]/10 text-[#34C759]"><Users size={15} /></span>
                  </div>
                  <div className="mt-6">
                    <h3 className="text-3xl font-bold tracking-tight text-foreground">{creatorsRecruited}</h3>
                    <span className="text-xs text-[#34C759] font-bold flex items-center gap-1 mt-1.5">
                      4.8% ER {t("average")}
                    </span>
                  </div>
                </div>

                {/* Estimated ROI */}
                <div className="p-8 flex flex-col justify-between apple-card cursor-pointer">
                  <div className="flex justify-between items-start text-muted-foreground">
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t("Estimated ROI")}</span>
                    <span className="p-2.5 rounded-2xl bg-[#FF9500]/10 text-[#FF9500]"><TrendingUp size={15} /></span>
                  </div>
                  <div className="mt-6">
                    <h3 className="text-3xl font-bold tracking-tight text-foreground">{averageRoi}x</h3>
                    <span className="text-xs text-[#34C759] font-bold flex items-center gap-1 mt-1.5">
                      +0.4x {t("from last campaign Q1")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chart and Active Pipeline modules */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Spend Chart */}
                <div className="lg:col-span-2 p-8 apple-card flex flex-col justify-between min-h-[380px]">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight mb-1 text-foreground">{t("Spend History")}</h2>
                    <p className="text-xs text-muted-foreground mb-8">{t("Escrow budget allocations securely hold through Stripe Connect.")}</p>
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
                </div>

                {/* Active Campaigns Tracker */}
                <div className="p-8 apple-card flex flex-col justify-between">
                  <div>
                    <h2 className="text-lg font-bold tracking-tight mb-1 text-foreground">{t("Active Pipelines")}</h2>
                    <p className="text-xs text-muted-foreground mb-8">{t("Verify draft milestones, approvals, and contract completions.")}</p>
                    
                    <div className="space-y-4">
                      {activePipeline.length === 0 ? (
                        <div className="py-12 text-center text-xs text-muted-foreground/60 flex flex-col items-center justify-center gap-2">
                          <HelpCircle size={20} className="opacity-45" />
                          {t("No active campaigns found.")}
                        </div>
                      ) : (
                        activePipeline.map((camp) => (
                          <div 
                            key={camp.id}
                            className="group"
                          >
                            <Link href={`/campaigns/${camp.id}`} className="block">
                              <div className="p-4 rounded-2xl bg-secondary/20 hover:bg-secondary/35 border border-border/10 transition-all">
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="text-xs font-bold truncate max-w-[155px] text-foreground group-hover:text-primary transition-colors">{camp.title}</h4>
                                  <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                    camp.status === "in_progress" 
                                      ? "bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/15" 
                                      : camp.status === "open"
                                      ? "bg-[#FF9500]/10 text-[#FF9500] border border-[#FF9500]/15"
                                      : camp.status === "completed"
                                      ? "bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/15"
                                      : "bg-secondary text-muted-foreground"
                                  }`}>
                                    {t(camp.status.replace("_", " "))}
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground flex justify-between items-center mt-3 pt-2 border-t border-border/5">
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
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <Link href="/business/campaigns" className="block mt-8">
                    <Button variant="ghost" className="w-full text-xs hover:bg-secondary font-semibold rounded-2xl py-5.5 cursor-pointer text-muted-foreground hover:text-foreground border border-border/10 h-auto">
                      {t("Manage campaign pipeline")}
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: REVIEW QUEUE */}
          {activeTab === "review" && (
            <motion.div
              key="review"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={appleSpring}
              className="space-y-8 relative z-10"
            >
              {/* Creator Applications Section */}
              <div className="p-8 apple-card">
                <div className="flex items-center gap-2 mb-6 border-b border-border/10 pb-4">
                  <Users size={16} className="text-[#007AFF]" />
                  <div>
                    <h3 className="text-base font-bold text-foreground">{t("Pending Creator Applications")}</h3>
                    <p className="text-[11px] text-muted-foreground">{t("Review creator match requests, pitches, and approve to lock campaign escrows.")}</p>
                  </div>
                </div>

                {pendingApplications.length === 0 ? (
                  <div className="py-16 text-center text-xs text-muted-foreground/60 flex flex-col items-center justify-center gap-2.5">
                    <div className="w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center border border-border/10">
                      <CheckCircle2 size={20} className="text-[#34C759]" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{t("All Applications Reviewed")}</p>
                      <p className="text-[10px] mt-0.5">{t("No pending pitches currently require attention.")}</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {pendingApplications.map(({ campaignId, campaignTitle, participant }) => (
                      <motion.div 
                        key={`${campaignId}-${participant.id}`}
                        layout
                        className="p-5 rounded-2xl bg-secondary/15 border border-border/10 hover:border-border/30 transition-all flex flex-col justify-between space-y-4"
                      >
                        <div className="space-y-3">
                          {/* Creator profile header */}
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <img 
                                src={participant.avatarUrl} 
                                alt={participant.fullName}
                                className="w-10 h-10 rounded-full object-cover border border-border/10 shrink-0" 
                              />
                              <div>
                                <h4 className="text-xs font-bold text-foreground leading-tight">{participant.fullName}</h4>
                                <span className="text-[10px] text-muted-foreground mt-0.5 block">{participant.handle}</span>
                              </div>
                            </div>
                            <span className="text-[9px] font-bold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full border border-primary/15 uppercase">
                              {campaignTitle}
                            </span>
                          </div>

                          {/* Pitch content */}
                          <p className="text-[11px] text-muted-foreground leading-relaxed italic bg-secondary/20 p-3 rounded-xl border border-border/5">
                            "{participant.submissions?.[0]?.caption || `Hey! I love your brand and would love to collaborate on the ${campaignTitle} campaign. I will create a high quality aesthetic setup and highlight your layout details.`}"
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-between items-center pt-3 border-t border-border/5">
                          <div>
                            <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider block">{t("Proposed Payout")}</span>
                            <span className="text-xs font-extrabold text-[#34C759] mt-0.5 block">${participant.payout.toLocaleString()}</span>
                          </div>
                          
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => handleDeclineApplication(campaignId, participant.id)}
                              className="rounded-xl px-3 py-2 text-[10px] font-bold text-muted-foreground border-border bg-card hover:bg-secondary/40 cursor-pointer h-auto"
                            >
                              Decline
                            </Button>
                            <Button
                              onClick={() => handleFundEscrowCentral(campaignId, participant)}
                              disabled={actionLoadingId === `fund-${campaignId}-${participant.id}`}
                              className="rounded-xl px-4 py-2 text-[10px] font-bold bg-[#007AFF] text-white hover:scale-[1.01] active:scale-[0.99] transition-transform cursor-pointer border-0 shadow-sm gap-1.5 h-auto"
                            >
                              {actionLoadingId === `fund-${campaignId}-${participant.id}` ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <Check size={11} className="stroke-[3]" />
                              )}
                              Accept & Fund
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Content Draft Review Section */}
              <div className="p-8 apple-card">
                <div className="flex items-center gap-2 mb-6 border-b border-border/10 pb-4">
                  <Play size={16} className="text-[#34C759]" />
                  <div>
                    <h3 className="text-base font-bold text-foreground">{t("Content Deliverables Pending Review")}</h3>
                    <p className="text-[11px] text-muted-foreground">{t("Inspect uploaded video or image drafts, check parameters, and release escrow payout balances.")}</p>
                  </div>
                </div>

                {pendingDeliverables.length === 0 ? (
                  <div className="py-16 text-center text-xs text-muted-foreground/60 flex flex-col items-center justify-center gap-2.5">
                    <div className="w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center border border-border/10">
                      <CheckCircle2 size={20} className="text-[#34C759]" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{t("Deliverables Inbox Empty")}</p>
                      <p className="text-[10px] mt-0.5">{t("No creator uploads are awaiting approval.")}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {pendingDeliverables.map(({ campaignId, campaignTitle, participant }) => {
                      const latestSub = participant.submissions[participant.submissions.length - 1];
                      return (
                        <motion.div 
                          key={`${campaignId}-${participant.id}`}
                          layout
                          className="p-6 rounded-2xl bg-secondary/15 border border-border/10 flex flex-col lg:flex-row justify-between gap-6"
                        >
                          {/* Left segment: Creator, description, and thumbnail */}
                          <div className="flex flex-col sm:flex-row gap-5 flex-1 min-w-0">
                            {/* Thumbnail overlay */}
                            <div className="w-full sm:w-28 h-28 rounded-xl overflow-hidden bg-secondary border border-border/15 shrink-0 relative group">
                              <img 
                                src={latestSub.imageUrl} 
                                alt="Draft deliverable" 
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Play size={16} className="text-white" />
                              </div>
                            </div>

                            <div className="space-y-2.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[9px] font-bold bg-[#34C759]/10 text-[#34C759] px-2 py-0.5 rounded-full border border-[#34C759]/15 uppercase shrink-0">
                                  {latestSub.postUrl.includes("tiktok") ? "TikTok Draft" : "Instagram Post"}
                                </span>
                                <span className="text-[9px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/15 uppercase truncate max-w-[150px]">
                                  {campaignTitle}
                                </span>
                                <span className="text-[9px] text-muted-foreground font-semibold">
                                  v{latestSub.version} Submitted
                                </span>
                              </div>

                              <h4 className="text-sm font-bold text-foreground leading-tight">
                                {participant.fullName} • {participant.handle}
                              </h4>
                              
                              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 max-w-xl">
                                "{latestSub.caption}"
                              </p>

                              <div className="flex gap-4 pt-1 text-[10px] text-muted-foreground/80 font-semibold">
                                <span>Impressions: <strong className="text-foreground">{latestSub.metrics?.views?.toLocaleString() || "15K"}</strong></span>
                                <span>Engagement: <strong className="text-foreground">{latestSub.metrics?.roi ? "4.8%" : "3.5%"}</strong></span>
                                <span>Est. ROI: <strong className="text-[#34C759]">{latestSub.metrics?.roi || "2.1"}x</strong></span>
                              </div>
                            </div>
                          </div>

                          {/* Right segment: Actions and payout */}
                          <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-4 shrink-0 border-t border-border/5 lg:border-t-0 pt-4 lg:pt-0">
                            <div className="text-left lg:text-right">
                              <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider block">{t("Locked Escrow")}</span>
                              <span className="text-sm font-extrabold text-[#34C759] mt-0.5 block">${participant.payout.toLocaleString()}</span>
                            </div>

                            <div className="flex gap-2 shrink-0">
                              <Link href={`/campaigns/${campaignId}`}>
                                <Button
                                  variant="outline"
                                  className="rounded-xl px-3 py-2 text-[10px] font-bold text-muted-foreground border-border bg-card hover:bg-secondary/45 cursor-pointer h-auto"
                                >
                                  Open Canvas
                                </Button>
                              </Link>
                              <Button
                                onClick={() => handleApproveReleaseCentral(campaignId, participant)}
                                disabled={actionLoadingId === `release-${campaignId}-${participant.id}`}
                                className="rounded-xl px-4 py-2 text-[10px] font-bold bg-[#34C759] text-white hover:scale-[1.01] active:scale-[0.99] transition-transform cursor-pointer border-0 shadow-sm gap-1.5 h-auto"
                              >
                                {actionLoadingId === `release-${campaignId}-${participant.id}` ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <CheckCircle2 size={11} />
                                )}
                                Approve & Pay
                              </Button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 3: BILLING & ESCROWS */}
          {activeTab === "billing" && (
            <motion.div
              key="billing"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={appleSpring}
              className="space-y-6 relative z-10"
            >
              {/* Balances summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Locked in Escrow */}
                <div className="p-8 rounded-3xl bg-card border border-border/30 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[190px]">
                  <div className="absolute top-0 right-0 w-[180px] h-[90px] bg-gradient-to-l from-[#FF9500]/8 to-transparent blur-[50px] pointer-events-none" />
                  <div className="flex justify-between items-start text-muted-foreground">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">Locked in Stripe Escrow</span>
                      <h2 className="text-3xl font-bold tracking-tight text-foreground">
                        ${balances.pending.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </h2>
                    </div>
                    <span className="p-2 rounded-2xl bg-[#FF9500]/10 text-[#FF9500]">
                      <Lock size={15} />
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1.5 leading-normal mt-auto border-t border-border/10 pt-4">
                    <Clock size={12} className="shrink-0 text-[#FF9500]" />
                    <span>Funds lock confirmed. Disbursed instantly on draft approvals.</span>
                  </div>
                </div>

                {/* Total Paid Out */}
                <div className="p-8 rounded-3xl bg-card border border-border/30 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[190px]">
                  <div className="absolute top-0 right-0 w-[180px] h-[90px] bg-gradient-to-l from-[#34C759]/8 to-transparent blur-[50px] pointer-events-none" />
                  <div className="flex justify-between items-start text-muted-foreground">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">Total Released Payments</span>
                      <h2 className="text-3xl font-bold tracking-tight text-foreground">
                        ${balances.available.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </h2>
                    </div>
                    <span className="p-2 rounded-2xl bg-[#34C759]/10 text-[#34C759]">
                      <DollarSign size={16} />
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1.5 leading-normal mt-auto border-t border-border/10 pt-4">
                    <CheckCircle2 size={12} className="shrink-0 text-[#34C759]" />
                    <span>Securely routed directly to creators' linked Stripe accounts.</span>
                  </div>
                </div>

                {/* Gateway Status */}
                <div className="p-8 rounded-3xl bg-card border border-border/30 shadow-sm relative overflow-hidden flex flex-col justify-between min-h-[190px]">
                  <div className="absolute top-0 right-0 w-[180px] h-[90px] bg-gradient-to-l from-[#007AFF]/8 to-transparent blur-[50px] pointer-events-none" />
                  <div className="flex justify-between items-start text-muted-foreground">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider block mb-1">Gateway API Status</span>
                      <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-1.5 mt-2">
                        {isStripeConnected ? (
                          <>
                            <CheckCircle2 size={16} className="text-[#34C759]" /> Stripe Connected
                          </>
                        ) : (
                          <>
                            <ShieldAlert size={16} className="text-[#FF9500]" /> Setup Required
                          </>
                        )}
                      </h2>
                    </div>
                    <span className="p-2 rounded-2xl bg-secondary text-foreground">
                      <Wallet size={15} />
                    </span>
                  </div>

                  <div className="mt-4">
                    {isStripeConnected ? (
                      <div className="text-[10px] text-muted-foreground/80 leading-normal border-t border-border/10 pt-4 block">
                        Stripe merchant ledger: <code className="text-foreground text-[9px] bg-secondary px-1.5 py-0.5 rounded font-mono select-all">{profile?.stripe_connect_id}</code>
                      </div>
                    ) : (
                      <Button
                        onClick={handleOnboardStripe}
                        disabled={onboardingLoading}
                        className="w-full rounded-2xl py-4.5 font-bold text-xs bg-[#FF9500] hover:bg-[#e08300] text-white border-0 cursor-pointer shadow-md h-auto hover:scale-[1.01] active:scale-[0.99] transition-transform"
                      >
                        {onboardingLoading ? <Loader2 size={13} className="animate-spin" /> : <Lock size={12} />} Connect Stripe Gateway
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Transaction Ledger Table */}
              <div className="p-8 rounded-3xl bg-card border border-border/30 shadow-sm mt-6">
                <div className="flex justify-between items-center mb-6 border-b border-border/10 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Escrow Ledger Logs</h3>
                    <p className="text-[11px] text-muted-foreground">Detailed records of Stripe funding holds, creator payouts, and mock refund credits.</p>
                  </div>
                </div>

                {transactions.length === 0 ? (
                  <div className="py-12 text-center flex flex-col items-center justify-center">
                    <HelpCircle size={28} className="text-muted-foreground/35 mb-3" />
                    <p className="text-xs text-muted-foreground">No ledger transactions found yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-[9px] font-bold text-muted-foreground uppercase border-b border-border/10 pb-2">
                          <th className="pb-3 pr-4">Transaction / Campaign Context</th>
                          <th className="pb-3 px-4">Type</th>
                          <th className="pb-3 px-4">Status</th>
                          <th className="pb-3 px-4">Ledger Date</th>
                          <th className="pb-3 pl-4 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/5 text-xs">
                        {transactions.map((tx) => (
                          <tr 
                            key={tx.id} 
                            className="hover:bg-secondary/15 transition-colors"
                          >
                            {/* Context */}
                            <td className="py-4 pr-4 font-semibold text-foreground">
                              {tx.campaignTitle || "Campaign Escrow Ledger"}
                              <span className="block text-[10px] text-muted-foreground font-normal mt-0.5 select-all font-mono">
                                PI: {tx.stripe_payment_intent_id || tx.id}
                              </span>
                            </td>
                            
                            {/* Type */}
                            <td className="py-4 px-4">
                              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                tx.type === "escrow" 
                                  ? "bg-[#FF9500]/10 text-[#FF9500] border border-[#FF9500]/15" 
                                  : tx.type === "release"
                                  ? "bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/15"
                                  : tx.type === "payout"
                                  ? "bg-[#AF52DE]/10 text-[#AF52DE] border border-[#AF52DE]/15"
                                  : "bg-secondary text-muted-foreground"
                              }`}>
                                {tx.type}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="py-4 px-4">
                              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                tx.status === "succeeded" 
                                  ? "bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/15" 
                                  : tx.status === "pending"
                                  ? "bg-[#007AFF]/10 text-[#007AFF] border border-[#007AFF]/15"
                                  : "bg-destructive/10 text-destructive border border-destructive/15"
                              }`}>
                                {tx.status}
                              </span>
                            </td>

                            {/* Date */}
                            <td className="py-4 px-4 text-muted-foreground font-medium">
                              {new Date(tx.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </td>

                            {/* Amount */}
                            <td className={`py-4 pl-4 text-right font-bold text-sm ${
                              tx.type === "payout" ? "text-destructive/80" : "text-foreground"
                            }`}>
                              {tx.type === "payout" ? "-" : "+"}
                              ${Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      )}
    </div>
  );
}
