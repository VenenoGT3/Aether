"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Plus, 
  Trash2, 
  Target, 
  Info,
  Loader2,
  Lock,
  Zap,
  Eye,
  FileText,
  Scissors,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { supabase } from "@/lib/supabase/client";
import { createCampaignAction } from "@/lib/supabase/campaigns";
import { fundCampaignPoolAction } from "@/lib/stripe/actions";
import { PoolPaymentModal } from "@/components/pool-payment-modal";
import { generateCampaignBriefAction } from "@/lib/actions/ai";
import { useTranslation } from "@/lib/translations";
import {
  CAMPAIGN_CATEGORY_DESCRIPTIONS,
  type CampaignCategory,
} from "@/lib/campaign-category";
import { validateCategoryMeta } from "@/lib/campaign-category-meta";
import { feeBreakdown } from "@/lib/campaign-budget";

// Standard niches list
const AVAILABLE_NICHES = [
  "Tech", "Design", "Minimal", "Lifestyle", "Wellness", 
  "Fashion", "Beauty", "Fitness", "Food", "Travel", "Gaming"
];

/** Creator profile row used for the live matchmaking preview. */
interface MatchCreator {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  niches: string[] | null;
  follower_count: number | null;
  engagement_rate: number | null;
}

export default function NewCampaignWizard() {
  const router = useRouter();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  
  // Fixed-fee publish confirmation modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paying, setPaying] = useState(false);

  // Live matchmaking preview (real creator profiles matching the chosen niches)
  const [matchedCreators, setMatchedCreators] = useState<MatchCreator[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);

  // Performance pool funding (real Stripe Elements)
  const [poolPublishing, setPoolPublishing] = useState(false);
  const [poolFunding, setPoolFunding] = useState<{
    clientSecret: string;
    amount: number;
    campaignId: string;
    title: string;
  } | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [niches, setNiches] = useState<string[]>([]);
  const [location, setLocation] = useState("United States");
  const [ageRange, setAgeRange] = useState("18-34");
  const [gender, setGender] = useState("All");
  const [minFollowers, setMinFollowers] = useState(10000);
  
  // AI-generated Brief Details
  const [objectives, setObjectives] = useState<string[]>([]);
  const [guidelines, setGuidelines] = useState<string[]>([]);
  const [kpis, setKpis] = useState<string[]>([]);
  
  const [deliverables, setDeliverables] = useState<Array<{ type: "post" | "video" | "story"; quantity: number; details: string }>>([
    { type: "post", quantity: 1, details: "Premium high-res image grid post" }
  ]);
  
  const [budgetTotal, setBudgetTotal] = useState(2500);

  // Performance-clipping fields (Phase 6)
  const [campaignType, setCampaignType] = useState<"fixed" | "performance">("performance");
  const [cpmRate, setCpmRate] = useState(2.5);
  const [maxPayoutPerCreator, setMaxPayoutPerCreator] = useState(0);
  const [platforms, setPlatforms] = useState<string[]>(["tiktok", "instagram"]);
  const [viewHoldbackHours, setViewHoldbackHours] = useState(48);
  const [contentRules, setContentRules] = useState("");
  const isPerformance = campaignType === "performance";

  // UGC vs Clipping (performance sub-type) + the type-specific brief fields.
  const [campaignCategory, setCampaignCategory] = useState<CampaignCategory>("clipping");
  const isUgc = campaignCategory === "ugc";
  // UGC fields
  const [creativeDirection, setCreativeDirection] = useState("");
  const [references, setReferences] = useState("");
  const [dos, setDos] = useState("");
  const [donts, setDonts] = useState("");
  // Clipping fields
  const [sourceUrl, setSourceUrl] = useState("");
  const [clipMinSec, setClipMinSec] = useState(10);
  const [clipMaxSec, setClipMaxSec] = useState(60);
  const [clipRequirements, setClipRequirements] = useState("");

  // Type-specific brief, persisted to campaigns.category_meta (performance only).
  const buildCategoryMeta = () =>
    isUgc
      ? {
          creative_direction: creativeDirection.trim(),
          references: references.trim(),
          dos: dos.trim(),
          donts: donts.trim(),
        }
      : {
          source_url: sourceUrl.trim(),
          min_duration_sec: clipMinSec,
          max_duration_sec: clipMaxSec,
          requirements: clipRequirements.trim(),
        };

  const togglePlatform = (p: string) =>
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );

  const [startDate, setStartDate] = useState("2026-06-01");
  const [endDate, setEndDate] = useState("2026-06-20");
  const [draftDueDate, setDraftDueDate] = useState("2026-06-10");

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

  // Live matchmaking: pull real creator profiles whose niches overlap the
  // campaign's target niches. RLS only returns influencer profiles, so this is
  // a real (possibly empty) preview — never seeded mock data.
  useEffect(() => {
    if (niches.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear/seed preview from current niche selection
      setMatchedCreators([]);
      return;
    }
    let active = true;
    setCreatorsLoading(true);
    supabase
      .from("profiles")
      .select("user_id, full_name, avatar_url, niches, follower_count, engagement_rate")
      .overlaps("niches", niches)
      .order("follower_count", { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (!active) return;
        setMatchedCreators((data as MatchCreator[] | null) ?? []);
        setCreatorsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [niches]);

  const handleNicheToggle = (niche: string) => {
    if (niches.includes(niche)) {
      setNiches(niches.filter((n) => n !== niche));
    } else {
      if (niches.length < 3) {
        setNiches([...niches, niche]);
      } else {
        toast.warning(t("Niches limit reached"), {
          description: t("You can select up to 3 niches for targeting precision.")
        });
      }
    }
  };

  const addDeliverable = () => {
    setDeliverables([...deliverables, { type: "post", quantity: 1, details: "" }]);
  };

  const removeDeliverable = (index: number) => {
    setDeliverables(deliverables.filter((_, i) => i !== index));
  };

  const updateDeliverable = (index: number, field: string, value: string | number) => {
    const updated = [...deliverables];
    updated[index] = { ...updated[index], [field]: value } as (typeof deliverables)[number];
    setDeliverables(updated);
  };

  // AI Brief Handler
  const handleGenerateAiBrief = async () => {
    if (!aiPrompt.trim()) {
      toast.error(t("Please enter a campaign prompt"));
      return;
    }
    
    setAiGenerating(true);
    try {
      const res = await generateCampaignBriefAction(aiPrompt);
      if (res.success && res.brief) {
        const brief = res.brief;
        setTitle(brief.title);
        setDescription(brief.description);
        setNiches(brief.target_niches);
        setLocation(brief.target_audience.location);
        setAgeRange(brief.target_audience.ageRange);
        setGender(brief.target_audience.gender);
        setMinFollowers(brief.target_audience.minimumFollowers);
        setDeliverables(brief.deliverables);
        setBudgetTotal(brief.budget_total);
        setStartDate(brief.timeline.startDate);
        setEndDate(brief.timeline.endDate);
        setDraftDueDate(brief.timeline.draftDueDate);
        setObjectives(brief.objectives || []);
        setGuidelines(brief.guidelines || []);
        setKpis(brief.kpis || []);
        
        toast.success(t("AI Brief Generated Successfully!"), {
          description: t("We've populated all details based on your campaign prompt.")
        });
        setShowAiModal(false);
        setStep(6); // Skip to review step for editing/verification
      } else {
        toast.error(t("Brief generation failed"), {
          description: res.error || t("Please try again.")
        });
      }
    } catch (err) {
      toast.error(t("Brief generation failed"), {
        description: err instanceof Error ? err.message : t("An unexpected error occurred.")
      });
    } finally {
      setAiGenerating(false);
    }
  };

  const celebrate = () => {
    const end = Date.now() + 2 * 1000;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ["#007AFF", "#34C759", "#FF9500"] });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ["#007AFF", "#34C759", "#FF9500"] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  };

  // Publish / Payment Handler
  const handlePublishClick = () => {
    // Validate fields before showing payment modal
    if (!title.trim() || !description.trim() || niches.length === 0) {
      toast.error(t("Incomplete Goal Information"), {
        description: t("Please fill out title, description, and niches.")
      });
      setStep(1);
      return;
    }
    if (isPerformance) {
      void startPerformancePublish();
      return;
    }
    setShowPaymentModal(true);
  };

  /**
   * Performance publish: create the campaign as a DRAFT, then fund its pool.
   * Opens a Stripe Elements form; the webhook flips the campaign to 'open' once
   * the pool-funding PaymentIntent succeeds.
   */
  const startPerformancePublish = async () => {
    setPoolPublishing(true);
    try {
      const metaCheck = validateCategoryMeta(campaignCategory, buildCategoryMeta());
      if (!metaCheck.ok) {
        toast.error(t("Complete the campaign brief"), { description: metaCheck.error });
        setPoolPublishing(false);
        return;
      }

      const payload = {
        title,
        description,
        budget_total: budgetTotal,
        target_niches: niches,
        target_audience: { location, ageRange, gender, minFollowers },
        deliverables,
        timeline: { startDate, endDate, draftDueDate },
        status: "draft",
        campaign_type: "performance",
        campaign_category: metaCheck.category,
        category_meta: metaCheck.meta,
        // Brand-set CPM is the single source of truth (cpm_rate kept in sync).
        brand_cpm_rate: cpmRate,
        cpm_rate: cpmRate,
        budget_pool: budgetTotal,
        max_payout_per_creator: maxPayoutPerCreator > 0 ? maxPayoutPerCreator : null,
        platforms,
        view_holdback_hours: viewHoldbackHours,
        content_rules: contentRules.trim() ? { notes: contentRules.trim() } : {},
      };

      const res = await createCampaignAction(payload);
      if (!res.success || !res.campaign) {
        toast.error(t("Failed to create campaign"), { description: res.error });
        setPoolPublishing(false);
        return;
      }

      const fund = await fundCampaignPoolAction(res.campaign.id);
      if (!fund.success) {
        toast.error(t("Failed to start pool funding"), { description: fund.error });
        setPoolPublishing(false);
        return;
      }

      if (!fund.clientSecret) {
        toast.error(t("Payment setup failed. Please try again."));
        setPoolPublishing(false);
        return;
      }

      // Real: hand off to the Stripe Elements form; webhook activates on success.
      setPoolFunding({
        clientSecret: fund.clientSecret,
        amount: fund.amount ?? budgetTotal,
        campaignId: res.campaign.id,
        title,
      });
      setPoolPublishing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("An unexpected error occurred.");
      toast.error(t("Could not publish campaign"), { description: message });
      setPoolPublishing(false);
    }
  };

  // Fixed-fee publish: create the campaign as 'open' so creators can apply.
  // There is no upfront charge — escrow is funded per creator (fundEscrowAction)
  // when the brand approves an applicant from the campaign workspace.
  const handleConfirmPayment = async () => {
    setPaying(true);
    try {
      const res = await createCampaignAction({
        title,
        description,
        budget_total: budgetTotal,
        target_niches: niches,
        target_audience: { location, ageRange, gender, minFollowers },
        deliverables,
        timeline: { startDate, endDate, draftDueDate },
        status: "open",
        campaign_type: "fixed",
      });

      if (res.success && res.campaign) {
        // Celebration confetti
        const end = Date.now() + 2 * 1000;
        const frame = () => {
          confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ["#007AFF", "#34C759", "#FF9500"] });
          confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ["#007AFF", "#34C759", "#FF9500"] });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();

        toast.success(t("Campaign Published!"), {
          description: t("Your campaign is live. Approve applicants and fund escrow per creator from the campaign workspace.")
        });

        setShowPaymentModal(false);
        router.push("/business/dashboard");
      } else {
        toast.error(t("Failed to create campaign"), {
          description: res.error || t("Unknown database error.")
        });
      }
    } catch (err) {
      toast.error(t("Could not publish campaign"), {
        description: err instanceof Error ? err.message : t("An unexpected error occurred.")
      });
    } finally {
      setPaying(false);
    }
  };

  // Platform fee split (performance pools): brand pays budgetTotal; creators earn 90%.
  const poolSplit = feeBreakdown(budgetTotal);

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 md:py-16 relative overflow-hidden">
      {/* Background Decorative Glows */}
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-gradient-to-tr from-[#007AFF]/5 to-transparent blur-[90px] pointer-events-none rounded-full" />

      {/* Back Button */}
      <div className="mb-8">
        <Link href="/business/dashboard" className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          <ArrowLeft size={12} /> {t("Back to dashboard")}
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start relative z-10">
        {/* Wizard Main Flow */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <span className="text-xs font-semibold text-[#007AFF] uppercase tracking-wider block mb-1.5">
              {t("Step {step} of 6").replace("{step}", step.toString())}
            </span>
            <h1 className="text-3xl font-bold tracking-tight font-heading">{t("Create New Campaign")}</h1>
          </div>

          {/* Steps Nav */}
          <div className="flex gap-2 border-b border-border/10 pb-4 overflow-x-auto no-scrollbar">
            {["Goal", "Audience", "Deliverables", "Budget", "Timeline", "Review"].map((label, idx) => {
              const currentStep = idx + 1;
              return (
                <button
                  key={label}
                  onClick={() => step > currentStep && setStep(currentStep)}
                  className={`text-xs font-semibold px-4 py-2 rounded-full transition-all shrink-0 select-none ${
                    step === currentStep 
                      ? "bg-primary/10 text-primary border border-primary/20" 
                      : step > currentStep
                      ? "text-[#34C759] cursor-pointer hover:bg-secondary/40"
                      : "text-muted-foreground/45 cursor-not-allowed"
                  }`}
                  disabled={step < currentStep}
                >
                  <span className="flex items-center gap-1.5">
                    {step > currentStep ? <Check size={11} className="stroke-[3]" /> : <span>{currentStep}.</span>}
                    {t(label)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Form Card */}
          <div className="p-8 apple-card">
            <AnimatePresence mode="wait">
              {/* STEP 1: GOAL */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={appleSpring}
                  className="space-y-6"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/10 pb-4">
                    <div>
                      <h3 className="text-lg font-bold tracking-tight text-foreground">{t("Campaign Goals")}</h3>
                      <p className="text-xs text-muted-foreground">{t("Define what your campaign represents.")}</p>
                    </div>
                    <Button 
                       type="button"
                       onClick={() => setShowAiModal(true)}
                       className="rounded-full px-4 py-5 text-xs font-bold bg-gradient-to-r from-[#8E2DE2] to-[#4A00E0] hover:opacity-90 transition-opacity text-white border-0 gap-1.5 cursor-pointer shadow-md h-auto"
                    >
                      <Sparkles size={13} /> {t("Generate with AI Brief")}
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Campaign Type")}</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCampaignType("performance")}
                        className={`text-left p-4 rounded-2xl border transition-all ${
                          isPerformance
                            ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                            : "bg-secondary/30 border-border/20 hover:bg-secondary/50"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <Zap size={14} className="text-primary" /> {t("Performance (Pay per view)")}
                        </span>
                        <span className="block text-[11px] text-muted-foreground mt-1 leading-normal">
                          {t("Open join. Creators clip your content and earn from a shared budget pool based on views (CPM).")}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCampaignType("fixed")}
                        className={`text-left p-4 rounded-2xl border transition-all ${
                          !isPerformance
                            ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                            : "bg-secondary/30 border-border/20 hover:bg-secondary/50"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <Lock size={14} className="text-[#34C759]" /> {t("Fixed fee (Escrow)")}
                        </span>
                        <span className="block text-[11px] text-muted-foreground mt-1 leading-normal">
                          {t("Apply & approve a creator for a set fee, held in escrow and released on approval.")}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* UGC vs Clipping sub-type (performance campaigns only). */}
                  {isPerformance && (
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Content Type")}</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setCampaignCategory("clipping")}
                          className={`text-left p-4 rounded-2xl border transition-all ${
                            !isUgc
                              ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                              : "bg-secondary/30 border-border/20 hover:bg-secondary/50"
                          }`}
                        >
                          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                            <Scissors size={14} className="text-primary" /> {t("Clipping")}
                          </span>
                          <span className="block text-[11px] text-muted-foreground mt-1 leading-normal">
                            {t(CAMPAIGN_CATEGORY_DESCRIPTIONS.clipping)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCampaignCategory("ugc")}
                          className={`text-left p-4 rounded-2xl border transition-all ${
                            isUgc
                              ? "bg-primary/10 border-primary/40 ring-1 ring-primary/30"
                              : "bg-secondary/30 border-border/20 hover:bg-secondary/50"
                          }`}
                        >
                          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                            <FileText size={14} className="text-[#FF9500]" /> {t("UGC")}
                          </span>
                          <span className="block text-[11px] text-muted-foreground mt-1 leading-normal">
                            {t(CAMPAIGN_CATEGORY_DESCRIPTIONS.ugc)}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Campaign Title")}</label>
                    <input
                      type="text"
                      placeholder={t("e.g. Summer Tech Capsule Launch")}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/45"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Core Brief & Instructions")}</label>
                    <textarea
                      placeholder={t("Detail your product highlights, brand aesthetics, guidelines, and instructions for content creators...")}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all resize-none placeholder:text-muted-foreground/45"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Target Niches (Select up to 3)")}</label>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_NICHES.map((niche) => {
                        const isSelected = niches.includes(niche);
                        return (
                          <button
                            key={niche}
                            type="button"
                            onClick={() => handleNicheToggle(niche)}
                            className={`text-xs px-3.5 py-2 rounded-full font-semibold transition-all border ${
                              isSelected 
                                ? "bg-primary text-white border-primary shadow-sm" 
                                : "bg-secondary/40 text-muted-foreground border-transparent hover:bg-secondary/70 hover:text-foreground"
                            }`}
                          >
                            {t(niche)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 2: AUDIENCE */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={appleSpring}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-foreground">{t("Target Audience")}</h3>
                    <p className="text-xs text-muted-foreground">{t("Specify creator demographic match parameters.")}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Audience Location")}</label>
                      <select
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all cursor-pointer appearance-none bg-no-repeat bg-[right_1rem_center]"
                      >
                        <option className="bg-popover">{t("United States")}</option>
                        <option className="bg-popover">{t("Europe")}</option>
                        <option className="bg-popover">{t("Japan & Asia")}</option>
                        <option className="bg-popover">{t("Global")}</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Age Range")}</label>
                      <select
                        value={ageRange}
                        onChange={(e) => setAgeRange(e.target.value)}
                        className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all cursor-pointer appearance-none"
                      >
                        <option className="bg-popover">18-24</option>
                        <option className="bg-popover">18-34</option>
                        <option className="bg-popover">25-45</option>
                        <option className="bg-popover">{t("All Ages")}</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Gender Distribution")}</label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all cursor-pointer appearance-none"
                      >
                        <option className="bg-popover">{t("All")}</option>
                        <option className="bg-popover">{t("Female")}</option>
                        <option className="bg-popover">{t("Male")}</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Minimum Follower Count")}</label>
                      <input
                        type="number"
                        placeholder="10000"
                        value={minFollowers}
                        onChange={(e) => setMinFollowers(Number(e.target.value))}
                        className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 3: DELIVERABLES */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={appleSpring}
                  className="space-y-6"
                >
                  <div className="flex justify-between items-center border-b border-border/10 pb-4">
                    <div>
                      <h3 className="text-lg font-bold tracking-tight text-foreground">{t("Deliverables Specification")}</h3>
                      <p className="text-xs text-muted-foreground">{t("Outline expected content formats.")}</p>
                    </div>
                    <Button 
                      type="button" 
                      onClick={addDeliverable} 
                      variant="outline"
                      className="rounded-full px-4 py-4 text-xs font-semibold gap-1.5 cursor-pointer border-border hover:bg-secondary/40 text-foreground h-auto"
                    >
                      <Plus size={13} /> {t("Add Item")}
                    </Button>
                  </div>

                  <div className="space-y-4 max-h-[320px] overflow-y-auto pr-2 no-scrollbar">
                    {deliverables.map((item, idx) => (
                      <div key={idx} className="p-5 rounded-2xl bg-secondary/20 border border-border/10 flex gap-4 items-start relative">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">{t("Format")}</label>
                            <select
                              value={item.type}
                              onChange={(e) => updateDeliverable(idx, "type", e.target.value)}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-border/20 bg-background focus:outline-none focus:border-primary/60 cursor-pointer"
                            >
                              <option value="post">{t("Grid Post")}</option>
                              <option value="video">{t("Short Video")}</option>
                              <option value="story">{t("Social Story")}</option>
                            </select>
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">{t("Quantity")}</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateDeliverable(idx, "quantity", Number(e.target.value))}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-border/20 bg-background focus:outline-none focus:border-primary/60"
                            />
                          </div>

                          <div className="space-y-1 md:col-span-2">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">{t("Details")}</label>
                            <input
                              type="text"
                              placeholder={t("e.g. keyboard sound clip, workspace layout zoom...")}
                              value={item.details}
                              onChange={(e) => updateDeliverable(idx, "details", e.target.value)}
                              className="w-full px-3 py-2 text-xs rounded-lg border border-border/20 bg-background focus:outline-none focus:border-primary/60 placeholder:text-muted-foreground/35"
                            />
                          </div>
                        </div>

                        {deliverables.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeDeliverable(idx)}
                            className="p-2 rounded-xl text-destructive hover:bg-destructive/10 transition-colors mt-4 self-center"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* STEP 4: BUDGET */}
              {step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={appleSpring}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-foreground">
                      {isPerformance ? t("Budget Pool & Payout Rate") : t("Budget & Escrow Allocation")}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {isPerformance
                        ? t("Fund a shared pool. Creators earn from it based on the views their clips generate.")
                        : t("Specify funding committed to this campaign escrow hold.")}
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="p-2 rounded-xl bg-primary/10 text-primary">
                        {isPerformance ? <Zap size={15} /> : <Lock size={15} />}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-foreground">
                          {isPerformance ? t("Performance budget pool") : t("Secure Stripe Escrow Holding")}
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-normal">
                          {isPerformance
                            ? t("The pool is funded on publish. Earnings accrue as views come in and become withdrawable after the holdback window.")
                            : t("Budget is safely locked upon publishing and only routed to the creator's payout balance after content draft approval.")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      {isPerformance ? t("Total Budget Pool ($)") : t("Total Campaign Escrow Budget ($)")}
                    </label>
                    <div className="relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <span className="text-muted-foreground font-bold text-sm">$</span>
                      </div>
                      <input
                        type="number"
                        placeholder="2500"
                        value={budgetTotal}
                        onChange={(e) => setBudgetTotal(Number(e.target.value))}
                        className="w-full pl-8 pr-4 py-4 text-xl font-bold rounded-xl border border-border bg-secondary/20 focus:outline-none focus:border-primary/85 focus:ring-1 focus:ring-primary/40 transition-all"
                      />
                    </div>
                  </div>

                  {isPerformance ? (
                    <div className="space-y-6">
                      {/* Platform fee transparency: what the brand pays vs creators earn. */}
                      <div className="p-4 rounded-2xl bg-secondary/20 border border-border/10">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-3">
                          {t("Budget split")}
                        </span>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <span className="block text-[9px] text-muted-foreground uppercase font-bold mb-0.5">{t("You pay")}</span>
                            <span className="text-sm font-extrabold text-foreground">${budgetTotal.toLocaleString()}</span>
                          </div>
                          <div className="border-x border-border/10">
                            <span className="block text-[9px] text-muted-foreground uppercase font-bold mb-0.5">{t("Platform fee (10%)")}</span>
                            <span className="text-sm font-extrabold text-[#FF9500]">${poolSplit.fee.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="block text-[9px] text-muted-foreground uppercase font-bold mb-0.5">{t("Creators earn")}</span>
                            <span className="text-sm font-extrabold text-[#34C759]">${poolSplit.creators.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("CPM you set — $ per 1,000 views (creators are paid this rate)")}</label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground font-bold text-sm">$</span>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={cpmRate}
                              onChange={(e) => setCpmRate(Number(e.target.value))}
                              className="w-full pl-8 pr-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Max payout per creator ($, 0 = uncapped)")}</label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground font-bold text-sm">$</span>
                            <input
                              type="number"
                              min="0"
                              value={maxPayoutPerCreator}
                              onChange={(e) => setMaxPayoutPerCreator(Number(e.target.value))}
                              className="w-full pl-8 pr-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("View holdback (hours)")}</label>
                          <input
                            type="number"
                            min="0"
                            value={viewHoldbackHours}
                            onChange={(e) => setViewHoldbackHours(Number(e.target.value))}
                            className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Eligible platforms")}</label>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {["tiktok", "instagram", "youtube"].map((p) => {
                              const active = platforms.includes(p);
                              return (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => togglePlatform(p)}
                                  className={`text-xs px-3.5 py-2 rounded-full font-semibold capitalize transition-all border ${
                                    active
                                      ? "bg-primary text-white border-primary shadow-sm"
                                      : "bg-secondary/40 text-muted-foreground border-transparent hover:bg-secondary/70 hover:text-foreground"
                                  }`}
                                >
                                  {p}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Content rules / asset kit")}</label>
                        <textarea
                          rows={3}
                          placeholder={t("e.g. Hook in first 2s, tag @brand, no competing products, vertical only. Link your footage / asset folder.")}
                          value={contentRules}
                          onChange={(e) => setContentRules(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all resize-none placeholder:text-muted-foreground/45"
                        />
                      </div>

                      {/* Type-specific requirements: Clipping vs UGC */}
                      <div className="rounded-2xl border border-border/15 bg-secondary/[0.04] p-5 space-y-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                          {isUgc ? <FileText size={13} className="text-[#FF9500]" /> : <Scissors size={13} className="text-primary" />}
                          {isUgc ? t("UGC brief") : t("Clipping spec")}
                        </span>

                        {isUgc ? (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Creative direction")}</label>
                              <textarea
                                rows={2}
                                placeholder={t("Concept, mood, framing, what the content should feel like...")}
                                value={creativeDirection}
                                onChange={(e) => setCreativeDirection(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all resize-none placeholder:text-muted-foreground/45"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("References (links)")}</label>
                              <input
                                type="text"
                                placeholder={t("Links to example posts / a moodboard")}
                                value={references}
                                onChange={(e) => setReferences(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/45"
                              />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-[#34C759] uppercase tracking-wider block">{t("Do's")}</label>
                                <textarea
                                  rows={2}
                                  placeholder={t("Show the product in use, natural lighting...")}
                                  value={dos}
                                  onChange={(e) => setDos(e.target.value)}
                                  className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all resize-none placeholder:text-muted-foreground/45"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-destructive uppercase tracking-wider block">{t("Don'ts")}</label>
                                <textarea
                                  rows={2}
                                  placeholder={t("No competing brands, no profanity...")}
                                  value={donts}
                                  onChange={(e) => setDonts(e.target.value)}
                                  className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all resize-none placeholder:text-muted-foreground/45"
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Source video / footage link")}</label>
                              <input
                                type="text"
                                placeholder={t("https://drive.google.com/... or a YouTube/stream link to clip from")}
                                value={sourceUrl}
                                onChange={(e) => setSourceUrl(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/45"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Min clip length (sec)")}</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={clipMinSec}
                                  onChange={(e) => setClipMinSec(Number(e.target.value))}
                                  className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Max clip length (sec)")}</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={clipMaxSec}
                                  onChange={(e) => setClipMaxSec(Number(e.target.value))}
                                  className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Clip requirements")}</label>
                              <textarea
                                rows={2}
                                placeholder={t("Which moments to clip, captions/subtitles, aspect ratio...")}
                                value={clipRequirements}
                                onChange={(e) => setClipRequirements(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all resize-none placeholder:text-muted-foreground/45"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 items-center text-xs text-muted-foreground bg-secondary/20 p-4 rounded-xl border border-border/10">
                        <Eye size={14} className="shrink-0 text-primary" />
                        <span>
                          {t("Est. reach:")}{" "}
                          <span className="font-bold text-foreground">
                            {cpmRate > 0 ? Math.round((poolSplit.creators / cpmRate) * 1000).toLocaleString() : "—"}
                          </span>{" "}
                          {t("paid views before the creator pool is exhausted.")}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center text-xs text-muted-foreground bg-secondary/20 p-4 rounded-xl border border-border/10">
                      <Info size={14} className="shrink-0 text-primary" />
                      <span>{t("Based on targeted niches, matching micro-creators generally expect $1,200 - $3,500.")}</span>
                    </div>
                  )}
                </motion.div>
              )}

              {/* STEP 5: TIMELINE */}
              {step === 5 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={appleSpring}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-foreground">{t("Timeline & Milestones")}</h3>
                    <p className="text-xs text-muted-foreground">{t("Schedule key deliverable milestones for creators.")}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Start Date")}</label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 transition-all text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Draft Submission Due")}</label>
                      <input
                        type="date"
                        value={draftDueDate}
                        onChange={(e) => setDraftDueDate(e.target.value)}
                        className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 transition-all text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("End Date (Close)")}</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 transition-all text-foreground"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 6: REVIEW */}
              {step === 6 && (
                <motion.div
                  key="step6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={appleSpring}
                  className="space-y-6"
                >
                  <div>
                    <h3 className="text-lg font-bold tracking-tight text-foreground">{t("Campaign Summary Review")}</h3>
                    <p className="text-xs text-muted-foreground">{t("Verify details before committing campaign budget lock.")}</p>
                  </div>

                  <div className="space-y-6 divide-y divide-border/10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{t("Title")}</span>
                        <p className="text-sm font-bold text-foreground mt-0.5">{title || t("Untitled Campaign")}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border ${isPerformance ? "bg-primary/10 text-primary border-primary/20" : "bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20"}`}>
                            {isPerformance ? t("Performance") : t("Fixed fee")}
                          </span>
                          {isPerformance && (
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase border bg-secondary text-muted-foreground border-border/30 flex items-center gap-1">
                              {isUgc ? <FileText size={9} /> : <Scissors size={9} />}
                              {isUgc ? t("UGC") : t("Clipping")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{t("Target Niches")}</span>
                        <div className="flex gap-1.5 mt-1">
                          {niches.map((n) => (
                            <span key={n} className="text-[9px] font-bold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full uppercase border border-primary/20">
                              {t(n)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 pb-4">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">{t("Brief Description")}</span>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-1 whitespace-pre-wrap">{description}</p>
                    </div>

                    {objectives.length > 0 && (
                      <div className="pt-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">{t("AI Generated Objectives")}</span>
                          <ul className="list-disc list-inside text-xs text-muted-foreground mt-2 space-y-1">
                            {objectives.map((o, idx) => (
                              <li key={idx} className="leading-relaxed">{o}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">{t("AI Brand Guidelines")}</span>
                          <ul className="list-disc list-inside text-xs text-muted-foreground mt-2 space-y-1">
                            {guidelines.map((g, idx) => (
                              <li key={idx} className="leading-relaxed">{g}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {kpis.length > 0 && (
                      <div className="pt-4 pb-4">
                        <span className="text-[10px] font-bold text-[#FF9500] uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles size={11} className="fill-[#FF9500]" /> {t("Target Success KPIs")}
                        </span>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2.5">
                          {kpis.map((k, idx) => (
                            <div key={idx} className="p-3.5 bg-secondary/25 border border-border/10 rounded-2xl text-[11px] font-semibold text-foreground">
                              {k}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 pb-4">
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{t("Required Follower Reach")}</span>
                        <p className="text-xs font-semibold text-foreground mt-1">{minFollowers.toLocaleString()}+ {t("followers")}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{t("Creator Region")}</span>
                        <p className="text-xs font-semibold text-foreground mt-1">{t(location)}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{t("Committed Escrow")}</span>
                        <p className="text-sm font-extrabold text-[#34C759] mt-0.5">${budgetTotal.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="pt-4">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase">{t("Milestone Schedule")}</span>
                      <div className="flex justify-between bg-secondary/20 p-4 rounded-xl border border-border/10 text-xs mt-2.5">
                        <div>
                          <span className="block text-[9px] font-bold text-muted-foreground uppercase">{t("Start")}</span>
                          <span className="font-semibold text-foreground">{startDate}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold text-muted-foreground uppercase">{t("Draft Due")}</span>
                          <span className="font-semibold text-foreground">{draftDueDate}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold text-muted-foreground uppercase">{t("Campaign Close")}</span>
                          <span className="font-semibold text-foreground">{endDate}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="flex justify-between items-center mt-12 pt-6 border-t border-border/10">
              {step > 1 ? (
                <Button
                  onClick={() => setStep(step - 1)}
                  variant="ghost"
                  className="rounded-full px-5 py-4 font-semibold text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-secondary/40 h-auto"
                >
                  <ArrowLeft size={14} /> {t("Back")}
                </Button>
              ) : (
                <div />
              )}

              {step < 6 ? (
                <Button
                  onClick={() => {
                    if (step === 1 && (!title.trim() || !description.trim() || niches.length === 0)) {
                      toast.error(t("Please fill all fields before proceeding."));
                      return;
                    }
                    setStep(step + 1);
                  }}
                  className="rounded-full px-6 py-5 font-bold text-xs gap-1.5 cursor-pointer bg-primary text-white border-0 shadow-md hover:scale-[1.01] active:scale-[0.99] transition-transform h-auto"
                >
                  {t("Continue")} <ArrowRight size={14} />
                </Button>
              ) : (
                <Button
                  onClick={handlePublishClick}
                  disabled={poolPublishing}
                  className="rounded-full px-6 py-5 font-bold text-xs gap-1.5 cursor-pointer bg-[#34C759] hover:bg-[#2fb350] hover:scale-[1.02] active:scale-[0.98] transition-transform text-white border-0 shadow-md h-auto"
                >
                  {poolPublishing ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : isPerformance ? (
                    <Zap size={13} />
                  ) : (
                    <Lock size={13} />
                  )}{" "}
                  {isPerformance ? t("Publish & Fund Pool") : t("Publish & Fund Escrow")}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Matchmaking & AI Assistant */}
        <div className="space-y-6">
          {/* Smart Matchmaking Preview Card */}
          <div className="p-6 rounded-3xl bg-card border border-border/30 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-[120px] h-[60px] bg-gradient-to-l from-primary/8 to-transparent blur-[35px] pointer-events-none" />
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">{t("Matching Preview")}</span>
                <h3 className="text-sm font-bold text-foreground">{t("Creators in your niches")}</h3>
              </div>
              <span className="p-2 rounded-xl bg-primary/10 text-primary">
                <Target size={14} />
              </span>
            </div>

            <div className="space-y-4">
              <div className="text-center p-4 bg-secondary/20 rounded-2xl border border-border/10">
                <span className="text-2xl font-extrabold text-foreground block">
                  {creatorsLoading ? "—" : matchedCreators.length}
                </span>
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">
                  {t("Matching creators found")}
                </span>
              </div>

              <div className="space-y-2.5">
                {niches.length === 0 ? (
                  <div className="py-6 text-center text-[11px] text-muted-foreground leading-relaxed">
                    {t("Pick target niches to preview creators who match.")}
                  </div>
                ) : creatorsLoading ? (
                  <div className="space-y-2.5">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-border/5">
                        <div className="w-8 h-8 rounded-full bg-secondary/60 animate-pulse shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 w-24 bg-secondary/60 rounded animate-pulse" />
                          <div className="h-2 w-16 bg-secondary/60 rounded animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : matchedCreators.length === 0 ? (
                  <div className="py-6 flex flex-col items-center justify-center text-center gap-2 border border-dashed border-border/40 rounded-2xl bg-secondary/10">
                    <Users size={20} className="text-muted-foreground/50" />
                    <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[200px]">
                      {t("No creators match these niches yet — they'll appear here as creators join Aether.")}
                    </p>
                  </div>
                ) : (
                  <>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Top matches in target niches")}</span>
                    {matchedCreators.map((creator) => (
                      <div key={creator.user_id} className="flex items-center gap-3 p-2.5 bg-secondary/15 hover:bg-secondary/25 rounded-xl transition-colors border border-border/5">
                        <span className="w-8 h-8 rounded-full bg-primary/10 text-primary border border-border/10 shrink-0 flex items-center justify-center text-xs font-bold uppercase">
                          {(creator.full_name || "?").charAt(0)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-foreground block truncate leading-tight">{creator.full_name || t("Creator")}</span>
                          <span className="text-[10px] text-muted-foreground block truncate mt-0.5">
                            {(creator.follower_count ?? 0).toLocaleString()} {t("followers")}
                          </span>
                        </div>
                        {creator.engagement_rate ? (
                          <span className="text-[10px] font-bold bg-[#34C759]/10 text-[#34C759] px-2 py-0.5 rounded-full shrink-0">
                            {Number(creator.engagement_rate).toFixed(1)}% ER
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Assistant Info */}
          <div className="p-6 rounded-3xl bg-secondary/20 border border-border/15 space-y-3">
            <div className="flex gap-2.5 items-start">
              <Info size={15} className="text-primary shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-foreground">{t("Need help creating your campaign brief?")}</h4>
                <p className="text-[11px] text-muted-foreground leading-normal">
                  {t("Use the **AI Brief Generator** button in the Goal step. Paste a simple raw idea and our system will draft a professional structure automatically.")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: AI Brief generator */}
      <AnimatePresence>
        {showAiModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !aiGenerating && setShowAiModal(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={appleSpring}
              className="w-full max-w-lg bg-card border border-border/40 rounded-3xl shadow-2xl p-8 overflow-hidden relative z-10"
            >
              {aiGenerating && (
                <div className="absolute inset-0 bg-popover/95 backdrop-blur-md z-20 flex flex-col items-center justify-center gap-4 text-center p-6">
                  <div className="relative">
                    <Loader2 size={36} className="animate-spin text-primary" />
                    <Sparkles size={16} className="absolute -top-1 -right-1 text-purple-500 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{t("Aether AI is crafting your brief...")}</h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[280px] leading-relaxed">{t("Generating titles, audience demographics, target niches, milestones, and deliverable targets.")}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <span className="p-2 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/25">
                  <Sparkles size={16} />
                </span>
                <h3 className="text-lg font-bold tracking-tight text-foreground">{t("AI Brief Assistant")}</h3>
              </div>

              <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                {t("Paste your raw product idea, brand pillars, or campaign goals. Aether will auto-populate and configure the multi-step wizard parameters.")}
              </p>

              <textarea
                placeholder={t("e.g. Launching a new aluminum desk stand for Apple Studio Display. Focus on productivity tech influencers with organic visual desks. Budget around $3000...")}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all resize-none mb-6 text-foreground placeholder:text-muted-foreground/35"
              />

              <div className="flex justify-end gap-3 border-t border-border/10 pt-4">
                <Button 
                  onClick={() => setShowAiModal(false)} 
                  variant="ghost" 
                  disabled={aiGenerating}
                  className="rounded-full px-5 py-3 text-xs font-semibold cursor-pointer text-muted-foreground hover:text-foreground h-auto"
                >
                  {t("Cancel")}
                </Button>
                <Button
                  onClick={handleGenerateAiBrief}
                  disabled={aiGenerating || !aiPrompt.trim()}
                  className="rounded-full px-5 py-3 text-xs font-bold bg-gradient-to-r from-[#8E2DE2] to-[#4A00E0] hover:opacity-90 transition-opacity text-white border-0 cursor-pointer shadow-md h-auto"
                >
                  {t("Generate Brief")}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Fixed-fee publish confirmation */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !paying && setShowPaymentModal(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={appleSpring}
              className="w-full max-w-md bg-card border border-border/40 rounded-3xl shadow-2xl p-8 overflow-hidden relative z-10"
            >
              {paying && (
                <div className="absolute inset-0 bg-popover/95 backdrop-blur-md z-20 flex flex-col items-center justify-center gap-3 text-center">
                  <Loader2 size={32} className="animate-spin text-primary" />
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{t("Publishing campaign...")}</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("Creating your campaign and opening it for applications.")}</p>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-primary block mb-0.5">{t("Review & Publish")}</span>
                  <h3 className="text-lg font-bold text-foreground">{t("Publish Fixed-Fee Campaign")}</h3>
                </div>
                <span className="p-2 rounded-xl bg-primary/10 border border-primary/25 text-primary">
                  <Check size={16} />
                </span>
              </div>

              <div className="mb-6 p-4 rounded-2xl bg-secondary/30 border border-border/10 text-xs space-y-1">
                <div className="flex justify-between font-semibold text-muted-foreground">
                  <span>{t("Campaign:")}</span>
                  <span className="text-foreground text-right truncate max-w-[200px]">{title || t("New Campaign")}</span>
                </div>
                <div className="flex justify-between font-semibold text-muted-foreground pt-1">
                  <span>{t("Target niches:")}</span>
                  <span className="text-foreground text-right truncate max-w-[200px]">{niches.length > 0 ? niches.join(", ") : "—"}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-border/10 pt-2.5 mt-2.5">
                  <span>{t("Campaign Budget:")}</span>
                  <span className="text-foreground">${budgetTotal.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex gap-2 items-start text-[11px] text-muted-foreground leading-relaxed mb-8 bg-secondary/10 p-3 rounded-xl border border-border/5">
                <Lock size={13} className="text-primary shrink-0 mt-0.5" />
                <span>{t("No charge now. Your campaign opens for applications immediately — you fund Stripe escrow per creator when you approve them from the campaign workspace.")}</span>
              </div>

              <div className="flex gap-3 border-t border-border/10 pt-4">
                <Button 
                  onClick={() => setShowPaymentModal(false)} 
                  variant="ghost" 
                  disabled={paying}
                  className="w-1/2 rounded-full py-3 text-xs font-semibold cursor-pointer text-muted-foreground hover:text-foreground h-auto"
                >
                  {t("Cancel")}
                </Button>
                <Button
                  onClick={handleConfirmPayment}
                  disabled={paying}
                  className="w-1/2 rounded-full py-3 text-xs font-bold bg-primary hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-transform text-primary-foreground border-0 cursor-pointer shadow-md h-auto"
                >
                  {t("Publish Campaign")}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Performance pool funding — real Stripe Elements */}
      <PoolPaymentModal
        open={!!poolFunding}
        clientSecret={poolFunding?.clientSecret ?? null}
        amount={poolFunding?.amount ?? budgetTotal}
        campaignTitle={poolFunding?.title ?? title}
        onSucceeded={() => {
          setPoolFunding(null);
          celebrate();
          toast.success(t("Payment received!"), {
            description: t("Your campaign is being activated and will go live shortly."),
          });
          router.push("/business/dashboard");
        }}
        onClose={() => setPoolFunding(null)}
      />
    </div>
  );
}
