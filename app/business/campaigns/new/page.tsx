"use client";

import { useEffect, useState } from "react";
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
  DollarSign, 
  Users, 
  Layers, 
  Calendar, 
  Target, 
  Info,
  Loader2,
  Lock,
  CreditCard,
  CheckCircle2,
  Zap,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { createCampaignAction } from "@/lib/supabase/campaigns";
import { generateCampaignBriefAction } from "@/lib/actions/ai";
import { useTranslation } from "@/lib/translations";

// Standard niches list
const AVAILABLE_NICHES = [
  "Tech", "Design", "Minimal", "Lifestyle", "Wellness", 
  "Fashion", "Beauty", "Fitness", "Food", "Travel", "Gaming"
];

// Seeded influencers for matchmaking preview
const MOCK_CREATORS = [
  { name: "Marcus Vance", handle: "@marcusv", niche: "Tech", ER: "4.8%", followers: "48.5K", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" },
  { name: "Sofia Chen", handle: "@sofiac", niche: "Design", ER: "5.2%", followers: "62.0K", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" },
  { name: "Dave Miller", handle: "@davem", niche: "Minimal", ER: "4.1%", followers: "12.5K", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" },
  { name: "Emma Watson", handle: "@emmaw", niche: "Lifestyle", ER: "3.9%", followers: "28.0K", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" },
  { name: "Julian Pierce", handle: "@julianp", niche: "Wellness", ER: "4.6%", followers: "34.2K", avatar: "https://images.unsplash.com/photo-1500048993953-d23a436266cf?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" }
];

export default function NewCampaignWizard() {
  const router = useRouter();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  
  // Payment States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [cardExpiry, setCardExpiry] = useState("12/28");
  const [cardCvc, setCardCvc] = useState("342");

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
  const [toneOfVoice, setToneOfVoice] = useState<string[]>([]);
  const [guidelines, setGuidelines] = useState<string[]>([]);
  const [keyMessaging, setKeyMessaging] = useState("");
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

  const updateDeliverable = (index: number, field: string, value: any) => {
    const updated = [...deliverables];
    updated[index] = { ...updated[index], [field]: value };
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
        setToneOfVoice(brief.tone_of_voice || []);
        setGuidelines(brief.guidelines || []);
        setKeyMessaging(brief.key_messaging || "");
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
    } catch (err: any) {
      toast.error(t("Brief generation failed"), {
        description: err.message || t("An unexpected error occurred.")
      });
    } finally {
      setAiGenerating(false);
    }
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
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    setPaying(true);
    try {
      // Simulate PaymentIntent verification delay
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      const campaignPayload = {
        title,
        description,
        budget_total: budgetTotal,
        target_niches: niches,
        target_audience: { location, ageRange, gender, minFollowers },
        deliverables,
        timeline: { startDate, endDate, draftDueDate },
        status: "open", // transition from draft to open after payment
        campaign_type: campaignType,
        ...(isPerformance
          ? {
              cpm_rate: cpmRate,
              budget_pool: budgetTotal,
              max_payout_per_creator:
                maxPayoutPerCreator > 0 ? maxPayoutPerCreator : null,
              platforms,
              view_holdback_hours: viewHoldbackHours,
              content_rules: contentRules.trim()
                ? { notes: contentRules.trim() }
                : {},
            }
          : {}),
      };

      const res = await createCampaignAction(campaignPayload);
      
      if (res.success && res.campaign) {
        // Rich escrow detail state is only relevant to fixed-fee campaigns.
        if (!isPerformance) {
        // Construct and save the rich campaign detail state
        const richData = {
          id: res.campaign.id,
          title,
          budget: budgetTotal,
          status: "escrowed", // Locked after checkout
          brief: {
            objectives: objectives.length > 0 ? objectives : [
              `Showcase ${title} in natural, minimalist aesthetics.`,
              `Highlight core product features and ergonomics.`,
              `Drive conversions via customized creator discount codes.`
            ],
            toneOfVoice: toneOfVoice.length > 0 ? toneOfVoice : ["Minimalist", "Aesthetic", "Sophisticated", "Warm"],
            guidelines: guidelines.length > 0 ? guidelines : [
              "Position the product in primary visual focus in the first 3 seconds.",
              "Tag the brand and include the landing page link in your bio.",
              "Do not showcase competing products in the same content frames."
            ],
            keyMessaging: keyMessaging || `Elevate your daily focus with ${title}.`,
            kpis: kpis.length > 0 ? kpis : [
              `Deliver ${Math.max(50000, minFollowers * 5).toLocaleString()}+ total impressions`,
              "Achieve 4.0% average engagement rate on posts",
              "Generate a positive ROI on attributed sales"
            ]
          },
          deliverables: deliverables.map(d => ({
            type: d.type === "post" ? "Aesthetic Post" : d.type === "video" ? "Video Review" : "Social Story",
            description: d.details || "Premium aesthetic visual content",
            platform: d.type === "video" ? "TikTok" as const : "Instagram" as const,
            count: d.quantity
          })),
          timeline: [
            { label: "Application & Verification", date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), completed: true },
            { label: "Stripe Escrow Funding", date: new Date(startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), completed: true },
            { label: "Draft Deliverable Upload", date: new Date(draftDueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), completed: false },
            { label: "Review & Adjustments", date: new Date(endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), completed: false },
            { label: "Content Release & Payout", date: new Date(endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), completed: false }
          ],
          participants: [
            {
              id: "mock-influencer-uuid", // Marcus Vance
              fullName: "Marcus Vance",
              handle: "@marcusv",
              avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
              status: "applied",
              payout: budgetTotal,
              submissions: []
            }
          ]
        };
        localStorage.setItem(`aether-campaign-rich-data-${res.campaign.id}`, JSON.stringify(richData));
        }

        // Trigger confetti celebration!
        const end = Date.now() + 2 * 1000;
        const frame = () => {
          confetti({
            particleCount: 5,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ["#007AFF", "#34C759", "#FF9500"]
          });
          confetti({
            particleCount: 5,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ["#007AFF", "#34C759", "#FF9500"]
          });
          if (Date.now() < end) {
            requestAnimationFrame(frame);
          }
        };
        frame();

        toast.success(t("Campaign Published!"), {
          description: isPerformance
            ? t("Budget pool funded. Creators can now join and start clipping.")
            : t("Escrow funds locked successfully. Live matchmaking is now active.")
        });
        
        setShowPaymentModal(false);
        router.push("/business/dashboard");
      } else {
        toast.error(t("Failed to create campaign"), {
          description: res.error || t("Unknown database error.")
        });
      }
    } catch (err: any) {
      toast.error(t("Escrow payment failed"), {
        description: err.message || t("An unexpected error occurred.")
      });
    } finally {
      setPaying(false);
    }
  };

  // Matchmaking Calculations
  const recommendedCreatorsCount = Math.max(1, Math.min(25, Math.round(budgetTotal / 250)));
  const matchingCreators = MOCK_CREATORS.filter(c => niches.includes(c.niche));
  const suggestedCreatorsList = matchingCreators.length > 0 ? matchingCreators : MOCK_CREATORS.slice(0, 3);

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
                            ? t("The pool is funded on publish. Earnings accrue as views come in and are paid out automatically after the holdback window.")
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Payout rate — CPM ($ per 1,000 views)")}</label>
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

                      <div className="flex gap-2 items-center text-xs text-muted-foreground bg-secondary/20 p-4 rounded-xl border border-border/10">
                        <Eye size={14} className="shrink-0 text-primary" />
                        <span>
                          {t("Est. reach:")}{" "}
                          <span className="font-bold text-foreground">
                            {cpmRate > 0 ? Math.round((budgetTotal / cpmRate) * 1000).toLocaleString() : "—"}
                          </span>{" "}
                          {t("paid views before the pool is exhausted.")}
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
                  className="rounded-full px-6 py-5 font-bold text-xs gap-1.5 cursor-pointer bg-[#34C759] hover:bg-[#2fb350] hover:scale-[1.02] active:scale-[0.98] transition-transform text-white border-0 shadow-md h-auto"
                >
                  {isPerformance ? <Zap size={13} /> : <Lock size={13} />}{" "}
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
                <h3 className="text-sm font-bold text-foreground">{t("Target Recommendations")}</h3>
              </div>
              <span className="p-2 rounded-xl bg-primary/10 text-primary">
                <Target size={14} />
              </span>
            </div>

            <div className="space-y-4">
              <div className="text-center p-4 bg-secondary/20 rounded-2xl border border-border/10">
                <span className="text-2xl font-extrabold text-foreground block">
                  {recommendedCreatorsCount}
                </span>
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">
                  {t("Recommended Micro-Creators")}
                </span>
              </div>

              <div className="space-y-2.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Recommended in target niches")}</span>
                {suggestedCreatorsList.map((creator) => (
                  <div key={creator.handle} className="flex items-center gap-3 p-2.5 bg-secondary/15 hover:bg-secondary/25 rounded-xl transition-colors border border-border/5">
                    <img 
                      src={creator.avatar} 
                      alt={creator.name} 
                      className="w-8 h-8 rounded-full object-cover border border-border/10 shrink-0" 
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-foreground block truncate leading-tight">{creator.name}</span>
                      <span className="text-[10px] text-muted-foreground block truncate mt-0.5">{creator.handle} • {creator.followers}</span>
                    </div>
                    <span className="text-[10px] font-bold bg-[#34C759]/10 text-[#34C759] px-2 py-0.5 rounded-full shrink-0">
                      {creator.ER} ER
                    </span>
                  </div>
                ))}
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

      {/* MODAL: Stripe Escrow Card Payment */}
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
                  <Loader2 size={32} className="animate-spin text-[#34C759]" />
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{t("Creating Stripe PaymentIntent...")}</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("Securing funds in smart escrow contract holding.")}</p>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-start mb-6">
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#34C759] block mb-0.5">{t("Stripe Escrow Wallet")}</span>
                  <h3 className="text-lg font-bold text-foreground">{t("Secure Campaign Funding")}</h3>
                </div>
                <span className="p-2 rounded-xl bg-[#34C759]/10 border border-[#34C759]/25 text-[#34C759]">
                  <Lock size={16} />
                </span>
              </div>

              <div className="mb-6 p-4 rounded-2xl bg-secondary/30 border border-border/10 text-xs space-y-1">
                <div className="flex justify-between font-semibold text-muted-foreground">
                  <span>{t("Campaign:")}</span>
                  <span className="text-foreground text-right truncate max-w-[200px]">{title || t("New Campaign")}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t border-border/10 pt-2.5 mt-2.5">
                  <span>{isPerformance ? t("Total Budget Pool:") : t("Total Escrow Hold:")}</span>
                  <span className="text-[#34C759]">${budgetTotal.toLocaleString()}</span>
                </div>
              </div>

              {/* Simulated Card Element */}
              <div className="space-y-4 mb-8">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("Card Details")}</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-secondary/30 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all font-mono text-foreground"
                    />
                    <CreditCard size={14} className="absolute left-3.5 top-3.5 text-muted-foreground" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("Expiration")}</label>
                    <input
                      type="text"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all font-mono text-foreground"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("CVC")}</label>
                    <input
                      type="text"
                      value={cardCvc}
                      onChange={(e) => setCardCvc(e.target.value)}
                      className="w-full px-4 py-3 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all font-mono text-foreground"
                    />
                  </div>
                </div>

                <div className="flex gap-2 items-center text-[10px] text-muted-foreground leading-normal mt-2 bg-secondary/10 p-3 rounded-xl border border-border/5">
                  <CheckCircle2 size={12} className="text-[#34C759] shrink-0" />
                  <span>{t("Stripe sandbox cards pre-loaded. Escrow will fund automatically.")}</span>
                </div>
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
                  className="w-1/2 rounded-full py-3 text-xs font-bold bg-[#34C759] hover:bg-[#2fb350] hover:scale-[1.02] active:scale-[0.98] transition-transform text-white border-0 cursor-pointer shadow-md h-auto"
                >
                  {t("Fund & Publish")}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
