"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Eye,
  FileText,
  Gauge,
  Globe2,
  Info,
  Loader2,
  Lock,
  Plus,
  Scissors,
  Sparkles,
  Target,
  Trash2,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import confetti from "canvas-confetti";

import {
  BusinessActionButton,
  BusinessGlassCard,
  BusinessMetricCard,
  BusinessProgressBar,
  BusinessSectionHeader,
  BusinessStatusPill,
  type BusinessTone,
} from "@/components/business/business-ui";
import { PoolPaymentModal } from "@/components/pool-payment-modal";
import {
  CAMPAIGN_CATEGORY_DESCRIPTIONS,
  type CampaignCategory,
} from "@/lib/campaign-category";
import { validateCategoryMeta } from "@/lib/campaign-category-meta";
import { feeBreakdown } from "@/lib/campaign-budget";
import { generateCampaignBriefAction } from "@/lib/actions/ai";
import { supabase } from "@/lib/supabase/client";
import { createCampaignAction } from "@/lib/supabase/campaigns";
import { fundCampaignPoolAction } from "@/lib/stripe/actions";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/translations";

const AVAILABLE_NICHES = [
  "Tech",
  "Design",
  "Minimal",
  "Lifestyle",
  "Wellness",
  "Fashion",
  "Beauty",
  "Fitness",
  "Food",
  "Travel",
  "Gaming",
];

const wizardSteps: Array<{
  id: number;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: 1, label: "Goal", description: "Campaign model and brief", icon: Sparkles },
  { id: 2, label: "Audience", description: "Creator targeting", icon: Target },
  { id: 3, label: "Deliverables", description: "Expected formats", icon: ClipboardCheck },
  { id: 4, label: "Budget", description: "RPM and pool rules", icon: CircleDollarSign },
  { id: 5, label: "Timeline", description: "Milestones", icon: CalendarDays },
  { id: 6, label: "Review", description: "Launch readiness", icon: CheckCircle2 },
];

const platformOptions: Array<{
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "tiktok", label: "TikTok", description: "Short-form velocity", icon: Zap },
  { id: "instagram", label: "Instagram", description: "Reels distribution", icon: Eye },
  { id: "youtube", label: "YouTube", description: "Shorts reach", icon: Globe2 },
];

type Deliverable = {
  type: "post" | "video" | "story";
  quantity: number;
  details: string;
};

interface MatchCreator {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  niches: string[] | null;
  follower_count: number | null;
  engagement_rate: number | null;
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

function positiveNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function payoutViews(amount: number, rpm: number): number {
  if (amount <= 0 || rpm <= 0) return 0;
  return Math.ceil((amount / rpm) * 1000);
}

function FieldLabel({
  children,
  hint,
}: {
  children: string;
  hint?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
        {children}
      </span>
      {hint ? <span className="block text-xs leading-5 text-[var(--business-muted)]">{hint}</span> : null}
    </label>
  );
}

function StepTitle({
  eyebrow,
  title,
  description,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--business-primary)]">
          {eyebrow}
        </p>
        <h2 className="text-xl font-semibold tracking-normal text-[var(--business-text)]">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--business-muted)]">{description}</p>
      </div>
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-[rgba(173,198,255,0.20)] bg-[rgba(173,198,255,0.10)] text-[var(--business-primary)]">
        <Icon size={20} />
      </span>
    </div>
  );
}

function ChoiceCard({
  active,
  title,
  description,
  icon: Icon,
  tone = "accent",
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: BusinessTone;
  onClick: () => void;
}) {
  const toneClass: Record<BusinessTone, string> = {
    neutral: "text-[var(--business-muted)]",
    accent: "text-[var(--business-primary)]",
    secondary: "text-[var(--business-secondary)]",
    info: "text-[var(--business-accent)]",
    success: "text-[var(--business-success)]",
    warning: "text-[var(--business-warning)]",
    danger: "text-[var(--business-danger)]",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-32 rounded-2xl border p-4 text-left transition-colors",
        active
          ? "border-[rgba(173,198,255,0.28)] bg-[rgba(173,198,255,0.12)]"
          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
      )}
    >
      <span className="mb-4 flex items-start justify-between gap-3">
        <span
          className={cn(
            "inline-flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]",
            toneClass[tone]
          )}
        >
          <Icon size={18} />
        </span>
        {active ? (
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--business-primary)] text-[#07101f]">
            <Check size={14} strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="block text-sm font-semibold text-[var(--business-text)]">{title}</span>
      <span className="mt-2 block text-xs leading-5 text-[var(--business-muted)]">{description}</span>
    </button>
  );
}

export default function NewCampaignWizard() {
  const router = useRouter();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [showAiModal, setShowAiModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [matchedCreators, setMatchedCreators] = useState<MatchCreator[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [poolPublishing, setPoolPublishing] = useState(false);
  const [poolFunding, setPoolFunding] = useState<{
    clientSecret: string;
    amount: number;
    campaignId: string;
    title: string;
  } | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [niches, setNiches] = useState<string[]>([]);
  const [location, setLocation] = useState("United States");
  const [ageRange, setAgeRange] = useState("18-34");
  const [gender, setGender] = useState("All");
  const [minFollowers, setMinFollowers] = useState(10000);
  const [objectives, setObjectives] = useState<string[]>([]);
  const [guidelines, setGuidelines] = useState<string[]>([]);
  const [kpis, setKpis] = useState<string[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([
    { type: "video", quantity: 1, details: "Vertical short-form video with captions" },
  ]);
  const [budgetTotal, setBudgetTotal] = useState(2500);
  const [campaignType, setCampaignType] = useState<"fixed" | "performance">("performance");
  const [cpmRate, setCpmRate] = useState(2.5);
  const [minPayoutThreshold, setMinPayoutThreshold] = useState(10);
  const [maxPayoutPerCreator, setMaxPayoutPerCreator] = useState(0);
  const [platforms, setPlatforms] = useState<string[]>(["tiktok", "instagram"]);
  const [viewHoldbackHours, setViewHoldbackHours] = useState(48);
  const [contentRules, setContentRules] = useState("");
  const [campaignCategory, setCampaignCategory] = useState<CampaignCategory>("clipping");
  const [creativeDirection, setCreativeDirection] = useState("");
  const [references, setReferences] = useState("");
  const [dos, setDos] = useState("");
  const [donts, setDonts] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [clipMinSec, setClipMinSec] = useState(10);
  const [clipMaxSec, setClipMaxSec] = useState(60);
  const [clipRequirements, setClipRequirements] = useState("");
  const [startDate, setStartDate] = useState("2026-07-01");
  const [draftDueDate, setDraftDueDate] = useState("2026-07-10");
  const [endDate, setEndDate] = useState("2026-07-31");

  const isPerformance = campaignType === "performance";
  const isUgc = campaignCategory === "ugc";
  const poolSplit = feeBreakdown(budgetTotal);
  const progressPct = Math.round((step / wizardSteps.length) * 100);
  const minThresholdViews = payoutViews(minPayoutThreshold, cpmRate);
  const maxCapViews = payoutViews(maxPayoutPerCreator, cpmRate);
  const estimatedPaidViews = cpmRate > 0 ? Math.round((poolSplit.creators / cpmRate) * 1000) : 0;

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

  const readinessItems = useMemo(
    () => [
      {
        label: "Brief",
        ready: title.trim().length > 0 && description.trim().length > 0 && niches.length > 0,
      },
      {
        label: "Audience",
        ready: location.trim().length > 0 && ageRange.trim().length > 0 && positiveNumber(minFollowers) > 0,
      },
      {
        label: "Deliverables",
        ready: deliverables.length > 0 && deliverables.every((item) => item.quantity > 0 && item.details.trim()),
      },
      {
        label: "Financials",
        ready:
          positiveNumber(budgetTotal) > 0 &&
          (!isPerformance || (positiveNumber(cpmRate) > 0 && platforms.length > 0)),
      },
      {
        label: "Timeline",
        ready: Boolean(startDate && draftDueDate && endDate),
      },
    ],
    [
      ageRange,
      budgetTotal,
      cpmRate,
      deliverables,
      description,
      endDate,
      draftDueDate,
      isPerformance,
      location,
      minFollowers,
      niches.length,
      platforms.length,
      startDate,
      title,
    ]
  );
  const readinessCount = readinessItems.filter((item) => item.ready).length;
  const readinessPct = Math.round((readinessCount / readinessItems.length) * 100);

  useEffect(() => {
    if (niches.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear preview from current niche selection.
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

  const togglePlatform = (platform: string) => {
    setPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((item) => item !== platform) : [...prev, platform]
    );
  };

  const handleNicheToggle = (niche: string) => {
    if (niches.includes(niche)) {
      setNiches(niches.filter((item) => item !== niche));
      return;
    }
    if (niches.length >= 3) {
      toast.warning(t("Niches limit reached"), {
        description: t("You can select up to 3 niches for targeting precision."),
      });
      return;
    }
    setNiches([...niches, niche]);
  };

  const addDeliverable = () => {
    setDeliverables([...deliverables, { type: "video", quantity: 1, details: "" }]);
  };

  const removeDeliverable = (index: number) => {
    setDeliverables(deliverables.filter((_, itemIndex) => itemIndex !== index));
  };

  const updateDeliverable = (index: number, field: keyof Deliverable, value: string | number) => {
    setDeliverables((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value } as Deliverable;
      return next;
    });
  };

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
        setDeliverables(brief.deliverables as Deliverable[]);
        setBudgetTotal(brief.budget_total);
        setStartDate(brief.timeline.startDate);
        setEndDate(brief.timeline.endDate);
        setDraftDueDate(brief.timeline.draftDueDate);
        setObjectives(brief.objectives || []);
        setGuidelines(brief.guidelines || []);
        setKpis(brief.kpis || []);

        toast.success(t("AI Brief Generated Successfully!"), {
          description: t("We've populated all details based on your campaign prompt."),
        });
        setShowAiModal(false);
        setStep(6);
      } else {
        toast.error(t("Brief generation failed"), {
          description: res.error || t("Please try again."),
        });
      }
    } catch (err) {
      toast.error(t("Brief generation failed"), {
        description: err instanceof Error ? err.message : t("An unexpected error occurred."),
      });
    } finally {
      setAiGenerating(false);
    }
  };

  const celebrate = () => {
    const end = Date.now() + 2 * 1000;
    const frame = () => {
      confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ["#ADC6FF", "#34D399", "#FBBF24"] });
      confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ["#ADC6FF", "#34D399", "#FBBF24"] });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  };

  const validateFirstStep = () => {
    if (!title.trim() || !description.trim() || niches.length === 0) {
      toast.error(t("Incomplete Goal Information"), {
        description: t("Please fill out title, description, and niches."),
      });
      setStep(1);
      return false;
    }
    return true;
  };

  const handleContinue = () => {
    if (step === 1 && !validateFirstStep()) return;
    if (step === 3 && deliverables.some((item) => item.quantity <= 0 || !item.details.trim())) {
      toast.error(t("Complete the deliverables"), {
        description: t("Every deliverable needs a quantity and a short detail."),
      });
      return;
    }
    if (step === 4 && isPerformance && platforms.length === 0) {
      toast.error(t("Choose at least one platform"));
      return;
    }
    setStep(Math.min(step + 1, wizardSteps.length));
  };

  const handlePublishClick = () => {
    if (!validateFirstStep()) return;
    if (isPerformance) {
      void startPerformancePublish();
      return;
    }
    setShowPaymentModal(true);
  };

  const startPerformancePublish = async () => {
    setPoolPublishing(true);
    try {
      const metaCheck = validateCategoryMeta(campaignCategory, buildCategoryMeta());
      if (!metaCheck.ok) {
        toast.error(t("Complete the campaign brief"), { description: metaCheck.error });
        setStep(4);
        setPoolPublishing(false);
        return;
      }

      if (platforms.length === 0) {
        toast.error(t("Choose at least one platform"));
        setStep(4);
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
        brand_cpm_rate: cpmRate,
        cpm_rate: cpmRate,
        budget_pool: budgetTotal,
        min_payout_threshold: minPayoutThreshold,
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
        celebrate();
        toast.success(t("Campaign Published!"), {
          description: t("Your fixed-fee campaign is live. Approve applicants and fund legacy Stripe escrow per creator from the campaign workspace."),
        });
        setShowPaymentModal(false);
        router.push("/business/dashboard");
      } else {
        toast.error(t("Failed to create campaign"), {
          description: res.error || t("Unknown database error."),
        });
      }
    } catch (err) {
      toast.error(t("Could not publish campaign"), {
        description: err instanceof Error ? err.message : t("An unexpected error occurred."),
      });
    } finally {
      setPaying(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div key="goal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <StepTitle
              eyebrow={t("Step 1")}
              title={t("Campaign goal")}
              description={t("Set the marketplace model, content type, core brief, and target niches.")}
              icon={Sparkles}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ChoiceCard
                active={isPerformance}
                title={t("Performance campaign")}
                description={t("Creators earn from a funded pool based on verified views and your RPM.")}
                icon={Zap}
                onClick={() => setCampaignType("performance")}
              />
              <ChoiceCard
                active={!isPerformance}
                title={t("Fixed-fee campaign")}
                description={t("Creators apply, you approve, and legacy Stripe escrow is funded per creator.")}
                icon={Lock}
                tone="success"
                onClick={() => setCampaignType("fixed")}
              />
            </div>

            {isPerformance ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ChoiceCard
                  active={!isUgc}
                  title={t("Content clipping")}
                  description={t(CAMPAIGN_CATEGORY_DESCRIPTIONS.clipping)}
                  icon={Scissors}
                  onClick={() => setCampaignCategory("clipping")}
                />
                <ChoiceCard
                  active={isUgc}
                  title={t("UGC")}
                  description={t(CAMPAIGN_CATEGORY_DESCRIPTIONS.ugc)}
                  icon={FileText}
                  tone="warning"
                  onClick={() => setCampaignCategory("ugc")}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <FieldLabel hint={t("Keep it short enough for the campaign marketplace and dashboard cards.")}>
                  {t("Campaign title")}
                </FieldLabel>
                <input
                  type="text"
                  placeholder={t("e.g. Summer tech capsule launch")}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  aria-label={t("Campaign title")}
                  className="business-input h-12 w-full rounded-xl px-4 text-sm placeholder:text-[var(--business-muted)]"
                />
              </div>

              <div className="space-y-2">
                <FieldLabel hint={t("Include the product, creator instructions, brand safety rules, and success outcome.")}>
                  {t("Core brief")}
                </FieldLabel>
                <textarea
                  placeholder={t("Detail your product highlights, brand aesthetics, guidelines, and instructions for creators...")}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  aria-label={t("Core brief")}
                  rows={5}
                  className="business-input w-full resize-none rounded-xl px-4 py-3 text-sm leading-6 placeholder:text-[var(--business-muted)]"
                />
              </div>

              <div className="space-y-3">
                <FieldLabel hint={t("Select up to three so creator matching stays precise.")}>
                  {t("Target niches")}
                </FieldLabel>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_NICHES.map((niche) => {
                    const active = niches.includes(niche);
                    return (
                      <button
                        key={niche}
                        type="button"
                        onClick={() => handleNicheToggle(niche)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                          active
                            ? "border-[rgba(173,198,255,0.25)] bg-[rgba(173,198,255,0.12)] text-[var(--business-primary)]"
                            : "border-white/10 bg-white/[0.04] text-[var(--business-muted)] hover:text-[var(--business-text)]"
                        )}
                      >
                        {t(niche)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 2:
        return (
          <motion.div key="audience" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <StepTitle
              eyebrow={t("Step 2")}
              title={t("Creator targeting")}
              description={t("Define who should see the brief and which creator profiles should surface first.")}
              icon={Target}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>{t("Audience location")}</FieldLabel>
                <select value={location} onChange={(event) => setLocation(event.target.value)} aria-label={t("Audience location")} className="business-input h-12 w-full rounded-xl px-4 text-sm">
                  <option>{t("United States")}</option>
                  <option>{t("Europe")}</option>
                  <option>{t("Japan & Asia")}</option>
                  <option>{t("Global")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel>{t("Age range")}</FieldLabel>
                <select value={ageRange} onChange={(event) => setAgeRange(event.target.value)} aria-label={t("Age range")} className="business-input h-12 w-full rounded-xl px-4 text-sm">
                  <option>18-24</option>
                  <option>18-34</option>
                  <option>25-45</option>
                  <option>{t("All Ages")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel>{t("Gender distribution")}</FieldLabel>
                <select value={gender} onChange={(event) => setGender(event.target.value)} aria-label={t("Gender distribution")} className="business-input h-12 w-full rounded-xl px-4 text-sm">
                  <option>{t("All")}</option>
                  <option>{t("Female")}</option>
                  <option>{t("Male")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <FieldLabel hint={t("Used by the matching preview and creator discovery filters.")}>
                  {t("Minimum follower count")}
                </FieldLabel>
                <input
                  type="number"
                  min="0"
                  value={minFollowers}
                  onChange={(event) => setMinFollowers(Number(event.target.value))}
                  aria-label={t("Minimum follower count")}
                  className="business-input h-12 w-full rounded-xl px-4 text-sm"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(173,198,255,0.20)] bg-[rgba(173,198,255,0.10)] text-[var(--business-primary)]">
                  <Users size={18} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--business-text)]">{t("Live matching preview")}</h3>
                  <p className="mt-1 text-xs leading-5 text-[var(--business-muted)]">
                    {t("The sidebar updates from real creator profiles whose niches overlap this campaign.")}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 3:
        return (
          <motion.div key="deliverables" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <StepTitle
              eyebrow={t("Step 3")}
              title={t("Deliverables")}
              description={t("List the formats creators should submit and any format-specific notes.")}
              icon={ClipboardCheck}
            />

            <div className="space-y-3">
              {deliverables.map((item, index) => (
                <div key={`${item.type}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[160px_120px_1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <FieldLabel>{t("Format")}</FieldLabel>
                      <select
                        value={item.type}
                        onChange={(event) => updateDeliverable(index, "type", event.target.value)}
                        aria-label={`${t("Format")} ${index + 1}`}
                        className="business-input h-11 w-full rounded-xl px-3 text-sm"
                      >
                        <option value="post">{t("Grid Post")}</option>
                        <option value="video">{t("Short Video")}</option>
                        <option value="story">{t("Social Story")}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <FieldLabel>{t("Quantity")}</FieldLabel>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) => updateDeliverable(index, "quantity", Number(event.target.value))}
                        aria-label={`${t("Quantity")} ${index + 1}`}
                        className="business-input h-11 w-full rounded-xl px-3 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <FieldLabel>{t("Details")}</FieldLabel>
                      <input
                        type="text"
                        placeholder={t("e.g. Hook in first 2 seconds, captions included")}
                        value={item.details}
                        onChange={(event) => updateDeliverable(index, "details", event.target.value)}
                        aria-label={`${t("Details")} ${index + 1}`}
                        className="business-input h-11 w-full rounded-xl px-3 text-sm placeholder:text-[var(--business-muted)]"
                      />
                    </div>
                    {deliverables.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeDeliverable(index)}
                        className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.10)] text-[var(--business-danger)] transition-colors hover:bg-[rgba(248,113,113,0.15)]"
                        aria-label={t("Remove deliverable")}
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <BusinessActionButton type="button" variant="secondary" icon={Plus} onClick={addDeliverable}>
              {t("Add deliverable")}
            </BusinessActionButton>
          </motion.div>
        );
      case 4:
        return (
          <motion.div key="budget" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <StepTitle
              eyebrow={t("Step 4")}
              title={isPerformance ? t("Budget pool and reward rules") : t("Fixed-fee budget")}
              description={
                isPerformance
                  ? t("Configure the funded pool, RPM, payout threshold, creator cap, platforms, and content requirements.")
                  : t("Set the fixed-fee budget shown to applicants. Legacy Stripe escrow is funded per approved creator.")
              }
              icon={CircleDollarSign}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
              <div className="space-y-2">
                <FieldLabel hint={isPerformance ? t("Brand pays this amount when the campaign is funded.") : t("Budget shown to creators for this campaign.")}>
                  {isPerformance ? t("Total budget pool") : t("Total campaign budget")}
                </FieldLabel>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--business-muted)]">$</span>
                  <input
                    type="number"
                    min="1"
                    value={budgetTotal}
                    onChange={(event) => setBudgetTotal(Number(event.target.value))}
                    aria-label={isPerformance ? t("Total budget pool") : t("Total campaign budget")}
                    className="business-input h-14 w-full rounded-xl pl-8 pr-4 text-xl font-semibold"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Budget split")}
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--business-muted)]">{t("You pay")}</span>
                    <span className="font-semibold text-[var(--business-text)]">{money(poolSplit.total)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--business-muted)]">{t("Platform fee")}</span>
                    <span className="font-semibold text-[var(--business-warning)]">{money(poolSplit.fee)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/10 pt-2">
                    <span className="text-[var(--business-muted)]">{t("Creators earn")}</span>
                    <span className="font-semibold text-[var(--business-success)]">{money(poolSplit.creators)}</span>
                  </div>
                </div>
              </div>
            </div>

            {isPerformance ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <FieldLabel hint={t("Dollar amount paid per 1,000 verified views.")}>
                      {t("Reward rate / RPM")}
                    </FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--business-muted)]">$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={cpmRate}
                        onChange={(event) => setCpmRate(Number(event.target.value))}
                        aria-label={t("Reward rate / RPM")}
                        className="business-input h-12 w-full rounded-xl pl-8 pr-4 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel hint={t("A clip must earn this amount before creator submission is worth reviewing.")}>
                      {t("Minimum payout threshold")}
                    </FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--business-muted)]">$</span>
                      <input
                        type="number"
                        min="0"
                        value={minPayoutThreshold}
                        onChange={(event) => setMinPayoutThreshold(Number(event.target.value))}
                        aria-label={t("Minimum payout threshold")}
                        className="business-input h-12 w-full rounded-xl pl-8 pr-4 text-sm"
                      />
                    </div>
                    <p className="text-xs text-[var(--business-muted)]">
                      {minThresholdViews > 0 ? `${compactNumber(minThresholdViews)} ${t("views needed before eligibility")}` : t("No threshold")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel hint={t("Set 0 for uncapped earnings per creator.")}>
                      {t("Maximum payout cap")}
                    </FieldLabel>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--business-muted)]">$</span>
                      <input
                        type="number"
                        min="0"
                        value={maxPayoutPerCreator}
                        onChange={(event) => setMaxPayoutPerCreator(Number(event.target.value))}
                        aria-label={t("Maximum payout cap")}
                        className="business-input h-12 w-full rounded-xl pl-8 pr-4 text-sm"
                      />
                    </div>
                    <p className="text-xs text-[var(--business-muted)]">
                      {maxCapViews > 0 ? `${compactNumber(maxCapViews)} ${t("paid views per creator")}` : t("Uncapped")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <FieldLabel hint={t("Approved earnings stay pending until the holdback clears.")}>
                      {t("View holdback")}
                    </FieldLabel>
                    <input
                      type="number"
                      min="0"
                      value={viewHoldbackHours}
                      onChange={(event) => setViewHoldbackHours(Number(event.target.value))}
                      aria-label={t("View holdback")}
                      className="business-input h-12 w-full rounded-xl px-4 text-sm"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <FieldLabel hint={t("Creators can submit clips from the selected social networks.")}>
                    {t("Eligible platforms")}
                  </FieldLabel>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {platformOptions.map((platform) => {
                      const active = platforms.includes(platform.id);
                      const Icon = platform.icon;
                      return (
                        <button
                          key={platform.id}
                          type="button"
                          onClick={() => togglePlatform(platform.id)}
                          aria-pressed={active}
                          className={cn(
                            "rounded-xl border p-3 text-left transition-colors",
                            active
                              ? "border-[rgba(173,198,255,0.25)] bg-[rgba(173,198,255,0.12)]"
                              : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                          )}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <Icon size={16} className={active ? "text-[var(--business-primary)]" : "text-[var(--business-muted)]"} />
                            {active ? <Check size={15} className="text-[var(--business-primary)]" /> : null}
                          </span>
                          <span className="mt-3 block text-sm font-semibold text-[var(--business-text)]">{platform.label}</span>
                          <span className="mt-1 block text-[11px] text-[var(--business-muted)]">{platform.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel hint={t("Rules are stored with the campaign and visible in moderation context.")}>
                    {t("Content rules / asset kit")}
                  </FieldLabel>
                  <textarea
                    rows={3}
                    placeholder={t("e.g. Hook in first 2s, tag @brand, no competing products, vertical only. Link your footage or asset folder.")}
                    value={contentRules}
                    onChange={(event) => setContentRules(event.target.value)}
                    aria-label={t("Content rules / asset kit")}
                    className="business-input w-full resize-none rounded-xl px-4 py-3 text-sm leading-6 placeholder:text-[var(--business-muted)]"
                  />
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="mb-4 flex items-center gap-2">
                    {isUgc ? <FileText size={16} className="text-[var(--business-warning)]" /> : <Scissors size={16} className="text-[var(--business-primary)]" />}
                    <h3 className="text-sm font-semibold text-[var(--business-text)]">
                      {isUgc ? t("UGC brief") : t("Clipping spec")}
                    </h3>
                  </div>
                  {isUgc ? (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <FieldLabel>{t("Creative direction")}</FieldLabel>
                        <textarea
                          rows={3}
                          placeholder={t("Concept, mood, framing, what the content should feel like...")}
                          value={creativeDirection}
                          onChange={(event) => setCreativeDirection(event.target.value)}
                          aria-label={t("Creative direction")}
                          className="business-input w-full resize-none rounded-xl px-4 py-3 text-sm leading-6 placeholder:text-[var(--business-muted)]"
                        />
                      </div>
                      <div className="space-y-2">
                        <FieldLabel>{t("References")}</FieldLabel>
                        <input
                          type="text"
                          placeholder={t("Links to example posts or a moodboard")}
                          value={references}
                          onChange={(event) => setReferences(event.target.value)}
                          aria-label={t("References")}
                          className="business-input h-12 w-full rounded-xl px-4 text-sm placeholder:text-[var(--business-muted)]"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <FieldLabel>{t("Do's")}</FieldLabel>
                          <textarea
                            rows={3}
                            placeholder={t("Show the product in use, natural lighting...")}
                            value={dos}
                            onChange={(event) => setDos(event.target.value)}
                            aria-label={t("Do's")}
                            className="business-input w-full resize-none rounded-xl px-4 py-3 text-sm leading-6 placeholder:text-[var(--business-muted)]"
                          />
                        </div>
                        <div className="space-y-2">
                          <FieldLabel>{t("Don'ts")}</FieldLabel>
                          <textarea
                            rows={3}
                            placeholder={t("No competing brands, no profanity...")}
                            value={donts}
                            onChange={(event) => setDonts(event.target.value)}
                            aria-label={t("Don'ts")}
                            className="business-input w-full resize-none rounded-xl px-4 py-3 text-sm leading-6 placeholder:text-[var(--business-muted)]"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <FieldLabel>{t("Source video / footage link")}</FieldLabel>
                        <input
                          type="text"
                          placeholder={t("https://drive.google.com/... or a YouTube/stream link to clip from")}
                          value={sourceUrl}
                          onChange={(event) => setSourceUrl(event.target.value)}
                          aria-label={t("Source video / footage link")}
                          className="business-input h-12 w-full rounded-xl px-4 text-sm placeholder:text-[var(--business-muted)]"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <FieldLabel>{t("Min clip length")}</FieldLabel>
                          <input
                            type="number"
                            min="1"
                            value={clipMinSec}
                            onChange={(event) => setClipMinSec(Number(event.target.value))}
                            aria-label={t("Min clip length")}
                            className="business-input h-12 w-full rounded-xl px-4 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <FieldLabel>{t("Max clip length")}</FieldLabel>
                          <input
                            type="number"
                            min="1"
                            value={clipMaxSec}
                            onChange={(event) => setClipMaxSec(Number(event.target.value))}
                            aria-label={t("Max clip length")}
                            className="business-input h-12 w-full rounded-xl px-4 text-sm"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <FieldLabel>{t("Clip requirements")}</FieldLabel>
                        <textarea
                          rows={3}
                          placeholder={t("Which moments to clip, captions/subtitles, aspect ratio...")}
                          value={clipRequirements}
                          onChange={(event) => setClipRequirements(event.target.value)}
                          aria-label={t("Clip requirements")}
                          className="business-input w-full resize-none rounded-xl px-4 py-3 text-sm leading-6 placeholder:text-[var(--business-muted)]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-[rgba(173,198,255,0.18)] bg-[rgba(173,198,255,0.08)] p-4">
                  <div className="flex items-start gap-3 text-sm text-[var(--business-muted)]">
                    <Eye size={17} className="mt-0.5 shrink-0 text-[var(--business-primary)]" />
                    <span>
                      {t("Estimated creator pool capacity:")}{" "}
                      <strong className="font-semibold text-[var(--business-text)]">
                        {estimatedPaidViews > 0 ? compactNumber(estimatedPaidViews) : "0"}
                      </strong>{" "}
                      {t("paid views before the available creator pool is exhausted.")}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-start gap-3 text-sm text-[var(--business-muted)]">
                  <Info size={17} className="mt-0.5 shrink-0 text-[var(--business-primary)]" />
                  <span>{t("Fixed-fee campaigns open for applications immediately. You fund legacy Stripe escrow only when approving an applicant.")}</span>
                </div>
              </div>
            )}
          </motion.div>
        );
      case 5:
        return (
          <motion.div key="timeline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <StepTitle
              eyebrow={t("Step 5")}
              title={t("Timeline")}
              description={t("Set launch, review, and close dates for the campaign workspace.")}
              icon={CalendarDays}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <FieldLabel>{t("Start date")}</FieldLabel>
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label={t("Start date")} className="business-input h-12 w-full rounded-xl px-4 text-sm" />
              </div>
              <div className="space-y-2">
                <FieldLabel>{t("Draft submission due")}</FieldLabel>
                <input type="date" value={draftDueDate} onChange={(event) => setDraftDueDate(event.target.value)} aria-label={t("Draft submission due")} className="business-input h-12 w-full rounded-xl px-4 text-sm" />
              </div>
              <div className="space-y-2">
                <FieldLabel>{t("End date")}</FieldLabel>
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label={t("End date")} className="business-input h-12 w-full rounded-xl px-4 text-sm" />
              </div>
            </div>
          </motion.div>
        );
      default:
        return (
          <motion.div key="review" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
            <StepTitle
              eyebrow={t("Step 6")}
              title={t("Review and launch")}
              description={t("Verify the campaign before creating the workspace and funding path.")}
              icon={CheckCircle2}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Campaign")}</p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--business-text)]">{title || t("Untitled Campaign")}</h3>
                <p className="mt-2 line-clamp-4 text-sm leading-6 text-[var(--business-muted)]">{description || t("No brief description yet.")}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <BusinessStatusPill tone={isPerformance ? "accent" : "success"}>
                    {isPerformance ? t("Performance") : t("Fixed fee")}
                  </BusinessStatusPill>
                  {isPerformance ? (
                    <BusinessStatusPill tone="info">{isUgc ? t("UGC") : t("Clipping")}</BusinessStatusPill>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Financial controls")}</p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--business-muted)]">{t("Budget")}</span>
                    <span className="font-semibold text-[var(--business-text)]">{money(budgetTotal)}</span>
                  </div>
                  {isPerformance ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--business-muted)]">{t("Reward rate")}</span>
                        <span className="font-semibold text-[var(--business-primary)]">{money(cpmRate, 2)} RPM</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--business-muted)]">{t("Minimum payout")}</span>
                        <span className="font-semibold text-[var(--business-text)]">{money(minPayoutThreshold)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--business-muted)]">{t("Max payout")}</span>
                        <span className="font-semibold text-[var(--business-text)]">
                          {maxPayoutPerCreator > 0 ? money(maxPayoutPerCreator) : t("Uncapped")}
                        </span>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {objectives.length > 0 || guidelines.length > 0 || kpis.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {objectives.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Objectives")}</p>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--business-muted)]">
                      {objectives.map((objective) => <li key={objective}>{objective}</li>)}
                    </ul>
                  </div>
                ) : null}
                {guidelines.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Guidelines")}</p>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--business-muted)]">
                      {guidelines.map((guideline) => <li key={guideline}>{guideline}</li>)}
                    </ul>
                  </div>
                ) : null}
                {kpis.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("KPIs")}</p>
                    <ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--business-muted)]">
                      {kpis.map((kpi) => <li key={kpi}>{kpi}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">{t("Timeline and targeting")}</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  ["Start", startDate],
                  ["Draft due", draftDueDate],
                  ["Close", endDate],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)]">{t(label)}</p>
                    <p className="mt-2 text-sm font-semibold text-[var(--business-text)]">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {niches.length > 0 ? niches.map((niche) => (
                  <BusinessStatusPill key={niche} tone="accent">{t(niche)}</BusinessStatusPill>
                )) : <BusinessStatusPill>{t("No niches")}</BusinessStatusPill>}
              </div>
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 md:py-8 lg:px-8">
      <div className="flex">
        <Link
          href="/business/campaigns"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--business-muted)] transition-colors hover:text-[var(--business-text)]"
        >
          <ArrowLeft size={16} /> {t("Back to campaigns")}
        </Link>
      </div>

      <BusinessSectionHeader
        eyebrow={t("Campaign Builder")}
        title={t("Create campaign workspace")}
        description={t("Launch a production campaign with real budget rules, creator targeting, clipping or UGC requirements, and Stripe funding.")}
        action={
          <BusinessActionButton type="button" variant="secondary" icon={Sparkles} onClick={() => setShowAiModal(true)}>
            {t("Generate with AI")}
          </BusinessActionButton>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-5">
          <BusinessGlassCard variant="elevated" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--business-primary)]">
                  {t("Step {step} of 6").replace("{step}", String(step))}
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-normal text-[var(--business-text)]">
                  {t(wizardSteps[step - 1]?.label ?? "Campaign")}
                </h2>
              </div>
              <span className="text-sm font-semibold text-[var(--business-muted)]">{progressPct}%</span>
            </div>
            <BusinessProgressBar value={step} max={wizardSteps.length} />
            <div className="business-scrollbar-none flex gap-2 overflow-x-auto pb-1">
              {wizardSteps.map((item) => {
                const Icon = item.icon;
                const complete = step > item.id;
                const active = step === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => complete && setStep(item.id)}
                    disabled={!complete && !active}
                    className={cn(
                      "flex min-w-36 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-[rgba(173,198,255,0.25)] bg-[rgba(173,198,255,0.12)]"
                        : complete
                          ? "border-[rgba(52,211,153,0.18)] bg-[rgba(52,211,153,0.08)] hover:bg-[rgba(52,211,153,0.12)]"
                          : "border-white/10 bg-white/[0.03] opacity-55"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border",
                        active
                          ? "border-[rgba(173,198,255,0.25)] text-[var(--business-primary)]"
                          : complete
                            ? "border-[rgba(52,211,153,0.20)] text-[var(--business-success)]"
                            : "border-white/10 text-[var(--business-muted)]"
                      )}
                    >
                      {complete ? <Check size={15} /> : <Icon size={15} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-[var(--business-text)]">{t(item.label)}</span>
                      <span className="block truncate text-[10px] text-[var(--business-muted)]">{t(item.description)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </BusinessGlassCard>

          <BusinessGlassCard variant="elevated" className="p-5 sm:p-6">
            <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>

            <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-5">
              {step > 1 ? (
                <BusinessActionButton type="button" variant="ghost" icon={ArrowLeft} onClick={() => setStep(step - 1)}>
                  {t("Back")}
                </BusinessActionButton>
              ) : (
                <span />
              )}
              {step < wizardSteps.length ? (
                <BusinessActionButton type="button" trailingIcon={ArrowRight} onClick={handleContinue}>
                  {t("Continue")}
                </BusinessActionButton>
              ) : (
                <BusinessActionButton
                  type="button"
                  icon={poolPublishing ? Loader2 : isPerformance ? Zap : Lock}
                  disabled={poolPublishing}
                  onClick={handlePublishClick}
                  className={poolPublishing ? "[&_svg]:animate-spin" : undefined}
                >
                  {isPerformance ? t("Publish & fund pool") : t("Publish campaign")}
                </BusinessActionButton>
              )}
            </div>
          </BusinessGlassCard>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6">
          <BusinessMetricCard
            label={t("Launch readiness")}
            value={`${readinessPct}%`}
            detail={`${readinessCount}/${readinessItems.length} ${t("sections complete")}`}
            icon={Gauge}
            tone={readinessPct === 100 ? "success" : "accent"}
          />

          <BusinessGlassCard variant="elevated" className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Campaign model")}
                </p>
                <h3 className="mt-1 text-base font-semibold text-[var(--business-text)]">
                  {isPerformance ? t("Performance marketplace") : t("Fixed-fee marketplace")}
                </h3>
              </div>
              <BusinessStatusPill tone={isPerformance ? "accent" : "success"}>
                {isPerformance ? t("RPM") : t("Fixed-fee")}
              </BusinessStatusPill>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--business-muted)]">{t("Budget")}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--business-text)]">{money(budgetTotal)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--business-muted)]">
                  {isPerformance ? t("Reward") : t("Status")}
                </p>
                <p className="mt-2 text-sm font-semibold text-[var(--business-text)]">
                  {isPerformance ? `${money(cpmRate, 2)} RPM` : t("Open")}
                </p>
              </div>
            </div>
            {isPerformance ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs text-[var(--business-muted)]">
                <div className="flex justify-between">
                  <span>{t("Creators can earn")}</span>
                  <span className="font-semibold text-[var(--business-success)]">{money(poolSplit.creators)}</span>
                </div>
                <div className="mt-2 flex justify-between">
                  <span>{t("Estimated paid views")}</span>
                  <span className="font-semibold text-[var(--business-text)]">
                    {estimatedPaidViews > 0 ? compactNumber(estimatedPaidViews) : "0"}
                  </span>
                </div>
              </div>
            ) : null}
          </BusinessGlassCard>

          <BusinessGlassCard variant="elevated" className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
                  {t("Matching preview")}
                </p>
                <h3 className="mt-1 text-base font-semibold text-[var(--business-text)]">{t("Creators in your niches")}</h3>
              </div>
              <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(173,198,255,0.20)] bg-[rgba(173,198,255,0.10)] text-[var(--business-primary)]">
                <Users size={18} />
              </span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-center">
              <p className="text-2xl font-semibold text-[var(--business-text)]">
                {creatorsLoading ? "..." : matchedCreators.length}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--business-muted)]">
                {t("Matching creators found")}
              </p>
            </div>
            <div className="space-y-2">
              {niches.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-center text-xs leading-5 text-[var(--business-muted)]">
                  {t("Pick target niches to preview matching creators.")}
                </p>
              ) : creatorsLoading ? (
                [0, 1, 2].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <span className="apple-skeleton size-8 rounded-full" />
                    <span className="min-w-0 flex-1 space-y-2">
                      <span className="apple-skeleton block h-3 w-24 rounded-full" />
                      <span className="apple-skeleton block h-2 w-16 rounded-full" />
                    </span>
                  </div>
                ))
              ) : matchedCreators.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-center text-xs leading-5 text-[var(--business-muted)]">
                  {t("No creators match these niches yet.")}
                </p>
              ) : (
                matchedCreators.slice(0, 4).map((creator) => (
                  <div key={creator.user_id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-semibold uppercase text-[var(--business-primary)]">
                      {(creator.full_name || "?").charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-[var(--business-text)]">{creator.full_name || t("Creator")}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-[var(--business-muted)]">
                        {(creator.follower_count ?? 0).toLocaleString()} {t("followers")}
                      </span>
                    </span>
                    {creator.engagement_rate ? (
                      <span className="rounded-full bg-[rgba(52,211,153,0.10)] px-2 py-0.5 text-[10px] font-semibold text-[var(--business-success)]">
                        {Number(creator.engagement_rate).toFixed(1)}%
                      </span>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </BusinessGlassCard>

          <BusinessGlassCard variant="default" className="space-y-3">
            <div className="flex items-start gap-3">
              <Info size={16} className="mt-0.5 shrink-0 text-[var(--business-primary)]" />
              <div>
                <h3 className="text-sm font-semibold text-[var(--business-text)]">{t("AI brief assistant")}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--business-muted)]">
                  {t("Paste a raw product idea and Aether will draft title, audience, deliverables, milestones, and KPIs.")}
                </p>
              </div>
            </div>
          </BusinessGlassCard>
        </aside>
      </div>

      <AnimatePresence>
        {showAiModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !aiGenerating && setShowAiModal(false)}
              className="absolute inset-0 bg-[#050914]/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="business-ai-brief-title"
              className="business-glass-elevated relative z-10 max-h-[calc(100svh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl p-6"
            >
              {aiGenerating ? (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 rounded-2xl bg-[#07101f]/95 p-6 text-center backdrop-blur-md">
                  <Loader2 size={34} className="animate-spin text-[var(--business-primary)]" />
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--business-text)]">{t("Aether AI is crafting your brief")}</h4>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-[var(--business-muted)]">
                      {t("Generating title, audience, niches, milestones, and deliverable targets.")}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(208,188,255,0.20)] bg-[rgba(208,188,255,0.10)] text-[var(--business-secondary)]">
                    <Sparkles size={18} />
                  </span>
                  <div>
                    <h3 id="business-ai-brief-title" className="text-lg font-semibold text-[var(--business-text)]">{t("AI Brief Assistant")}</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--business-muted)]">
                      {t("Paste your raw idea, product details, or campaign goals.")}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  disabled={aiGenerating}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-[var(--business-muted)] transition-colors hover:text-[var(--business-text)]"
                  aria-label={t("Close")}
                >
                  <X size={16} />
                </button>
              </div>

              <textarea
                placeholder={t("e.g. Launching a new aluminum desk stand for Apple Studio Display. Focus on productivity tech creators with organic desk setup visuals. Budget around $3000...")}
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                aria-label={t("AI brief assistant")}
                rows={5}
                className="business-input mt-5 w-full resize-none rounded-xl px-4 py-3 text-sm leading-6 placeholder:text-[var(--business-muted)]"
              />

              <div className="mt-5 flex justify-end gap-3 border-t border-white/10 pt-4">
                <BusinessActionButton type="button" variant="ghost" disabled={aiGenerating} onClick={() => setShowAiModal(false)}>
                  {t("Cancel")}
                </BusinessActionButton>
                <BusinessActionButton type="button" icon={Sparkles} disabled={aiGenerating || !aiPrompt.trim()} onClick={handleGenerateAiBrief}>
                  {t("Generate Brief")}
                </BusinessActionButton>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showPaymentModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !paying && setShowPaymentModal(false)}
              className="absolute inset-0 bg-[#050914]/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="business-fixed-publish-title"
              className="business-glass-elevated relative z-10 max-h-[calc(100svh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl p-6"
            >
              {paying ? (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#07101f]/95 p-6 text-center backdrop-blur-md">
                  <Loader2 size={32} className="animate-spin text-[var(--business-primary)]" />
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--business-text)]">{t("Publishing campaign")}</h4>
                    <p className="mt-1 text-xs leading-5 text-[var(--business-muted)]">{t("Creating your campaign and opening it for applications.")}</p>
                  </div>
                </div>
              ) : null}

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-primary)]">{t("Review & Publish")}</p>
                  <h3 id="business-fixed-publish-title" className="mt-1 text-lg font-semibold text-[var(--business-text)]">{t("Publish fixed-fee campaign")}</h3>
                </div>
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(52,211,153,0.20)] bg-[rgba(52,211,153,0.10)] text-[var(--business-success)]">
                  <Check size={18} />
                </span>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
                <div className="flex justify-between gap-4 text-[var(--business-muted)]">
                  <span>{t("Campaign")}</span>
                  <span className="max-w-36 truncate text-right font-semibold text-[var(--business-text)] sm:max-w-48">{title || t("New Campaign")}</span>
                </div>
                <div className="mt-2 flex justify-between gap-4 text-[var(--business-muted)]">
                  <span>{t("Target niches")}</span>
                  <span className="max-w-36 truncate text-right font-semibold text-[var(--business-text)] sm:max-w-48">
                    {niches.length > 0 ? niches.join(", ") : "—"}
                  </span>
                </div>
                <div className="mt-3 flex justify-between gap-4 border-t border-white/10 pt-3 font-semibold">
                  <span className="text-[var(--business-muted)]">{t("Campaign budget")}</span>
                  <span className="text-[var(--business-text)]">{money(budgetTotal)}</span>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-[var(--business-muted)]">
                <Lock size={15} className="mt-0.5 shrink-0 text-[var(--business-primary)]" />
                <span>{t("No charge now. Your fixed-fee campaign opens for applications immediately; you fund legacy Stripe escrow per creator when you approve them.")}</span>
              </div>

              <div className="mt-5 flex justify-end gap-3 border-t border-white/10 pt-4">
                <BusinessActionButton type="button" variant="ghost" disabled={paying} onClick={() => setShowPaymentModal(false)}>
                  {t("Cancel")}
                </BusinessActionButton>
                <BusinessActionButton type="button" disabled={paying} onClick={handleConfirmPayment}>
                  {t("Publish Campaign")}
                </BusinessActionButton>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

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
