"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  SlidersHorizontal, 
  Sparkles, 
  DollarSign, 
  Calendar, 
  Zap, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  User, 
  Check, 
  Megaphone,
  Briefcase,
  X,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { getClientProfile, isMockMode, supabase } from "@/lib/supabase/client";
import { apiPost, apiGet } from "@/lib/api/client";
import { Profile } from "@/types";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { useTranslation } from "@/lib/translations";

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
}

const initialMockCampaigns: Campaign[] = [
  {
    id: "camp_1",
    title: "Ergonomic Desk Tech Review",
    description: "Promote our new premium ergonomic monitor arm and setup accessories. Share a high-aesthetic workspace transformation reel.",
    businessName: "Acme Tech Corp",
    budget_total: 2500,
    target_niches: ["Tech", "Minimalism", "Productivity"],
    deliverables: [{ type: "instagram_reel", quantity: 1, description: "1x 60s Reel showing full desk transformation." }],
    timeline: { start_date: "2026-06-01", end_date: "2026-06-30" },
    payout_speed: "Instant Escrow",
    days_left: 8,
    image_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "camp_2",
    title: "Summer Linen Capsule Launch",
    description: "Showcase our breathable, organic summer linen apparel in everyday casual-luxury styling clips.",
    businessName: "Aura Aesthetics",
    budget_total: 8000,
    target_niches: ["Fashion", "Lifestyle", "Luxury"],
    deliverables: [
      { type: "tiktok_video", quantity: 1, description: "1x 30s TikTok lookbook styling linen collection" },
      { type: "instagram_story", quantity: 3, description: "3x Stories with swipe up direct product links." }
    ],
    timeline: { start_date: "2026-05-15", end_date: "2026-06-15" },
    payout_speed: "Instant Escrow",
    days_left: 22,
    image_url: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "camp_3",
    title: "Clean Pre-Workout Boost Promo",
    description: "Highlight the organic energy and crash-free formula of our new pre-workout boost powder.",
    businessName: "Vigor Nutrition",
    budget_total: 3500,
    target_niches: ["Fitness", "Health", "Nutrition"],
    deliverables: [{ type: "instagram_reel", quantity: 1, description: "1x Reel showing preparation and workout performance boost." }],
    timeline: { start_date: "2026-05-01", end_date: "2026-05-20" },
    payout_speed: "Standard (14 days)",
    days_left: 0,
    image_url: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "camp_4",
    title: "Custom Mechanical Keyboards",
    description: "Promote our hot-swappable mechanical split keyboard and custom keycap styles to creators.",
    businessName: "Acme Tech",
    budget_total: 4500,
    target_niches: ["Tech", "Gaming", "Setup"],
    deliverables: [{ type: "youtube_sponsor", quantity: 1, description: "1x 90s integrated sponsor slot in setup video." }],
    timeline: { start_date: "2026-07-01", end_date: "2026-07-31" },
    payout_speed: "Instant Escrow",
    days_left: 15,
    image_url: "https://images.unsplash.com/photo-1555538995-736e5429692a?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "camp_5",
    title: "Eco-Friendly Bamboo Basics",
    description: "Promote our core bamboo fabric basics, highlighting fabric longevity and ecological manufacturing.",
    businessName: "Aura Aesthetics",
    budget_total: 12000,
    target_niches: ["Fashion", "Lifestyle", "Minimalism"],
    deliverables: [
      { type: "instagram_reel", quantity: 2, description: "2x Reels focusing on outfit repeating and durability" }
    ],
    timeline: { start_date: "2026-06-10", end_date: "2026-07-10" },
    payout_speed: "Instant Escrow",
    days_left: 19,
    image_url: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=80"
  },
  {
    id: "camp_6",
    title: "Cinematic Travel Backpack Vlog",
    description: "Capture beautiful transitions and drone views showcasing our smart travel backpack in real-world transit.",
    businessName: "Atlas Gear",
    budget_total: 5500,
    target_niches: ["Travel", "Photography", "Adventure"],
    deliverables: [{ type: "instagram_reel", quantity: 1, description: "1x Cinematic Reel showing backpack features in travel." }],
    timeline: { start_date: "2026-06-15", end_date: "2026-07-15" },
    payout_speed: "Instant Escrow",
    days_left: 25,
    image_url: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80"
  }
];

export default function DiscoverPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<Profile | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [appliedCampaignIds, setAppliedCampaignIds] = useState<Set<string>>(new Set());
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNiche, setSelectedNiche] = useState<string>("All");
  const [selectedBudget, setSelectedBudget] = useState<string>("All");
  const [selectedSpeed, setSelectedSpeed] = useState<string>("All");
  const [selectedType, setSelectedType] = useState<string>("All");

  // Dialog State
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  
  // Application Form State
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
      
      if (profile && profile.social_handle) {
        setSocialHandle(profile.social_handle);
      }

      let rawCamps: Campaign[] = [];

      if (isMockMode) {
        // 1. Fetch campaigns from LocalStorage
        let storedCamps = localStorage.getItem("aether-mock-campaigns");
        if (!storedCamps) {
          localStorage.setItem("aether-mock-campaigns", JSON.stringify(initialMockCampaigns));
          rawCamps = initialMockCampaigns;
        } else {
          rawCamps = JSON.parse(storedCamps);
        }

        // 2. Fetch participations to flag already applied
        const storedParts = localStorage.getItem("aether-mock-participations");
        const partsList = storedParts ? JSON.parse(storedParts) : [];
        const influencerId = profile?.user_id || "mock-influencer-uuid";
        
        // Find campaigns already applied
        const appliedIds = new Set<string>();
        partsList.forEach((part: any) => {
          if (part.influencer_id === influencerId) {
            appliedIds.add(part.campaign_id);
          }
        });

        // Also check detailed campaign status from individual storage keys
        rawCamps.forEach((camp) => {
          const detailedStateStr = localStorage.getItem(`aether-campaign-state-${camp.id}`);
          if (detailedStateStr) {
            try {
              const detailed = JSON.parse(detailedStateStr);
              if (detailed.status === "applied" || detailed.status === "escrowed" || detailed.status === "submitted" || detailed.status === "released") {
                appliedIds.add(camp.id);
              }
            } catch (e) {}
          }
        });

        setAppliedCampaignIds(appliedIds);
      } else {
        const searchData = await apiGet<{
          campaigns: Array<Record<string, unknown>>;
        }>("/api/campaigns/search?page=1&limit=50");

        rawCamps = (searchData.campaigns || []).map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description || "",
          businessName: "Brand Client", // Would join with profile in production
          budget_total: Number(c.budget_total),
          target_niches: c.target_niches || [],
          deliverables: c.deliverables || [],
          timeline: c.timeline || { start_date: "", end_date: "" },
          payout_speed: "Instant Escrow",
          days_left: 30, // Mocked days left
          image_url: c.target_niches.includes("Tech") 
            ? "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80" 
            : c.target_niches.includes("Fashion")
            ? "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=600&q=80"
            : "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=600&q=80"
        }));

        if (profile) {
          const { data: parts } = await supabase
            .from("participations")
            .select("campaign_id")
            .eq("influencer_id", profile.user_id);
          
          const appliedIds = new Set<string>((parts || []).map(p => p.campaign_id));
          setAppliedCampaignIds(appliedIds);
        }
      }

      // Rank and match raw campaigns using AI Matchmaking API
      try {
        const creatorNiches: string[] = (profile as any)?.niches || (profile?.niche ? [profile.niche] : ["Tech", "Minimalism"]);
        try {
          const matchData = await apiPost<{
            success: boolean;
            campaigns?: typeof rawCamps;
          }>("/api/ai/discover", {
            creator: {
              name: profile?.full_name || "Marcus Vance",
              bio: profile?.bio || "Tech creator and minimalist design specialist.",
              niches: creatorNiches,
              followers: profile?.followers || 48500,
              engagement: Number(profile?.engagement_rate) || 4.8,
            },
            campaigns: rawCamps,
          });
          if (matchData.success && matchData.campaigns) {
            setCampaigns(matchData.campaigns);
          } else {
            setCampaigns(rawCamps);
          }
        } catch {
          setCampaigns(rawCamps);
        }
      } catch (matchErr) {
        console.error("AI Matchmaking discover failed:", matchErr);
        setCampaigns(rawCamps);
      }
    } catch (err: any) {
      console.error("Error loading discover data:", err);
      toast.error(t("Failed to load campaigns."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen to changes in campaign status
    const handleSync = () => {
      loadData();
    };
    window.addEventListener("storage", handleSync);
    window.addEventListener("role-change", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("role-change", handleSync);
    };
  }, []);

  // CONFETTI CELEBRATION EFFECT
  const triggerConfetti = () => {
    confetti({
      particleCount: 140,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#007AFF", "#34C759", "#FF9500", "#5856D6"]
    });
  };

  // ONE-CLICK "EXPRESS INTEREST"
  const handleExpressInterest = async (campaign: Campaign) => {
    toast.loading(t("Sending quick application..."), { id: "express-interest" });
    try {
      const influencerId = user?.user_id || "mock-influencer-uuid";
      const proposed = campaign.budget_total;

      if (isMockMode) {
        // Create participation
        const storedParts = localStorage.getItem("aether-mock-participations");
        const partsList = storedParts ? JSON.parse(storedParts) : [];
        
        const newPart = {
          id: "part_mock_" + Math.random().toString(36).substring(7),
          campaign_id: campaign.id,
          influencer_id: influencerId,
          status: "applied",
          proposed_payout: proposed,
          applied_at: new Date().toISOString()
        };

        localStorage.setItem("aether-mock-participations", JSON.stringify([...partsList, newPart]));
        
        // Add detail status key for the chat details page
        const detailedState = {
          id: campaign.id,
          title: campaign.title,
          budget: proposed,
          status: "applied",
          partnerName: "Sarah Jenkins (Brand Client)"
        };
        localStorage.setItem(`aether-campaign-state-${campaign.id}`, JSON.stringify(detailedState));

        // Trigger custom storage sync event
        window.dispatchEvent(new Event("storage"));
      } else {
        await apiPost(`/api/campaigns/${campaign.id}/apply`, {
          proposed_payout: proposed,
        });
      }

      setAppliedCampaignIds(prev => new Set([...prev, campaign.id]));
      toast.success(t("Interest expressed!"), {
        id: "express-interest",
        description: t("Your stats and rate card have been sent to the brand.")
      });
      triggerConfetti();
    } catch (err: any) {
      toast.error(err.message || t("Failed to submit quick application"), { id: "express-interest" });
    }
  };

  // OPEN DETAILED APPLY MODAL
  const openApplyModal = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setProposedPayout(campaign.budget_total);
    setPitchText("");
    setPitchTone("professional");
    setIsApplyModalOpen(true);
  };

  // CALL GEMINI AI PITCH WRITER
  const handleAIGeneratePitch = async () => {
    if (!selectedCampaign) return;
    setIsAILoading(true);
    
    toast.loading(t("Aether AI is writing your pitch..."), { id: "ai-pitch" });
    try {
      const data = await apiPost<{ pitch?: string; generatedBy?: string }>(
        "/api/ai/pitch",
        {
          campaign: {
            title: selectedCampaign.title,
            description: selectedCampaign.description,
            niches: selectedCampaign.target_niches,
            budget: selectedCampaign.budget_total,
            brandName: selectedCampaign.businessName,
          },
          creator: {
            name: user?.full_name || "Marcus Vance",
            bio: user?.bio || "Tech creator and minimalist design specialist.",
            niches:
              (user as any)?.niches ||
              (user?.niche ? [user.niche] : ["Tech", "Productivity"]),
            followers:
              (user as any)?.follower_count || user?.followers || 48500,
            engagement:
              (user as any)?.engagement_rate || user?.engagement_rate || 4.8,
          },
          tone: pitchTone,
        }
      );
      setPitchText(data.pitch || "");
      toast.success(t("AI pitch ready!"), { 
        id: "ai-pitch",
        description: data.generatedBy === "gemini" ? t("Written with Gemini 1.5 Flash.") : t("Loaded matching template.")
      });
    } catch (err: any) {
      toast.error(t("AI Assistant is offline. Please write manually."), { id: "ai-pitch" });
    } finally {
      setIsAILoading(false);
    }
  };

  // SUBMIT FORM IN APPLY MODAL
  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    setIsSubmitting(true);

    toast.loading(t("Submitting application..."), { id: "apply" });
    try {
      const influencerId = user?.user_id || "mock-influencer-uuid";

      if (isMockMode) {
        // Create participation
        const storedParts = localStorage.getItem("aether-mock-participations");
        const partsList = storedParts ? JSON.parse(storedParts) : [];
        
        const newPart = {
          id: "part_mock_" + Math.random().toString(36).substring(7),
          campaign_id: selectedCampaign.id,
          influencer_id: influencerId,
          status: "applied",
          proposed_payout: proposedPayout,
          pitch: pitchText,
          applied_at: new Date().toISOString()
        };

        localStorage.setItem("aether-mock-participations", JSON.stringify([...partsList, newPart]));
        
        // Add detail status key for the chat details page
        const detailedState = {
          id: selectedCampaign.id,
          title: selectedCampaign.title,
          budget: proposedPayout,
          status: "applied",
          partnerName: "Sarah Jenkins (Brand Client)"
        };
        localStorage.setItem(`aether-campaign-state-${selectedCampaign.id}`, JSON.stringify(detailedState));

        // Save a mock system chat message with pitch if provided
        if (pitchText.trim()) {
          const chatKey = `aether-campaign-chat-messages-${selectedCampaign.id}`;
          const creatorName = user?.full_name || "Marcus Vance";
          const mockMsgs = [
            {
              sender: "System",
              role: "system",
              text: `Application submitted with proposed budget: $${proposedPayout.toLocaleString()} USD.`,
              time: "Just now"
            },
            {
              sender: `${creatorName} (Creator)`,
              role: "influencer",
              text: pitchText,
              time: "Just now"
            }
          ];
          // We can let the detail page initialize from its own timeline, but this sets a nice base.
        }

        window.dispatchEvent(new Event("storage"));
      } else {
        await apiPost(`/api/campaigns/${selectedCampaign.id}/apply`, {
          proposed_payout: proposedPayout,
          pitch: pitchText.trim() || undefined,
        });
      }

      setAppliedCampaignIds(prev => new Set([...prev, selectedCampaign.id]));
      setIsApplyModalOpen(false);
      
      toast.success(t("Application submitted successfully!"), {
        id: "apply",
        description: t("The brand has been notified and will review your pitch.")
      });
      triggerConfetti();
    } catch (err: any) {
      toast.error(err.message || t("Failed to submit application"), { id: "apply" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // CURATED AI MATCH RECOMMENDATIONS ("FOR YOU")
  const recommendedCampaigns = campaigns
    .filter(c => !appliedCampaignIds.has(c.id))
    .slice(0, 2);

  // FILTERED CAMPAIGNS FEED
  const filteredCampaigns = campaigns.filter(c => {
    // 1. Search Query
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const matchTitle = c.title.toLowerCase().includes(query);
      const matchBrand = c.businessName.toLowerCase().includes(query);
      const matchDesc = c.description.toLowerCase().includes(query);
      if (!matchTitle && !matchBrand && !matchDesc) return false;
    }

    // 2. Niche Filter
    if (selectedNiche !== "All") {
      const hasNiche = c.target_niches.some(n => n.toLowerCase() === selectedNiche.toLowerCase());
      if (!hasNiche) return false;
    }

    // 3. Budget Filter
    if (selectedBudget !== "All") {
      const budget = c.budget_total;
      if (selectedBudget === "low" && budget >= 4000) return false;
      if (selectedBudget === "mid" && (budget < 4000 || budget >= 8000)) return false;
      if (selectedBudget === "high" && budget < 8000) return false;
    }

    // 4. Deliverable / Content Type
    if (selectedType !== "All") {
      const hasType = c.deliverables.some(d => d.type.toLowerCase().includes(selectedType.toLowerCase()));
      if (!hasType) return false;
    }

    // 5. Payout Speed
    if (selectedSpeed !== "All") {
      if (selectedSpeed === "escrow" && c.payout_speed !== "Instant Escrow") return false;
      if (selectedSpeed === "standard" && c.payout_speed === "Instant Escrow") return false;
    }

    return true;
  });

  const allNiches = ["All", "Tech", "Fashion", "Food", "Fitness", "Travel", "Beauty", "Minimalism"];

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 md:py-16">
      {/* Page Header (App Store Today tab style) */}
      <div className="mb-10">
        <span className="text-xs font-bold text-[#007AFF] uppercase tracking-wider block mb-1.5">
          {new Date().toLocaleDateString(t("en-US"), { weekday: 'long', month: 'long', day: 'numeric' })}
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight">{t("Today")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("Discover live campaigns and secure escrow collaborations.")}</p>
      </div>

      {loading ? (
        <div className="space-y-12">
          {/* Curated Carousel Skeleton */}
          <div className="mb-14">
            <div className="flex justify-between items-center mb-5">
              <div className="h-6 w-32 bg-secondary/80 rounded apple-skeleton" />
              <div className="h-4 w-40 bg-secondary/80 rounded apple-skeleton" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {[1, 2].map((i) => (
                <div key={i} className="rounded-3xl border border-border/30 bg-card p-8 h-[280px] flex flex-col justify-between shadow-sm">
                  <div className="flex justify-between items-center">
                    <div className="h-6 w-20 bg-secondary/80 rounded-full apple-skeleton" />
                    <div className="h-6 w-24 bg-secondary/80 rounded-full apple-skeleton" />
                  </div>
                  <div className="space-y-3 pt-4 mt-auto">
                    <div className="h-3.5 w-24 bg-secondary/80 rounded apple-skeleton" />
                    <div className="h-6 w-[80%] bg-secondary/80 rounded apple-skeleton" />
                    <div className="h-4 w-full bg-secondary/80 rounded apple-skeleton" />
                    <div className="flex justify-between items-center border-t border-border/10 pt-3.5 mt-3.5">
                      <div className="flex gap-4">
                        <div className="h-3 w-12 bg-secondary/80 rounded apple-skeleton" />
                        <div className="h-3 w-16 bg-secondary/80 rounded apple-skeleton" />
                      </div>
                      <div className="w-10 h-10 rounded-2xl bg-secondary/80 apple-skeleton" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Explore Feed list Skeleton */}
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-border/10 pb-4">
              <div className="h-6 w-32 bg-secondary/80 rounded apple-skeleton" />
              <div className="h-4 w-28 bg-secondary/80 rounded apple-skeleton" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((j) => (
                <div key={j} className="rounded-3xl border border-border/30 bg-card overflow-hidden flex flex-col justify-between shadow-sm">
                  <div className="h-36 w-full bg-secondary/40 border-b border-border/15 relative">
                    <div className="h-full w-full bg-secondary/80 apple-skeleton" />
                  </div>
                  <div className="p-6 space-y-4 flex-1">
                    <div className="h-3.5 w-[90%] bg-secondary/85 rounded apple-skeleton" />
                    <div className="space-y-2">
                      <div className="h-3 w-full bg-secondary/85 rounded apple-skeleton" />
                      <div className="h-3 w-[70%] bg-secondary/85 rounded apple-skeleton" />
                    </div>
                    <div className="p-3 bg-secondary/25 border border-border/10 rounded-2xl space-y-2">
                      <div className="h-3 w-16 bg-secondary/85 rounded apple-skeleton" />
                      <div className="h-3.5 w-32 bg-secondary/85 rounded apple-skeleton" />
                    </div>
                  </div>
                  <div className="px-6 pb-6 pt-4 border-t border-border/10 flex items-center justify-between gap-3 bg-secondary/5">
                    <div className="space-y-1">
                      <div className="h-2 w-12 bg-secondary/85 rounded apple-skeleton" />
                      <div className="h-4 w-20 bg-secondary/85 rounded apple-skeleton" />
                    </div>
                    <div className="h-9 w-24 bg-secondary/80 rounded-full apple-skeleton" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Recommended "For You" Section (Apple Card Carousel) */}
          {recommendedCampaigns.length > 0 && (
            <div className="mb-14">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-1.5">
                  <Sparkles size={18} className="text-[#FF9500]" /> {t("For You")}
                </h2>
                <span className="text-xs font-semibold text-muted-foreground">{t("Based on your media kit")}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {recommendedCampaigns.slice(0, 2).map((camp) => (
                  <motion.div
                    key={camp.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -6 }}
                    transition={{ type: "spring", stiffness: 280, damping: 25 }}
                    className="apple-card group relative min-h-[280px] flex flex-col justify-between overflow-hidden cursor-pointer"
                    onClick={() => openApplyModal(camp)}
                  >
                    {/* Background image & gradient overlay */}
                    <div 
                      className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-700 group-hover:scale-105"
                      style={{ backgroundImage: `url(${camp.image_url})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10" />

                    {/* Match Badge */}
                    <div className="z-20 p-6 flex justify-between items-start">
                      <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-bold text-white uppercase tracking-wider border border-white/10 flex items-center gap-1">
                        <Sparkles size={10} className="text-[#FF9500] fill-[#FF9500]" /> {camp.matchScore || 90}% {t("Match")}
                      </span>
                      <span className="px-2.5 py-1 bg-[#34C759] rounded-full text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-0.5">
                        <Zap size={9} /> {t("Instant Escrow")}
                      </span>
                    </div>

                    {/* Details Footer */}
                    <div className="z-20 p-6 text-white space-y-3 mt-auto">
                      <div>
                        <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest block mb-1">
                          {camp.businessName}
                        </span>
                        <h3 className="text-2xl font-bold tracking-tight leading-snug group-hover:text-[#007AFF] transition-colors">
                          {camp.title}
                        </h3>
                      </div>

                      <p className="text-xs text-white/80 line-clamp-2 leading-relaxed font-medium">
                        {camp.description}
                      </p>

                      {camp.matchingReason && (
                        <div className="text-[11px] text-[#FF9500] font-semibold bg-black/45 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#FF9500]/25 flex items-center gap-1.5 w-fit">
                          <Sparkles size={11} className="fill-[#FF9500] animate-pulse" /> {camp.matchingReason}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-white/10">
                        <div className="flex gap-4">
                          <div>
                            <span className="text-[9px] uppercase text-white/50 font-semibold block">{t("Budget")}</span>
                            <span className="text-sm font-bold flex items-center mt-0.5"><DollarSign size={13} />{camp.budget_total.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-[9px] uppercase text-white/50 font-semibold block">{t("Deliverables")}</span>
                            <span className="text-sm font-bold block mt-0.5">
                              {camp.deliverables.length} {camp.deliverables.length > 1 ? t("formats") : t("format")}
                            </span>
                          </div>
                        </div>

                        <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-white backdrop-blur-sm group-hover:bg-[#007AFF] group-hover:text-white transition-all">
                          <ArrowRight size={16} />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* Main Campaign Search and Feed Section */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-border/10 pb-4">
              <h2 className="text-xl font-extrabold tracking-tight">{t("Explore Feed")}</h2>
              <span className="text-xs text-muted-foreground font-semibold">
                {t("Showing {count} campaigns").replace("{count}", filteredCampaigns.length.toString())}
              </span>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col gap-4">
              {/* Search bar */}
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  type="text"
                  placeholder={t("Search campaigns, deliverables, brands...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-2xl bg-secondary/30 border border-border/20 text-xs focus:outline-none focus:border-primary/45 transition-all"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex flex-wrap gap-2 items-center">
                <SlidersHorizontal size={14} className="text-muted-foreground mr-1 hidden sm:block" />
                
                {/* Niche scroll wrapper */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-full no-scrollbar">
                  {allNiches.map((niche) => (
                    <button
                      key={niche}
                      onClick={() => setSelectedNiche(niche)}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold select-none cursor-pointer transition-all border ${
                        selectedNiche === niche
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-secondary/40 text-muted-foreground border-border/10 hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      {t(niche)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Secondary Filters Dropdowns */}
              <div className="flex flex-wrap gap-2">
                {/* Budget Filter */}
                <select
                  value={selectedBudget}
                  onChange={(e) => setSelectedBudget(e.target.value)}
                  className="px-3.5 py-2.5 rounded-2xl bg-secondary/30 border border-border/20 text-[11px] font-semibold text-muted-foreground focus:outline-none focus:text-foreground cursor-pointer"
                >
                  <option value="All">{t("All Budgets")}</option>
                  <option value="low">{t("Under $4,000")}</option>
                  <option value="mid">{t("$4,000 - $8,000")}</option>
                  <option value="high">{t("$8,000+")}</option>
                </select>

                {/* Payout Speed Filter */}
                <select
                  value={selectedSpeed}
                  onChange={(e) => setSelectedSpeed(e.target.value)}
                  className="px-3.5 py-2.5 rounded-2xl bg-secondary/30 border border-border/20 text-[11px] font-semibold text-muted-foreground focus:outline-none focus:text-foreground cursor-pointer"
                >
                  <option value="All">All Payout Speed</option>
                  <option value="escrow">Instant Escrow (Stripe Verified)</option>
                  <option value="standard">Standard Payout</option>
                </select>

                {/* Deliverable Type Filter */}
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-3.5 py-2.5 rounded-2xl bg-secondary/30 border border-border/20 text-[11px] font-semibold text-muted-foreground focus:outline-none focus:text-foreground cursor-pointer"
                >
                  <option value="All">{t("All Deliverables")}</option>
                  <option value="reel">{t("Instagram Reel")}</option>
                  <option value="tiktok">{t("TikTok Video")}</option>
                  <option value="youtube">{t("YouTube Sponsor")}</option>
                  <option value="story">{t("Instagram Story")}</option>
                </select>

                {/* Clear Filters Button */}
                {(selectedNiche !== "All" || selectedBudget !== "All" || selectedSpeed !== "All" || selectedType !== "All" || searchQuery) && (
                  <button
                    onClick={() => {
                      setSelectedNiche("All");
                      setSelectedBudget("All");
                      setSelectedSpeed("All");
                      setSelectedType("All");
                      setSearchQuery("");
                    }}
                    className="px-3 py-2 text-[10px] font-bold text-destructive hover:bg-destructive/10 rounded-xl flex items-center gap-1 cursor-pointer transition-all"
                  >
                    {t("Clear Filters")}
                  </button>
                )}
              </div>
            </div>

            {/* Campaigns Feed List */}
            {filteredCampaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 rounded-3xl bg-card border border-dashed border-border/60 text-center">
                <Megaphone size={36} className="text-muted-foreground/35 mb-4 animate-pulse" />
                <h3 className="text-lg font-bold">{t("No campaigns match filters")}</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  {t("Try adjusting your filters or search keywords to explore more live campaigns.")}
                </p>
              </div>
            ) : (
              <motion.div 
                layout
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-4"
              >
                {filteredCampaigns.map((camp) => {
                  const isApplied = appliedCampaignIds.has(camp.id);
                  
                  return (
                    <motion.div
                      key={camp.id}
                      layout
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ y: -4 }}
                      className="apple-card group flex flex-col justify-between"
                    >
                      <div>
                        {/* Header Image */}
                        <div className="w-full h-36 relative overflow-hidden">
                          <div 
                            className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                            style={{ backgroundImage: `url(${camp.image_url})` }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-black/20" />
                          
                          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                            {camp.target_niches.map((n) => (
                              <span key={n} className="px-2 py-0.5 bg-black/40 backdrop-blur-sm border border-white/10 rounded-full text-[9px] font-bold text-white uppercase tracking-wider">
                                {t(n)}
                              </span>
                            ))}
                          </div>

                          {camp.matchScore && (
                            <div className="absolute top-3 right-3">
                              <span className="px-2.5 py-0.5 bg-[#FF9500] border border-white/10 rounded-full text-[9px] font-bold text-white uppercase tracking-wider flex items-center gap-0.5 shadow-sm">
                                <Sparkles size={8} className="fill-white" /> {camp.matchScore}% {t("Match")}
                              </span>
                            </div>
                          )}
                          
                          <div className="absolute bottom-3 left-3">
                            <span className="text-[10px] text-white/80 font-bold uppercase tracking-widest block">
                              {camp.businessName}
                            </span>
                            <h4 className="text-base font-bold text-white truncate max-w-[200px]">
                              {camp.title}
                            </h4>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-5 space-y-4">
                           <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-[36px]">
                            {camp.description}
                          </p>

                          {camp.matchingReason && (
                            <div className="text-[10px] text-[#FF9500] font-bold flex items-center gap-1.5 bg-[#FF9500]/5 px-2.5 py-1.5 rounded-xl border border-[#FF9500]/10 w-fit">
                              <Sparkles size={9} className="fill-[#FF9500]" /> {camp.matchingReason}
                            </div>
                          )}

                          {/* Deliverables details */}
                          <div className="bg-secondary/40 border border-border/10 rounded-2xl p-3 text-xs space-y-2">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block">{t("Deliverables")}</span>
                            {camp.deliverables.map((d, index) => (
                              <div key={index} className="flex justify-between items-center text-foreground font-semibold text-[11px]">
                                <span className="capitalize">{t(d.type.replace("_", " "))}</span>
                                <span className="px-2 py-0.5 bg-secondary text-[10px] rounded-full">{d.quantity}x</span>
                              </div>
                            ))}
                          </div>

                          {/* Escrow payout info */}
                          <div className="flex items-center justify-between text-xs pt-1">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Zap size={14} className={camp.payout_speed === "Instant Escrow" ? "text-[#34C759]" : "text-muted-foreground"} />
                              <span className="font-semibold text-[11px]">{t(camp.payout_speed)}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[#FF9500] font-semibold">
                              <Clock size={13} />
                              <span className="text-[10px]">{t("{days}d left").replace("{days}", camp.days_left.toString())}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions Footer */}
                      <div className="px-5 pb-5 pt-3 border-t border-border/10 flex items-center justify-between gap-3 bg-secondary/10">
                        <div>
                          <span className="text-[9px] text-muted-foreground uppercase block font-semibold">{t("Campaign Budget")}</span>
                          <span className="text-base font-extrabold text-foreground flex items-center mt-0.5">
                            <DollarSign size={14} />{camp.budget_total.toLocaleString()}
                          </span>
                        </div>

                        <div className="flex gap-2">
                          {isApplied ? (
                            <div className="px-4 py-2.5 rounded-full bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/20 text-xs font-bold flex items-center gap-1.5 select-none">
                              <Check size={13} /> {t("Applied")}
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleExpressInterest(camp)}
                                className="px-3.5 py-2.5 rounded-full border border-border/20 hover:border-primary/20 text-muted-foreground hover:text-foreground text-[11px] font-bold cursor-pointer transition-all bg-card/60"
                              >
                                {t("Express Interest")}
                              </button>
                              <Button
                                onClick={() => openApplyModal(camp)}
                                size="sm"
                                className="rounded-full px-4 text-[11px] font-bold shadow-sm cursor-pointer"
                              >
                                {t("Apply")}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>
        </>
      )}

      {/* Application Dialog Modal with AI Pitch Writer */}
      <Dialog open={isApplyModalOpen} onOpenChange={setIsApplyModalOpen}>
        <DialogContent className="max-w-md w-full rounded-3xl p-6 gap-6 glass-panel border border-border/40 text-foreground">
          <DialogHeader>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold text-[#007AFF] uppercase tracking-wider block mb-1">
                  {t("Sponsorship Application")}
                </span>
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {selectedCampaign?.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {t("Proposed by")} {selectedCampaign?.businessName}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleApplySubmit} className="space-y-5">
            {/* Proposed Payout */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase block tracking-wider">
                {t("Proposed Payout Value")}
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <input
                  type="number"
                  required
                  value={proposedPayout}
                  onChange={(e) => setProposedPayout(Number(e.target.value))}
                  className="w-full pl-9 pr-4 py-3 rounded-2xl bg-secondary/35 border border-border/25 text-xs font-bold focus:outline-none focus:border-primary/45 transition-colors"
                />
              </div>
              <p className="text-[10px] text-muted-foreground font-medium">
                {t("Standard campaign value is {value} USD.").replace("{value}", selectedCampaign?.budget_total.toLocaleString() || "0")}
              </p>
            </div>

            {/* Social Handle */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase block tracking-wider">
                {t("Active Social Handle")}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                <input
                  type="text"
                  required
                  placeholder="@handle"
                  value={socialHandle}
                  onChange={(e) => setSocialHandle(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 rounded-2xl bg-secondary/35 border border-border/25 text-xs font-semibold focus:outline-none focus:border-primary/45 transition-colors"
                />
              </div>
            </div>

            {/* Pitch Message Area */}
            <div className="space-y-2 relative">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-muted-foreground uppercase block tracking-wider">
                  {t("Pitch Message")}
                </label>
                <div className="flex items-center gap-1.5">
                  {/* Tone Picker */}
                  <select
                    value={pitchTone}
                    onChange={(e) => setPitchTone(e.target.value as any)}
                    className="px-2.5 py-1 rounded-xl bg-secondary/40 border border-border/20 text-[10px] font-bold text-muted-foreground focus:outline-none focus:text-foreground cursor-pointer"
                  >
                    <option value="professional">👔 {t("Professional")}</option>
                    <option value="energetic">🔥 {t("Energetic")}</option>
                    <option value="creative">🎨 {t("Creative")}</option>
                  </select>

                  {/* AI Write Button */}
                  <button
                    type="button"
                    onClick={handleAIGeneratePitch}
                    disabled={isAILoading}
                    className="px-3 py-1 bg-[#007AFF]/10 border border-[#007AFF]/25 text-[#007AFF] hover:bg-[#007AFF] hover:text-white rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-[0.97]"
                  >
                    <Sparkles size={11} className={isAILoading ? "animate-spin" : "fill-[#007AFF] hover:fill-white"} />
                    {t("AI Writer")}
                  </button>
                </div>
              </div>

              <textarea
                required
                rows={5}
                placeholder={t("Briefly pitch the brand on why your content style and audience demographics fit their project goals...")}
                value={pitchText}
                onChange={(e) => setPitchText(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-secondary/35 border border-border/25 text-xs focus:outline-none focus:border-primary/45 transition-colors resize-none leading-relaxed"
              />
            </div>

            {/* Modal Actions */}
            <DialogFooter className="flex justify-end gap-2.5 border-t border-border/10 pt-4">
              <button
                type="button"
                onClick={() => setIsApplyModalOpen(false)}
                className="px-4 py-3 rounded-2xl border border-border/20 text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer transition-all"
              >
                {t("Cancel")}
              </button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-2xl text-xs px-5 py-3 cursor-pointer shadow-sm"
              >
                {isSubmitting ? t("Submitting...") : t("Submit Application")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
