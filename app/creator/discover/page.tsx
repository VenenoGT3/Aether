"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Check,
  Clock,
  DollarSign,
  Eye,
  FileText,
  Megaphone,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  User,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  CreatorActionButton,
  CreatorEmptyState,
  CreatorGlassCard,
  CreatorPageShell,
  CreatorSectionHeader,
  CreatorStatusPill,
} from "@/components/creator/creator-ui";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CAMPAIGN_CATEGORY_LABELS } from "@/lib/campaign-category";
import { apiGet, apiPost } from "@/lib/api/client";
import { formatMoney, formatMoneyCompact } from "@/lib/currency";
import { getClientProfile, supabase } from "@/lib/supabase/client";
import { useJoinedCampaigns } from "@/lib/supabase/clips";
import { useTranslation } from "@/lib/translations";
import type { Profile } from "@/types";

interface Campaign {
  id: string;
  title: string;
  description: string;
  businessName: string;
  budget_total: number;
  target_niches: string[];
  deliverables: { type: string; quantity: number; description?: string }[];
  timeline: { start_date: string; end_date: string };
  payout_speed: string;
  days_left: number;
  image_url: string;
  matchScore?: number;
  matchingReason?: string;
  campaign_type?: "fixed" | "performance";
  campaign_category?: "ugc" | "clipping" | null;
  cpm_rate?: number | null;
  platforms?: string[] | null;
  pool_total?: number | null;
  pool_used?: number | null;
}

interface RawSearchCampaign {
  id: string;
  title: string;
  description?: string;
  budget_total: number;
  target_niches: string[];
  deliverables?: Campaign["deliverables"];
  timeline?: Campaign["timeline"];
  campaign_type?: "fixed" | "performance";
  campaign_category?: "ugc" | "clipping" | null;
  brand_cpm_rate?: number | null;
  cpm_rate?: number | null;
  platforms?: string[] | null;
  budget_pool?: number | null;
  available_pool?: number | null;
  budget_reserved?: number | null;
  budget_paid?: number | null;
}

type CreatorProfileForAi = Profile & {
  niches?: string[];
  niche?: string;
  follower_count?: number;
  followers?: number;
};

function daysLeft(timeline?: { end_date: string }) {
  if (!timeline?.end_date) return 30;
  const diff = new Date(timeline.end_date).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function campaignLogo(campaign: Campaign) {
  const niche = campaign.target_niches[0]?.toLowerCase() || "";
  if (niche.includes("fashion")) return "FW";
  if (niche.includes("food")) return "FD";
  if (niche.includes("beauty")) return "BT";
  if (niche.includes("fitness")) return "FT";
  if (niche.includes("travel")) return "TR";
  return "AE";
}

function performanceSubmissionHref(campaign: Campaign) {
  const base = campaign.campaign_category === "ugc" ? "/creator/ugc" : "/creator/clips";
  return `${base}?campaign=${campaign.id}`;
}

function performanceSubmitLabel(campaign: Campaign) {
  return campaign.campaign_category === "ugc" ? "Submit UGC" : "Submit clip";
}

function performanceJoinLabel(campaign: Campaign) {
  return campaign.campaign_category === "ugc" ? "Join UGC Brief" : "Join Clipping Brief";
}

export default function DiscoverPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<Profile | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [appliedCampaignIds, setAppliedCampaignIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNiche, setSelectedNiche] = useState<string>("All");
  const [selectedBudget, setSelectedBudget] = useState<string>("All");
  const [selectedSpeed, setSelectedSpeed] = useState<string>("All");
  const [selectedType, setSelectedType] = useState<string>("All");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const { joinedIds, join } = useJoinedCampaigns();
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinModalCampaign, setJoinModalCampaign] = useState<Campaign | null>(null);
  const [proposedPayout, setProposedPayout] = useState<number>(0);
  const [socialHandle, setSocialHandle] = useState("");
  const [pitchText, setPitchText] = useState("");
  const [pitchTone, setPitchTone] = useState<"professional" | "energetic" | "creative">("professional");
  const [isAILoading, setIsAILoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const profile = await getClientProfile();
      setUser(profile);

      if (profile?.social_handle) {
        setSocialHandle(profile.social_handle);
      }

      const searchData = await apiGet<{ campaigns: RawSearchCampaign[] }>(
        "/api/campaigns/search?page=1&limit=50"
      );
      const rawCamps = (searchData.campaigns || [])
        .filter((c) => (c.platforms ?? []).includes("youtube"))
        .map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description || "",
        businessName: "Brand",
        budget_total: Number(c.budget_total),
        target_niches: c.target_niches || [],
        deliverables: c.deliverables || [],
        timeline: c.timeline || { start_date: "", end_date: "" },
        payout_speed: c.campaign_type === "performance" ? "Pay per view" : "Instant Escrow",
        days_left: daysLeft(c.timeline),
        image_url: c.target_niches.includes("Tech")
          ? "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80"
          : c.target_niches.includes("Fashion")
            ? "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=80"
            : "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80",
        campaign_type: c.campaign_type,
        campaign_category: c.campaign_category,
        platforms: c.platforms,
        cpm_rate:
          c.brand_cpm_rate != null
            ? Number(c.brand_cpm_rate)
            : c.cpm_rate != null
              ? Number(c.cpm_rate)
              : null,
        pool_total: c.available_pool ?? c.budget_pool ?? null,
        pool_used: Number(c.budget_reserved ?? 0) + Number(c.budget_paid ?? 0),
      })) satisfies Campaign[];

      if (profile) {
        const { data: parts } = await supabase
          .from("participations")
          .select("campaign_id")
          .eq("influencer_id", profile.user_id);
        setAppliedCampaignIds(new Set<string>((parts || []).map((p) => p.campaign_id)));

        const profileForAi = profile as CreatorProfileForAi;
        const creatorNiches = profileForAi.niches?.length
          ? profileForAi.niches
          : profileForAi.niche
            ? [profileForAi.niche]
            : [];

        try {
          const matchData = await apiPost<{ success: boolean; campaigns?: Campaign[] }>(
            "/api/ai/discover",
            {
              creator: {
                name: profile.full_name || "Creator",
                bio: profile.bio || "",
                niches: creatorNiches,
                followers: Number(profileForAi.follower_count ?? profileForAi.followers ?? 0),
                engagement: Number(profile.engagement_rate) || 0,
              },
              campaigns: rawCamps,
            }
          );
          setCampaigns(matchData.success && matchData.campaigns ? matchData.campaigns : rawCamps);
        } catch {
          setCampaigns(rawCamps);
        }
      } else {
        setCampaigns(rawCamps);
      }
    } catch (error) {
      console.error("Error loading discover data:", error);
      toast.error(t("Failed to load campaigns."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadData();
    const handleSync = () => {
      loadData();
    };
    window.addEventListener("aether-campaigns-update", handleSync);
    window.addEventListener("role-change", handleSync);
    return () => {
      window.removeEventListener("aether-campaigns-update", handleSync);
      window.removeEventListener("role-change", handleSync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- page-level data bootstrap
  }, []);

  const triggerConfetti = () => {
    confetti({
      particleCount: 140,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#4d8eff", "#34d399", "#f59e0b", "#9f8dfa"],
    });
  };

  const handleExpressInterest = async (campaign: Campaign) => {
    toast.loading(t("Sending quick application..."), { id: "express-interest" });
    try {
      await apiPost(`/api/campaigns/${campaign.id}/apply`, {
        proposed_payout: campaign.budget_total,
      });

      setAppliedCampaignIds((prev) => new Set([...prev, campaign.id]));
      window.dispatchEvent(new Event("aether-campaigns-update"));
      toast.success(t("Interest expressed!"), {
        id: "express-interest",
        description: t("Your stats and rate card have been sent to the brand."),
      });
      triggerConfetti();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Failed to submit quick application"), {
        id: "express-interest",
      });
    }
  };

  const confirmJoin = async () => {
    if (!joinModalCampaign) return;
    const campaign = joinModalCampaign;
    setJoiningId(campaign.id);
    const res = await join(campaign.id);
    setJoiningId(null);
    if (res.ok) {
      setJoinModalCampaign(null);
      window.dispatchEvent(new Event("aether-campaigns-update"));
      toast.success(
        res.alreadyJoined
          ? t("You've already joined this campaign.")
          : t("Joined! Head to {flow} to submit work.").replace(
              "{flow}",
              t(campaign.campaign_category === "ugc" ? "UGC Posts" : "Clips & Earnings")
            ),
        {
          description:
            campaign.campaign_type === "performance"
              ? t("Opening the source kit.")
              : campaign.title,
        }
      );
      if (campaign.campaign_type === "performance") {
        router.push(performanceSubmissionHref(campaign));
      }
    } else {
      toast.error(res.error || t("Could not join campaign."));
    }
  };

  const openApplyModal = (campaign: Campaign) => {
    if (campaign.campaign_type === "performance") {
      setJoinModalCampaign(campaign);
      return;
    }
    setSelectedCampaign(campaign);
    setProposedPayout(campaign.budget_total);
    setPitchText("");
    setPitchTone("professional");
    setIsApplyModalOpen(true);
  };

  const handleAIGeneratePitch = async () => {
    if (!selectedCampaign) return;
    if (!user) {
      toast.error(t("Create a creator profile before generating a pitch."));
      return;
    }

    setIsAILoading(true);
    toast.loading(t("Aether AI is writing your pitch..."), { id: "ai-pitch" });

    try {
      const profileForAi = user as CreatorProfileForAi;
      const creatorNiches = profileForAi.niches?.length
        ? profileForAi.niches
        : profileForAi.niche
          ? [profileForAi.niche]
          : [];
      const data = await apiPost<{ pitch?: string; generatedBy?: string }>("/api/ai/pitch", {
        campaign: {
          title: selectedCampaign.title,
          description: selectedCampaign.description,
          niches: selectedCampaign.target_niches,
          budget: selectedCampaign.budget_total,
          brandName: selectedCampaign.businessName,
        },
        creator: {
          name: user.full_name || "Creator",
          bio: user.bio || "",
          niches: creatorNiches,
          followers: Number(profileForAi.follower_count ?? profileForAi.followers ?? 0),
          engagement: Number(user.engagement_rate) || 0,
        },
        tone: pitchTone,
      });
      setPitchText(data.pitch || "");
      toast.success(t("AI pitch ready!"), {
        id: "ai-pitch",
        description: data.generatedBy === "grok" ? t("Written with Grok 4.3.") : t("Loaded matching template."),
      });
    } catch {
      toast.error(t("AI Assistant is offline. Please write manually."), { id: "ai-pitch" });
    } finally {
      setIsAILoading(false);
    }
  };

  const handleApplySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCampaign) return;
    setIsSubmitting(true);

    toast.loading(t("Submitting application..."), { id: "apply" });
    try {
      await apiPost(`/api/campaigns/${selectedCampaign.id}/apply`, {
        proposed_payout: proposedPayout,
        pitch: pitchText.trim() || undefined,
      });

      setAppliedCampaignIds((prev) => new Set([...prev, selectedCampaign.id]));
      setIsApplyModalOpen(false);
      window.dispatchEvent(new Event("aether-campaigns-update"));
      toast.success(t("Application submitted successfully!"), {
        id: "apply",
        description: t("The brand has been notified and will review your pitch."),
      });
      triggerConfetti();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Failed to submit application"), { id: "apply" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const allNiches = ["All", "Tech", "Fashion", "Food", "Fitness", "Travel", "Beauty", "Minimalism"];

  const filteredCampaigns = campaigns.filter((campaign) => {
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const matches =
        campaign.title.toLowerCase().includes(query) ||
        campaign.businessName.toLowerCase().includes(query) ||
        campaign.description.toLowerCase().includes(query);
      if (!matches) return false;
    }
    if (selectedNiche !== "All") {
      const hasNiche = campaign.target_niches.some((niche) => niche.toLowerCase() === selectedNiche.toLowerCase());
      if (!hasNiche) return false;
    }
    if (selectedBudget !== "All") {
      const budget = campaign.budget_total;
      if (selectedBudget === "low" && budget >= 4000) return false;
      if (selectedBudget === "mid" && (budget < 4000 || budget >= 8000)) return false;
      if (selectedBudget === "high" && budget < 8000) return false;
    }
    if (selectedType !== "All") {
      const hasType = campaign.deliverables.some((d) => d.type.toLowerCase().includes(selectedType.toLowerCase()));
      if (!hasType) return false;
    }
    if (selectedSpeed !== "All") {
      if (selectedSpeed === "escrow" && campaign.payout_speed !== "Instant Escrow") return false;
      if (selectedSpeed === "standard" && campaign.payout_speed === "Instant Escrow") return false;
    }
    if (selectedCategory !== "All" && campaign.campaign_category !== selectedCategory) return false;
    return true;
  });

  const recommendedCampaigns = campaigns.filter((campaign) => !appliedCampaignIds.has(campaign.id)).slice(0, 2);
  const filtersActive =
    selectedNiche !== "All" ||
    selectedBudget !== "All" ||
    selectedSpeed !== "All" ||
    selectedType !== "All" ||
    selectedCategory !== "All" ||
    !!searchQuery;

  const resetFilters = () => {
    setSelectedNiche("All");
    setSelectedBudget("All");
    setSelectedSpeed("All");
    setSelectedType("All");
    setSelectedCategory("All");
    setSearchQuery("");
  };

  return (
    <CreatorPageShell>
      <CreatorSectionHeader
        eyebrow={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
        title={t("Discover")}
        description={t("Browse active brand pools, compare CPM terms, and apply with a real Aether creator profile.")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <CreatorActionButton href="/creator/ugc" variant="secondary">
              <FileText size={15} className="text-[var(--creator-warning)]" />
              {t("UGC Posts")}
            </CreatorActionButton>
            <CreatorActionButton href="/creator/clips" variant="secondary">
              <Scissors size={15} className="text-[var(--creator-success)]" />
              {t("Clipping")}
            </CreatorActionButton>
          </div>
        }
      />

      {loading ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <CreatorGlassCard key={item} className="h-72 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {recommendedCampaigns.length > 0 ? (
            <section className="mt-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                  <Sparkles size={18} className="text-[var(--creator-warning)]" />
                  {t("For You")}
                </h2>
                <span className="text-xs font-semibold text-white/45">{t("Based on your media kit")}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {recommendedCampaigns.map((campaign) => (
                  <button
                    key={campaign.id}
                    onClick={() => openApplyModal(campaign)}
                    className="creator-glass group relative min-h-64 overflow-hidden rounded-2xl text-left transition-all hover:-translate-y-1 hover:border-white/15"
                  >
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-55 transition-transform duration-700 group-hover:scale-105"
                      style={{ backgroundImage: `url(${campaign.image_url})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,13,30,0.96)] via-[rgba(7,13,30,0.68)] to-[rgba(7,13,30,0.10)]" />
                    <div className="relative z-10 flex h-full min-h-64 flex-col justify-between p-5">
                      <div className="flex items-start justify-between gap-3">
                        <CreatorStatusPill tone="warning">
                          <Sparkles size={10} />
                          {campaign.matchScore || 90}% {t("Match")}
                        </CreatorStatusPill>
                        <CreatorStatusPill tone={campaign.campaign_type === "performance" ? "success" : "accent"}>
                          {campaign.campaign_type === "performance" ? t("CPM") : t("Escrow")}
                        </CreatorStatusPill>
                      </div>
                      <div>
                        <p className="creator-label text-white/45">{campaign.businessName}</p>
                        <h3 className="mt-1 max-w-xl text-2xl font-semibold leading-tight text-white">
                          {campaign.title}
                        </h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/70">{campaign.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-8 space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4">
              <h2 className="text-lg font-semibold text-white">{t("Explore Feed")}</h2>
              <span className="text-xs font-semibold text-white/45">
                {t("Showing {count} campaigns").replace("{count}", filteredCampaigns.length.toString())}
              </span>
            </div>

            <CreatorGlassCard>
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" size={16} />
                  <input
                    type="text"
                    placeholder={t("Search brands, niches, or deliverables...")}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="creator-input w-full rounded-xl py-3 pl-10 pr-4 text-sm placeholder:text-white/30"
                  />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 creator-scrollbar">
                  <SlidersHorizontal size={14} className="hidden shrink-0 text-white/35 sm:block" />
                  {allNiches.map((niche) => (
                    <button
                      key={niche}
                      onClick={() => setSelectedNiche(niche)}
                      className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all ${
                        selectedNiche === niche
                          ? "border-[rgba(77,142,255,0.4)] bg-[var(--creator-primary)] text-white"
                          : "border-white/10 bg-white/[0.05] text-white/55 hover:text-white"
                      }`}
                    >
                      {t(niche)}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <select value={selectedBudget} onChange={(event) => setSelectedBudget(event.target.value)} className="creator-input rounded-xl px-3 py-2 text-xs">
                    <option value="All">{t("All Budgets")}</option>
                    <option value="low">{t("Under $4,000")}</option>
                    <option value="mid">{t("$4,000 - $8,000")}</option>
                    <option value="high">{t("$8,000+")}</option>
                  </select>
                  <select value={selectedSpeed} onChange={(event) => setSelectedSpeed(event.target.value)} className="creator-input rounded-xl px-3 py-2 text-xs">
                    <option value="All">{t("All Payout Speed")}</option>
                    <option value="escrow">{t("Instant Escrow")}</option>
                    <option value="standard">{t("Standard Payout")}</option>
                  </select>
                  <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="creator-input rounded-xl px-3 py-2 text-xs">
                    <option value="All">{t("All Content Types")}</option>
                    <option value="clipping">{t("Clipping")}</option>
                    <option value="ugc">{t("UGC")}</option>
                  </select>
                  <select value={selectedType} onChange={(event) => setSelectedType(event.target.value)} className="creator-input rounded-xl px-3 py-2 text-xs">
                    <option value="All">{t("All Deliverables")}</option>
                    <option value="youtube">{t("YouTube Shorts")}</option>
                  </select>
                  {filtersActive ? (
                    <button
                      onClick={resetFilters}
                      className="rounded-xl border border-[rgba(248,113,113,0.22)] bg-[rgba(248,113,113,0.08)] px-3 py-2 text-xs font-semibold text-[var(--creator-danger)]"
                    >
                      {t("Clear Filters")}
                    </button>
                  ) : null}
                </div>
              </div>
            </CreatorGlassCard>

            {filteredCampaigns.length === 0 ? (
              <CreatorEmptyState
                icon={Megaphone}
                title={t("No campaigns match filters")}
                description={t("Try adjusting search terms, niche filters, or payout mode to discover more pools.")}
              />
            ) : (
              <motion.div layout className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredCampaigns.map((campaign) => {
                  const isApplied = appliedCampaignIds.has(campaign.id);
                  const isJoined = joinedIds.has(campaign.id);
                  const categoryLabel = campaign.campaign_category
                    ? CAMPAIGN_CATEGORY_LABELS[campaign.campaign_category]
                    : null;

                  return (
                    <motion.article
                      key={campaign.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="creator-glass group flex min-h-[360px] flex-col overflow-hidden rounded-2xl transition-all hover:-translate-y-1 hover:border-white/15"
                    >
                      <div className="relative h-28 overflow-hidden border-b border-white/5">
                        <div
                          className="absolute inset-0 bg-cover bg-center opacity-50 transition-transform duration-500 group-hover:scale-105"
                          style={{ backgroundImage: `url(${campaign.image_url})` }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,13,30,0.96)] to-transparent" />
                        <div className="absolute left-4 top-4 flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-sm font-black text-white">
                          {campaignLogo(campaign)}
                        </div>
                        <div className="absolute bottom-3 left-4 right-4">
                          <p className="creator-label text-white/35">{campaign.businessName}</p>
                          <h3 className="truncate text-base font-semibold text-white">{campaign.title}</h3>
                        </div>
                      </div>

                      <div className="flex flex-1 flex-col gap-4 p-4">
                        <div className="flex flex-wrap gap-1.5">
                          {categoryLabel ? (
                            <CreatorStatusPill tone={campaign.campaign_category === "ugc" ? "warning" : "accent"}>
                              {campaign.campaign_category === "ugc" ? <FileText size={10} /> : <Scissors size={10} />}
                              {t(categoryLabel)}
                            </CreatorStatusPill>
                          ) : null}
                          {campaign.target_niches.slice(0, 2).map((niche) => (
                            <CreatorStatusPill key={niche} tone="neutral">
                              {t(niche)}
                            </CreatorStatusPill>
                          ))}
                        </div>

                        <p className="line-clamp-3 min-h-16 text-xs leading-5 text-white/60">{campaign.description}</p>

                        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                          <p className="creator-label text-white/35">{t("Earnings potential")}</p>
                          <div className="mt-2 flex items-end justify-between gap-3">
                            <div>
                              <span className="text-xs text-white/45">
                                {campaign.campaign_type === "performance" ? t("CPM") : t("Pool")}
                              </span>
                              <p className="text-xl font-bold text-[var(--creator-primary)]">
                                {campaign.campaign_type === "performance"
                                  ? formatMoney(Number(campaign.cpm_rate ?? 0))
                                  : formatMoneyCompact(campaign.budget_total)}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-xs text-white/45">{t("Remaining")}</span>
                              <p className="text-sm font-semibold text-white">{campaign.days_left}d</p>
                            </div>
                          </div>
                          {campaign.campaign_type === "performance" &&
                          campaign.pool_total != null &&
                          campaign.pool_total > 0 ? (
                            (() => {
                              const usedPct = Math.min(
                                Math.max((campaign.pool_used ?? 0) / campaign.pool_total, 0),
                                1
                              );
                              const remaining = Math.max(
                                campaign.pool_total - (campaign.pool_used ?? 0),
                                0
                              );
                              return (
                                <div className="mt-3">
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                    <div
                                      className="h-full rounded-full bg-[var(--creator-primary)]"
                                      style={{ width: `${Math.round(usedPct * 100)}%` }}
                                    />
                                  </div>
                                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/45">
                                    <span>
                                      {Math.round(usedPct * 100)}% {t("of pool used")}
                                    </span>
                                    <span className="font-semibold text-white/70">
                                      {formatMoneyCompact(remaining)} {t("left")}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()
                          ) : null}
                        </div>

                        <div className="mt-auto flex items-center justify-between gap-3 border-t border-white/5 pt-4">
                          {isApplied || isJoined ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <CreatorStatusPill tone="success" className="px-3 py-2">
                                <Check size={13} />
                                {isJoined ? t("Joined") : t("Applied")}
                              </CreatorStatusPill>
                              {campaign.campaign_type === "performance" ? (
                                <Link
                                  href={performanceSubmissionHref(campaign)}
                                  className="rounded-xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.10)] px-3 py-2 text-xs font-semibold text-[var(--creator-primary)] transition-colors hover:bg-[rgba(77,142,255,0.16)]"
                                >
                                  {t(performanceSubmitLabel(campaign))}
                                </Link>
                              ) : null}
                            </div>
                          ) : campaign.campaign_type === "performance" ? (
                            <Button
                              onClick={() => openApplyModal(campaign)}
                              disabled={joiningId === campaign.id}
                              className="creator-gradient-accent h-10 rounded-xl border-0 px-4 text-xs font-semibold text-white hover:brightness-105"
                            >
                              <Zap size={13} />
                              {t(performanceJoinLabel(campaign))}
                            </Button>
                          ) : (
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleExpressInterest(campaign)}
                                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/65 transition-all hover:bg-white/[0.08] hover:text-white"
                              >
                                {t("Express Interest")}
                              </button>
                              <Button
                                onClick={() => openApplyModal(campaign)}
                                className="h-10 rounded-xl px-4 text-xs font-semibold"
                              >
                                {t("Apply")}
                              </Button>
                            </div>
                          )}
                          <div className="flex items-center gap-1 text-xs font-semibold text-[var(--creator-warning)]">
                            <Clock size={13} />
                            {campaign.days_left}d
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </motion.div>
            )}
          </section>
        </>
      )}

      <Dialog open={isApplyModalOpen} onOpenChange={setIsApplyModalOpen}>
        <DialogContent className="creator-portal creator-glass-high max-w-md gap-6 rounded-2xl border-white/10 p-6 text-white">
          <DialogHeader>
            <span className="creator-label text-[var(--creator-primary)]">{t("Campaign Application")}</span>
            <DialogTitle className="text-xl font-semibold tracking-tight">{selectedCampaign?.title}</DialogTitle>
            <DialogDescription className="text-xs text-white/50">
              {t("Proposed by")} {selectedCampaign?.businessName}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleApplySubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="creator-label block text-white/45">{t("Proposed payout value")}</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={16} />
                <input
                  type="number"
                  required
                  value={proposedPayout}
                  onChange={(event) => setProposedPayout(Number(event.target.value))}
                  className="creator-input w-full rounded-xl py-3 pl-9 pr-4 text-sm font-semibold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="creator-label block text-white/45">{t("Active social handle")}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" size={15} />
                <input
                  type="text"
                  required
                  placeholder="@handle"
                  value={socialHandle}
                  onChange={(event) => setSocialHandle(event.target.value)}
                  className="creator-input w-full rounded-xl py-3 pl-9 pr-4 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="creator-label block text-white/45">{t("Pitch message")}</label>
                <div className="flex items-center gap-2">
                  <select
                    value={pitchTone}
                    onChange={(event) => setPitchTone(event.target.value as "professional" | "energetic" | "creative")}
                    className="creator-input rounded-xl px-2 py-1 text-[10px] font-semibold"
                  >
                    <option value="professional">{t("Professional")}</option>
                    <option value="energetic">{t("Energetic")}</option>
                    <option value="creative">{t("Creative")}</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAIGeneratePitch}
                    disabled={isAILoading}
                    className="rounded-xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.10)] px-3 py-1 text-[10px] font-semibold text-[var(--creator-primary)]"
                  >
                    {isAILoading ? t("Writing...") : t("AI Writer")}
                  </button>
                </div>
              </div>
              <textarea
                required
                rows={5}
                placeholder={t("Briefly pitch why your content style and audience fit this campaign...")}
                value={pitchText}
                onChange={(event) => setPitchText(event.target.value)}
                className="creator-input w-full resize-none rounded-xl px-4 py-3 text-sm leading-6"
              />
            </div>

            <DialogFooter className="gap-2 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={() => setIsApplyModalOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/65"
              >
                {t("Cancel")}
              </button>
              <Button type="submit" disabled={isSubmitting} className="rounded-xl px-5 text-xs font-semibold">
                {isSubmitting ? t("Submitting...") : t("Submit Application")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!joinModalCampaign} onOpenChange={(open) => !open && setJoinModalCampaign(null)}>
        <DialogContent className="creator-portal creator-glass-high max-w-md gap-5 rounded-2xl border-white/10 p-6 text-white">
          <DialogHeader>
            <span className="creator-label text-[var(--creator-success)]">
              {t(
                joinModalCampaign?.campaign_category === "ugc"
                  ? "Join UGC campaign"
                  : "Join clipping campaign"
              )}
            </span>
            <DialogTitle className="text-xl font-semibold tracking-tight">{joinModalCampaign?.title}</DialogTitle>
            <DialogDescription className="text-xs text-white/50">
              {t(
                joinModalCampaign?.campaign_category === "ugc"
                  ? "Join to access the creative brief and submit original posts. The brand sets the pay-per-view rate."
                  : "Join to access the source footage and submit edited clips. The brand sets the pay-per-view rate."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="creator-label text-white/40">{t("Payout rate")}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[var(--creator-success)]">
                ${Number(joinModalCampaign?.cpm_rate ?? 0).toFixed(2)}
              </span>
              <span className="text-xs text-white/45">{t("CPM per 1,000 views")}</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-[rgba(52,211,153,0.16)] bg-[rgba(52,211,153,0.06)] p-4 text-xs">
            <span className="flex items-center gap-1.5 text-white/55">
              <Eye size={13} /> {t("Est. per 100k views")}
            </span>
            <span className="font-bold text-[var(--creator-success)]">
              ${Math.round(Math.max(Number(joinModalCampaign?.cpm_rate ?? 0), 0) * 100).toLocaleString()}
            </span>
          </div>

          <DialogFooter className="gap-2 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={() => setJoinModalCampaign(null)}
              className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/65"
            >
              {t("Cancel")}
            </button>
            <Button
              onClick={confirmJoin}
              disabled={joiningId === joinModalCampaign?.id}
              className="creator-gradient-accent rounded-xl border-0 px-5 text-xs font-semibold text-white hover:brightness-105"
            >
              {joiningId === joinModalCampaign?.id
                ? t("Joining...")
                : t(joinModalCampaign ? performanceJoinLabel(joinModalCampaign) : "Join Campaign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CreatorPageShell>
  );
}
