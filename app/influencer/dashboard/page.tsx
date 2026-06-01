"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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
  ArrowUpRight, 
  Bell,
  CheckCircle2,
  Calendar,
  Lock,
  Wallet,
  Grid,
  BarChart3,
  Eye,
  Share2,
  ThumbsUp,
  MessageSquare,
  Mail,
  ChevronRight,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getClientProfile } from "@/lib/supabase/client";
import { startStripeOnboardingAction } from "@/lib/stripe/actions";
import WalletUI from "@/components/wallet-ui";
import { Profile } from "@/types";
import { useTransactions, usePosts } from "@/lib/supabase/metrics";
import { useTranslation } from "@/lib/translations";

const mockInvites = [
  {
    id: "inv_1",
    brand: "Apple Premium Reseller",
    campaign: "iPad Pro Creator Flow",
    offer: 1800,
    status: "pending",
    daysLeft: 3
  },
  {
    id: "inv_2",
    brand: "Aether Labs",
    campaign: "Aether Lifestyle Launch",
    offer: 4500,
    status: "escrowed",
    daysLeft: 12
  }
];

export default function InfluencerDashboard() {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "trends" | "wallet">("overview");
  const [user, setUser] = useState<Profile | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const { transactions, balances, refresh: refreshTransactions } = useTransactions();
  const { posts, aggregateMetrics, refresh: refreshPosts } = usePosts();

  // --- SOCIAL VERIFICATION AND MOCK MAILBOX STATES ---
  const [platformVerifying, setPlatformVerifying] = useState<string | null>(null);
  const [verificationStep, setVerificationStep] = useState<"popup" | "loading" | "complete">("popup");
  const [showMailbox, setShowMailbox] = useState(false);
  const [mailboxEmails, setMailboxEmails] = useState<any[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
  
  // Verification metrics mock
  const [verifiedPlatforms, setVerifiedPlatforms] = useState<Record<string, string>>({
    tiktok: "@marcusv.tiktok"
  });

  const loadVerificationData = () => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("aether-verified-platforms");
      if (stored) {
        setVerifiedPlatforms(JSON.parse(stored));
      } else {
        localStorage.setItem("aether-verified-platforms", JSON.stringify({ tiktok: "@marcusv.tiktok" }));
      }
    }
  };

  const loadMailboxEmails = () => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("aether-mock-sent-emails");
      setMailboxEmails(stored ? JSON.parse(stored) : []);
    }
  };

  useEffect(() => {
    loadVerificationData();
    loadMailboxEmails();

    const handleEmailSync = () => {
      loadMailboxEmails();
    };
    window.addEventListener("aether-emails-sync", handleEmailSync);
    return () => window.removeEventListener("aether-emails-sync", handleEmailSync);
  }, []);

  const handleVerifyPlatform = (platform: string) => {
    setPlatformVerifying(platform);
    setVerificationStep("popup");
  };

  const executePlatformVerification = async () => {
    setVerificationStep("loading");
    
    // Simulate OAuth API retrieval delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    const handle = platformVerifying === "instagram" ? "@marcusv" : platformVerifying === "youtube" ? "marcusvance" : "@marcusv.tiktok";
    const updated = {
      ...verifiedPlatforms,
      [platformVerifying!.toLowerCase()]: handle
    };
    
    setVerifiedPlatforms(updated);
    localStorage.setItem("aether-verified-platforms", JSON.stringify(updated));
    
    // Dynamically increase user profile metrics in localStorage
    if (user) {
      const curFollowers = user.followers || 48500;
      const addedFollowers = platformVerifying === "instagram" ? 15000 : platformVerifying === "youtube" ? 64000 : 25000;
      
      const updatedUser = {
        ...user,
        followers: curFollowers + addedFollowers,
        engagement_rate: Math.min(8.5, (user.engagement_rate || 4.8) + 0.35)
      };
      
      localStorage.setItem(`aether-profile-${user.id}`, JSON.stringify(updatedUser));
      window.dispatchEvent(new Event("storage"));
    }

    setVerificationStep("complete");
    toast.success(`${platformVerifying} connected successfully!`, {
      description: `Synced follower analytics and engagement rates.`
    });
    
    setTimeout(() => {
      setPlatformVerifying(null);
    }, 1500);
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
    setMounted(true);
    loadAll();

    // Listen to profile updates (like Stripe callbacks)
    const handleProfileUpdate = () => {
      loadAll();
    };
    window.addEventListener("role-change", handleProfileUpdate);
    window.addEventListener("storage", handleProfileUpdate);
    window.addEventListener("aether-metrics-update", handleProfileUpdate);
    window.addEventListener("aether-transactions-update", handleProfileUpdate);
    window.addEventListener("aether-posts-update", handleProfileUpdate);
    
    return () => {
      window.removeEventListener("role-change", handleProfileUpdate);
      window.removeEventListener("storage", handleProfileUpdate);
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
    } catch (err: any) {
      toast.error(err.message || "An error occurred connecting to Stripe.", { id: "stripe-onboard" });
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
    const monthlyEarnings: Record<string, number> = {
      Jan: 1200,
      Feb: 2400,
      Mar: 1800,
      Apr: 3900,
      May: 4200,
      Jun: 5800
    };

    transactions.forEach((tx) => {
      if (tx.status !== "succeeded") return;
      if (tx.type !== "release") return;
      
      const date = new Date(tx.created_at);
      const mName = months[date.getMonth()];
      
      if (monthlyEarnings[mName] !== undefined) {
        if (tx.id.startsWith("tx_mock_") || tx.id.startsWith("tx_stripe_")) {
          monthlyEarnings[mName] += tx.amount;
        }
      }
    });

    return months.map(m => ({
      month: m,
      earnings: monthlyEarnings[m]
    }));
  };

  const earningsData = getEarningsChartData();
  const totalEarnings = transactions.filter(t => t.type === "release" && t.status === "succeeded").reduce((sum, t) => sum + t.amount, 0) || 19300;
  const engagementRate = aggregateMetrics.engagement_rate || user?.engagement_rate || 4.82;

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
            {user?.full_name ? `${user.full_name.split(" ")[0]}'s ${t("Creator Hub")}` : `Marcus's ${t("Work Center")}`}
          </h1>
        </div>
        
        {isStripeConnected ? (
          <div className="bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/30 rounded-full px-5 py-2.5 flex items-center gap-2 text-xs font-bold select-none">
            <CheckCircle2 size={14} /> Stripe Connect Verified
          </div>
        ) : (
          <Button 
            onClick={handleOnboardStripe}
            disabled={onboardingLoading}
            className="rounded-full px-6 py-6 font-semibold bg-[#34C759] hover:bg-[#30b551] text-white hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer gap-2 border-0 shadow-md"
          >
            <Lock size={16} /> {t("Setup Stripe Payouts")}
          </Button>
        )}
      </div>

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
            {t("Performance")}
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
                  <h3 className="text-3xl font-bold tracking-tight">48.5K</h3>
                  <span className="text-xs text-[#34C759] font-semibold flex items-center gap-1 mt-1.5">
                    +4.2% <ArrowUpRight size={12} /> {t("this month").includes("month") ? "this month" : "questo mese"}
                  </span>
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
                  <h3 className="text-3xl font-bold tracking-tight">Tech</h3>
                  <span className="text-xs text-muted-foreground font-medium block mt-1.5">
                    #MinimalistSetups tags
                  </span>
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
              {/* Earnings Chart */}
              <motion.div 
                variants={cardVariants}
                className="lg:col-span-2 p-8 apple-card flex flex-col justify-between min-h-[380px]"
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

              {/* Brand Offers */}
              <motion.div 
                variants={cardVariants}
                className="p-8 apple-card flex flex-col justify-between"
              >
                <div>
                  <h2 className="text-xl font-bold tracking-tight mb-1">{t("Campaign Invites")}</h2>
                  <p className="text-xs text-muted-foreground mb-8">{t("Review sponsorship terms and lock deposits.")}</p>
                  
                  <div className="space-y-4">
                    {mockInvites.map((invite) => (
                      <motion.div 
                        key={invite.id}
                        whileHover={{ scale: 1.015, x: 2 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      >
                        <Link href={`/campaigns/${invite.id === "inv_2" ? "camp_2" : "camp_1"}`} className="block group">
                          <div className="p-4 rounded-2xl bg-secondary/30 border border-border/10 group-hover:bg-secondary/60 transition-all">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className="text-sm font-semibold truncate max-w-[150px]">{invite.brand}</h4>
                                <span className="text-[11px] text-muted-foreground">{invite.campaign}</span>
                              </div>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                invite.status === "pending" 
                                  ? "bg-[#007AFF]/10 text-[#007AFF]" 
                                  : "bg-[#FF9500]/10 text-[#FF9500]"
                              }`}>
                                {t(invite.status)}
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground flex justify-between items-center mt-3.5 pt-2.5 border-t border-border/5">
                              <span className="flex items-center gap-1"><Calendar size={12} /> {invite.daysLeft} {t("days left").includes("days") ? "days left" : "giorni rimasti"}</span>
                              <span className="font-bold text-foreground">${invite.offer}</span>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <Link href="/campaigns" className="block mt-8">
                  <Button variant="ghost" className="w-full text-xs hover:bg-secondary font-semibold rounded-2xl py-6 cursor-pointer">
                    {t("Manage all invitations")}
                  </Button>
                </Link>
              </motion.div>
            </motion.div>

            {/* Social Verification & Developer Tools Row */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6"
            >
              {/* Social Verification Card */}
              <motion.div
                variants={cardVariants}
                whileHover={{ y: -2 }}
                className="p-8 apple-card flex flex-col justify-between"
              >
                <div>
                  <h3 className="text-lg font-bold tracking-tight mb-1">Social Accounts Verification</h3>
                  <p className="text-xs text-muted-foreground mb-6">Link your platforms via secure mock-OAuth to verify reach stats and unlock premium campaigns.</p>
                  
                  <div className="space-y-4">
                    {/* Instagram */}
                    <div className="flex justify-between items-center p-3 bg-secondary/35 rounded-2xl border border-border/10">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#E1306C]/10 text-[#E1306C] flex items-center justify-center font-bold text-sm">IG</div>
                        <div>
                          <p className="text-xs font-bold leading-none">Instagram</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{verifiedPlatforms.instagram || "Not Connected"}</p>
                        </div>
                      </div>
                      {verifiedPlatforms.instagram ? (
                        <span className="text-[9px] font-bold text-[#34C759] uppercase bg-[#34C759]/10 px-2 py-0.5 rounded-full border border-[#34C759]/10">Verified</span>
                      ) : (
                        <button
                          onClick={() => handleVerifyPlatform("Instagram")}
                          className="px-3.5 py-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-full text-[10px] font-bold cursor-pointer"
                        >
                          Verify Account
                        </button>
                      )}
                    </div>

                    {/* TikTok */}
                    <div className="flex justify-between items-center p-3 bg-secondary/35 rounded-2xl border border-border/10">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">TT</div>
                        <div>
                          <p className="text-xs font-bold leading-none">TikTok</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{verifiedPlatforms.tiktok || "Not Connected"}</p>
                        </div>
                      </div>
                      {verifiedPlatforms.tiktok ? (
                        <span className="text-[9px] font-bold text-[#34C759] uppercase bg-[#34C759]/10 px-2 py-0.5 rounded-full border border-[#34C759]/10">Verified</span>
                      ) : (
                        <button
                          onClick={() => handleVerifyPlatform("TikTok")}
                          className="px-3.5 py-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-full text-[10px] font-bold cursor-pointer"
                        >
                          Verify Account
                        </button>
                      )}
                    </div>

                    {/* YouTube */}
                    <div className="flex justify-between items-center p-3 bg-secondary/35 rounded-2xl border border-border/10">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#FF0000]/10 text-[#FF0000] flex items-center justify-center font-bold text-sm">YT</div>
                        <div>
                          <p className="text-xs font-bold leading-none">YouTube</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{verifiedPlatforms.youtube || "Not Connected"}</p>
                        </div>
                      </div>
                      {verifiedPlatforms.youtube ? (
                        <span className="text-[9px] font-bold text-[#34C759] uppercase bg-[#34C759]/10 px-2 py-0.5 rounded-full border border-[#34C759]/10">Verified</span>
                      ) : (
                        <button
                          onClick={() => handleVerifyPlatform("YouTube")}
                          className="px-3.5 py-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-full text-[10px] font-bold cursor-pointer"
                        >
                          Verify Account
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Developer Inbox Tool Card */}
              <motion.div
                variants={cardVariants}
                whileHover={{ y: -2 }}
                className="p-8 apple-card flex flex-col justify-between"
              >
                <div>
                  <h3 className="text-lg font-bold tracking-tight mb-1 flex items-center gap-2">
                    <Mail size={18} className="text-[#5856D6]" /> Mock Developer Mailbox
                  </h3>
                  <p className="text-xs text-muted-foreground mb-6">Inspect outgoing Resend campaign and payment transaction emails triggered locally.</p>
                  
                  <div className="bg-secondary/40 border border-border/10 rounded-2xl p-4 flex flex-col justify-between h-44">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-semibold">Emails Generated:</span>
                        <span className="font-extrabold text-foreground">{mailboxEmails.length} messages</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-semibold">Resend API Mode:</span>
                        <span className="text-[9px] font-bold text-foreground bg-secondary px-2 py-0.5 rounded-full">Developer Sandbox</span>
                      </div>
                    </div>

                    <Button
                      onClick={() => setShowMailbox(true)}
                      className="w-full rounded-xl text-xs py-2 bg-[#5856D6] hover:bg-[#4846c4] text-white font-bold cursor-pointer"
                    >
                      Open Email Console ({mailboxEmails.length})
                    </Button>
                  </div>
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
                  <h3 className="text-3xl font-bold tracking-tight">{(user?.followers || 48500).toLocaleString()}</h3>
                  <span className="text-[10px] text-muted-foreground mt-1.5 block font-medium">Aggregated profile traffic</span>
                </div>
              </div>
              
              <div className="p-8 flex flex-col justify-between apple-card">
                <div className="flex justify-between items-start text-muted-foreground">
                  <span className="text-xs font-bold uppercase tracking-wider">Total Impressions</span>
                  <span className="p-2.5 rounded-2xl bg-[#34C759]/10 text-[#34C759]"><Eye size={16} /></span>
                </div>
                <div className="mt-6">
                  <h3 className="text-3xl font-bold tracking-tight">{(aggregateMetrics.impressions || 56000).toLocaleString()}</h3>
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
                  <h3 className="text-3xl font-bold tracking-tight">$12,700</h3>
                  <span className="text-[10px] text-muted-foreground mt-1.5 block font-medium">Attributed sales generated</span>
                </div>
              </div>
            </div>

            {/* Performance Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 p-8 apple-card min-h-[380px] flex flex-col justify-between">
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
                              Impressions: p.metrics.impressions || 15000,
                              Reach: p.metrics.reach || 12000
                            }))
                          : [
                              { name: "Workspace Review", Impressions: 18000, Reach: 15000 },
                              { name: "Lifestyle Launch", Impressions: 38000, Reach: 32000 }
                            ]
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

              <div className="p-8 apple-card flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#FF9500] tracking-wider bg-[#FF9500]/10 px-2 py-0.5 rounded-full">AI Creator Insights</span>
                  <h3 className="text-lg font-bold mt-3 mb-1 tracking-tight">Growth Recommendations</h3>
                  <p className="text-xs text-muted-foreground mb-6">Suggestions based on your Aether performance metrics.</p>
                  
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border/10">
                      <p className="text-xs font-bold text-foreground">Aesthetic Setups convert higher</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                        Workspace reviews with clean setups generate 2.5x more click conversions compared to stories. Focus on horizontal videos.
                      </p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border/10">
                      <p className="text-xs font-bold text-foreground">Optimize your Reel description</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                        Adding dynamic product specs in descriptions increased CTR from 3.1% to 5.2%. Use specific UTM templates.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground pt-4 border-t border-border/5 text-center font-medium">
                  Last updated: Just now
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

      {/* Platform OAuth Mock Popup Modal */}
      <AnimatePresence>
        {platformVerifying && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={appleSpring}
              className="bg-card border border-border/40 w-full max-w-md rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col"
            >
              {/* Glossy background circle */}
              <div className="absolute top-[-30px] right-[-30px] w-24 h-24 bg-primary/10 rounded-full blur-xl pointer-events-none" />

              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-[10px] text-primary uppercase font-bold tracking-wider">OAuth Secure Login</span>
                  <h3 className="text-xl font-bold tracking-tight mt-1">Connect {platformVerifying}</h3>
                </div>
                <button
                  onClick={() => setPlatformVerifying(null)}
                  className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/75 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X size={14} className="text-muted-foreground" />
                </button>
              </div>

              {verificationStep === "popup" && (
                <div className="space-y-6">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Aether requests authorization to retrieve your audience demographics, follower metrics, and read engagements. This information compiles your Media Kit.
                  </p>
                  
                  <div className="p-4 bg-secondary/35 rounded-2xl border border-border/5 space-y-3">
                    <h5 className="text-xs font-bold">Permissions requested:</h5>
                    <div className="space-y-2 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-[#34C759] rounded-full" /> Read follower metrics & handles
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-[#34C759] rounded-full" /> Fetch engagement insights on posts
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 bg-[#34C759] rounded-full" /> Read demographics data
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={executePlatformVerification}
                      className="flex-1 rounded-2xl py-3 text-xs font-bold bg-[#34C759] hover:bg-[#30b551] text-white cursor-pointer"
                    >
                      Authorize & Link
                    </Button>
                    <Button
                      onClick={() => setPlatformVerifying(null)}
                      variant="secondary"
                      className="flex-1 rounded-2xl py-3 text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {verificationStep === "loading" && (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="w-10 h-10 border-4 border-[#34C759] border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-semibold animate-pulse text-foreground">Syncing metrics with {platformVerifying} API...</p>
                  <p className="text-[10px] text-muted-foreground">Retrieving profile and calculating audience authenticity scores...</p>
                </div>
              )}

              {verificationStep === "complete" && (
                <div className="py-8 flex flex-col items-center justify-center space-y-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/25 flex items-center justify-center">
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Connection Successful!</h4>
                    <p className="text-xs text-muted-foreground mt-1">Platform successfully linked. Metric gains applied to dashboard.</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mock Developer Mailbox Modal */}
      <AnimatePresence>
        {showMailbox && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={appleSpring}
              className="bg-card border border-border/40 w-full max-w-4xl h-[600px] rounded-3xl p-6 shadow-2xl flex flex-col overflow-hidden text-foreground"
            >
              {/* Header */}
              <div className="flex justify-between items-center pb-4 border-b border-border/10">
                <div>
                  <h3 className="text-lg font-bold tracking-tight flex items-center gap-1.5">
                    <Mail size={18} className="text-[#5856D6]" /> Mock Resend Inbox
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Sandbox logs capturing all outbound transactional emails sent in mock mode.</p>
                </div>
                <button
                  onClick={() => {
                    setShowMailbox(false);
                    setSelectedEmail(null);
                  }}
                  className="w-7 h-7 rounded-full bg-secondary hover:bg-secondary/75 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X size={14} className="text-muted-foreground" />
                </button>
              </div>

              {/* Grid split pane */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border/10 overflow-hidden mt-4">
                
                {/* Left side: Emails list (2 cols) */}
                <div className="md:col-span-2 overflow-y-auto pr-2 space-y-2 max-h-[460px]">
                  {mailboxEmails.length === 0 ? (
                    <div className="py-20 text-center text-muted-foreground">
                      <Mail size={24} className="mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-xs font-semibold">Inbox is empty</p>
                      <p className="text-[9px] mt-1">Send campaigns or fund contracts to trigger notification emails.</p>
                    </div>
                  ) : (
                    mailboxEmails.map((email) => (
                      <div
                        key={email.id}
                        onClick={() => setSelectedEmail(email)}
                        className={`p-3.5 rounded-2xl border text-left cursor-pointer transition-all ${
                          selectedEmail?.id === email.id
                            ? "bg-primary/10 border-primary/20"
                            : "bg-secondary/35 border-border/5 hover:bg-secondary/60"
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[8px] font-bold text-primary uppercase bg-primary/15 border border-primary/10 px-2 py-0.5 rounded-full capitalize">{email.type.replace("_", " ")}</span>
                          <span className="text-[8px] text-muted-foreground">{new Date(email.sentAt).toLocaleTimeString()}</span>
                        </div>
                        <h4 className="text-xs font-bold mt-2 truncate text-foreground">{email.subject}</h4>
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">To: {email.to}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Right side: HTML render view (3 cols) */}
                <div className="md:col-span-3 overflow-y-auto pl-0 md:pl-4 pt-4 md:pt-0 max-h-[460px]">
                  {selectedEmail ? (
                    <div className="border border-border/10 rounded-2xl bg-white p-6 shadow-sm overflow-hidden min-h-[300px]">
                      <div className="border-b border-gray-100 pb-3 mb-4 text-xs text-gray-500 font-sans space-y-1">
                        <div><strong className="text-gray-700">Subject:</strong> {selectedEmail.subject}</div>
                        <div><strong className="text-gray-700">To:</strong> {selectedEmail.to}</div>
                        <div><strong className="text-gray-700">Sent:</strong> {new Date(selectedEmail.sentAt).toLocaleString()}</div>
                      </div>
                      <div 
                        className="html-preview" 
                        dangerouslySetInnerHTML={{ __html: selectedEmail.html }} 
                      />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground text-center p-8 bg-secondary/10 rounded-2xl border border-dashed border-border/10">
                      <ChevronRight size={24} className="mb-2 text-muted-foreground/30" />
                      <p className="text-xs font-semibold">Select an email</p>
                      <p className="text-[10px] text-muted-foreground mt-1">Select a message from the list on the left to inspect its rendered layout.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
