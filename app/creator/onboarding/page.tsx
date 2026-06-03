"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { updateClientProfile } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "@/lib/translations";
import { CreatorOnboardingWelcome } from "@/components/creator-onboarding-welcome";
import { 
  Sparkles, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Loader2,
  DollarSign,
  Upload,
  Plus,
  Trash2,
  FileText,
  User,
  Heart
} from "lucide-react";

// Custom SVG icon for Instagram
function InstagramIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      width={size} 
      height={size} 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

// Custom SVG icon for YouTube
function YoutubeIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      width={size} 
      height={size} 
      fill="currentColor" 
      className={className}
    >
      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.522 3.5 12 3.5 12 3.5s-7.522 0-9.388.555A3.002 3.002 0 0 0 .502 6.163C0 8.07 0 12 0 12s0 3.93.502 5.837a3.003 3.003 0 0 0 2.11 2.108C4.478 20.5 12 20.5 12 20.5s7.522 0 9.388-.555a3.003 3.003 0 0 0 2.11-2.108C24 15.93 24 12 24 12s0-3.93-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

// Custom SVG icon for TikTok
function TikTokIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      width={size} 
      height={size} 
      fill="currentColor" 
      className={className}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .79.11V9.4a6.27 6.27 0 0 0-3.1-.3A6.35 6.35 0 0 0 2 15.42a6.34 6.34 0 0 0 10.86 4.47l.06-.06V6.69a8.27 8.27 0 0 0 6.67 3.32v-3.3a4.78 4.78 0 0 1-3.18-.7l.18.69z" />
    </svg>
  );
}

const AVAILABLE_NICHES = [
  "Minimal Tech",
  "Productivity & Workspace",
  "Design & Architecture",
  "Fashion & Lifestyle",
  "Travel & Adventure",
  "Food & Dining",
  "Fitness & Health",
  "Finance & Business"
];

export default function InfluencerOnboarding() {
  const router = useRouter();
  const { t } = useTranslation();
  const [showWelcome, setShowWelcome] = useState(true);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Profile & Niche
  const [bio, setBio] = useState("");
  const [niche, setNiche] = useState("");
  
  // Step 2: Social Links & Followers (simulated verification)
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [youtube, setYoutube] = useState("");
  
  const [verifyingInsta, setVerifyingInsta] = useState(false);
  const [verifiedInsta, setVerifiedInsta] = useState(false);
  const [verifyingTiktok, setVerifyingTiktok] = useState(false);
  const [verifiedTiktok, setVerifiedTiktok] = useState(false);

  // Step 3: Rate Card
  const [ratePost, setRatePost] = useState(300);
  const [rateVideo, setRateVideo] = useState(800);
  const [rateStory, setRateStory] = useState(150);

  // Step 4: Portfolio
  const [portfolioItems, setPortfolioItems] = useState<Array<{ title: string; description: string; url: string }>>([]);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [uploading, setUploading] = useState(false);

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!niche || !bio) {
        toast.error(t("Please select a primary niche and enter a short bio."));
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!verifiedInsta && !verifiedTiktok && !youtube) {
        toast.error(t("Please connect and verify at least one social handle."));
        return;
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const verifySocialHandle = (platform: "instagram" | "tiktok") => {
    const handle = platform === "instagram" ? instagram : tiktok;
    if (!handle) {
      toast.error(t("Please enter your {platform} handle first.").replace("{platform}", platform));
      return;
    }

    if (platform === "instagram") {
      setVerifyingInsta(true);
      setTimeout(() => {
        setVerifyingInsta(false);
        setVerifiedInsta(true);
        toast.success(t("Instagram account linked!"), {
          description: t("Followers: 32.5k | Engagement: 5.2%"),
        });
      }, 1500);
    } else {
      setVerifyingTiktok(true);
      setTimeout(() => {
        setVerifyingTiktok(false);
        setVerifiedTiktok(true);
        toast.success(t("TikTok account linked!"), {
          description: t("Followers: 114.2k | Engagement: 6.8%"),
        });
      }, 1500);
    }
  };

  const handleSimulatedUpload = () => {
    if (!newItemTitle || !newItemDesc) {
      toast.error(t("Please provide a title and short description for the portfolio item."));
      return;
    }
    
    setUploading(true);
    setTimeout(() => {
      const randomImages = [
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1481487196290-c152efe083f5?auto=format&fit=crop&w=400&q=80"
      ];
      const selectedImg = randomImages[portfolioItems.length % randomImages.length];

      setPortfolioItems([
        ...portfolioItems,
        {
          title: newItemTitle,
          description: newItemDesc,
          url: selectedImg
        }
      ]);
      setNewItemTitle("");
      setNewItemDesc("");
      setUploading(false);
      toast.success(t("Portfolio item added."));
    }, 1200);
  };

  const removePortfolioItem = (index: number) => {
    setPortfolioItems(portfolioItems.filter((_, i) => i !== index));
  };

  const handleCompleteOnboarding = async () => {
    setLoading(true);
    try {
      let totalFollowers = 0;
      if (verifiedInsta) totalFollowers += 32500;
      if (verifiedTiktok) totalFollowers += 114200;
      if (youtube) totalFollowers += 12000;

      const socialHandle = instagram ? `@${instagram}` : tiktok ? `@${tiktok}` : `@${youtube}`;

      const { error } = await updateClientProfile({
        bio,
        niche,
        social_handle: socialHandle,
        followers: totalFollowers || 24000,
        engagement_rate: 4.8,
        social_links: {
          instagram: instagram || undefined,
          tiktok: tiktok || undefined,
          youtube: youtube || undefined
        },
        rate_card: {
          post: ratePost,
          video: rateVideo,
          story: rateStory
        },
        portfolio: portfolioItems.length > 0 ? portfolioItems : [
          { 
            title: "Acme Product Integration", 
            description: "Dedicated carousel showcasing minimal desk accessories.", 
            url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80" 
          }
        ],
        onboarded: true
      });

      if (error) {
        toast.error(error.message || t("Failed to save profile."));
        setLoading(false);
        return;
      }

      toast.success(t("Welcome, Creator!"), {
        description: t("Your influencer dashboard is now active."),
      });

      router.push("/creator/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(t("An unexpected error occurred."));
      setLoading(false);
    }
  };

  if (showWelcome) {
    return <CreatorOnboardingWelcome onStart={() => setShowWelcome(false)} />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-secondary/10 min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#007AFF]/5 via-transparent to-[#FF9500]/5 pointer-events-none" />

      <div className="w-full max-w-xl relative z-10">
        {/* Step Indicator */}
        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
              {step}
            </span>
            <span className="text-sm font-semibold">
              {step === 1 && t("Niche & Bio")}
              {step === 2 && t("Social Accounts")}
              {step === 3 && t("Rate Card")}
              {step === 4 && t("Portfolio Showcase")}
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-semibold">
            {t("Step {step} of 4").replace("{step}", step.toString())}
          </span>
        </div>

        {/* Progress Bar (Apple-style pill) */}
        <div className="w-full h-1.5 bg-secondary border border-border/20 rounded-full mb-8 overflow-hidden">
          <motion.div 
            className="h-full bg-primary rounded-full"
            initial={{ width: "25%" }}
            animate={{ width: `${step * 25}%` }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={appleSpring}
              className="p-8 rounded-3xl bg-card border border-border/30 shadow-md glass-panel"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <User size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{t("Create your creator profile")}</h2>
                  <p className="text-xs text-muted-foreground">{t("Select your primary niche and write a short bio.")}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground block">
                    {t("Primary Niche")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_NICHES.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setNiche(item)}
                        className={`px-3 py-2 text-xs font-semibold rounded-full border transition-all cursor-pointer ${
                          niche === item
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary/40 text-muted-foreground border-border/20 hover:border-border hover:text-foreground"
                        }`}
                      >
                        {t(item)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="bio" className="text-xs font-semibold text-muted-foreground block">
                    {t("Bio / About Me")}
                  </label>
                  <div className="relative">
                    <span className="absolute top-3.5 left-3.5 text-muted-foreground pointer-events-none">
                      <FileText size={16} />
                    </span>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={t("I create high-quality desk setups, minimal workspace guides, and productivity tutorials...")}
                      rows={4}
                      maxLength={300}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 transition-colors resize-none"
                    />
                  </div>
                  <div className="text-right text-[10px] text-muted-foreground font-semibold">
                    {t("{count}/300 characters").replace("{count}", bio.length.toString())}
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <Button
                  onClick={handleNextStep}
                  className="rounded-2xl px-6 py-5 font-semibold text-sm cursor-pointer shadow-sm gap-2"
                >
                  {t("Continue")} <ArrowRight size={16} />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={appleSpring}
              className="p-8 rounded-3xl bg-card border border-border/30 shadow-md glass-panel"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Heart size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{t("Connect your socials")}</h2>
                  <p className="text-xs text-muted-foreground">{t("Verify your accounts to sync follower and engagement counts.")}</p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Instagram */}
                <div className="space-y-1.5">
                  <label htmlFor="instagram" className="text-xs font-semibold text-muted-foreground block">
                    {t("Instagram Handle")}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted-foreground pointer-events-none">
                        <InstagramIcon size={16} />
                      </span>
                      <input
                        id="instagram"
                        type="text"
                        value={instagram}
                        onChange={(e) => setInstagram(e.target.value)}
                        placeholder={t("username")}
                        className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 transition-colors"
                        disabled={verifiedInsta}
                      />
                    </div>
                    {verifiedInsta ? (
                      <div className="bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/30 rounded-2xl px-4 flex items-center gap-1.5 text-xs font-bold select-none">
                        <CheckCircle2 size={14} /> {t("Linked")}
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => verifySocialHandle("instagram")}
                        className="rounded-2xl border-border hover:bg-secondary/40 text-xs px-4 cursor-pointer"
                        disabled={verifyingInsta || !instagram}
                      >
                        {verifyingInsta ? <Loader2 size={14} className="animate-spin" /> : t("Verify")}
                      </Button>
                    )}
                  </div>
                </div>

                {/* TikTok */}
                <div className="space-y-1.5">
                  <label htmlFor="tiktok" className="text-xs font-semibold text-muted-foreground block">
                    {t("TikTok Handle")}
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted-foreground pointer-events-none">
                        <TikTokIcon size={16} />
                      </span>
                      <input
                        id="tiktok"
                        type="text"
                        value={tiktok}
                        onChange={(e) => setTiktok(e.target.value)}
                        placeholder={t("username")}
                        className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 transition-colors"
                        disabled={verifiedTiktok}
                      />
                    </div>
                    {verifiedTiktok ? (
                      <div className="bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/30 rounded-2xl px-4 flex items-center gap-1.5 text-xs font-bold select-none">
                        <CheckCircle2 size={14} /> {t("Linked")}
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => verifySocialHandle("tiktok")}
                        className="rounded-2xl border-border hover:bg-secondary/40 text-xs px-4 cursor-pointer"
                        disabled={verifyingTiktok || !tiktok}
                      >
                        {verifyingTiktok ? <Loader2 size={14} className="animate-spin" /> : t("Verify")}
                      </Button>
                    )}
                  </div>
                </div>

                {/* YouTube */}
                <div className="space-y-1.5">
                  <label htmlFor="youtube" className="text-xs font-semibold text-muted-foreground block">
                    {t("YouTube Channel Link (Optional)")}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted-foreground pointer-events-none">
                      <YoutubeIcon size={16} />
                    </span>
                    <input
                      id="youtube"
                      type="url"
                      value={youtube}
                      onChange={(e) => setYoutube(e.target.value)}
                      placeholder="https://youtube.com/c/channel"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-2xl border-border px-5 py-5 text-sm cursor-pointer gap-2"
                >
                  <ArrowLeft size={16} /> {t("Back")}
                </Button>

                <Button
                  onClick={handleNextStep}
                  className="rounded-2xl px-6 py-5 font-semibold text-sm cursor-pointer shadow-sm gap-2"
                >
                  {t("Continue")} <ArrowRight size={16} />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={appleSpring}
              className="p-8 rounded-3xl bg-card border border-border/30 shadow-md glass-panel"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <DollarSign size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{t("Set your rate card")}</h2>
                  <p className="text-xs text-muted-foreground">{t("Specify baseline pricing for sponsors. You can customize these per offer.")}</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Rate: Instagram Post */}
                <div className="bg-secondary/20 p-4 border border-border/30 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                      <InstagramIcon size={15} /> {t("Standard Post")}
                    </span>
                    <span className="text-base font-bold text-foreground">${ratePost}</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="2000"
                    step="25"
                    value={ratePost}
                    onChange={(e) => setRatePost(Number(e.target.value))}
                    className="w-full h-1 bg-secondary border border-border/20 rounded-full appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground font-semibold">
                    <span>$50</span>
                    <span>$2,000</span>
                  </div>
                </div>

                {/* Rate: Dedicated Video */}
                <div className="bg-secondary/20 p-4 border border-border/30 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                      <TikTokIcon size={14} className="mt-0.5" /> {t("Dedicated Video")}
                    </span>
                    <span className="text-base font-bold text-foreground">${rateVideo}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="5000"
                    step="50"
                    value={rateVideo}
                    onChange={(e) => setRateVideo(Number(e.target.value))}
                    className="w-full h-1 bg-secondary border border-border/20 rounded-full appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground font-semibold">
                    <span>$100</span>
                    <span>$5,000</span>
                  </div>
                </div>

                {/* Rate: Instagram Story */}
                <div className="bg-secondary/20 p-4 border border-border/30 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                      <InstagramIcon size={15} /> {t("IG Story (with link)")}
                    </span>
                    <span className="text-base font-bold text-foreground">${rateStory}</span>
                  </div>
                  <input
                    type="range"
                    min="25"
                    max="1000"
                    step="25"
                    value={rateStory}
                    onChange={(e) => setRateStory(Number(e.target.value))}
                    className="w-full h-1 bg-secondary border border-border/20 rounded-full appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground font-semibold">
                    <span>$25</span>
                    <span>$1,000</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-2xl border-border px-5 py-5 text-sm cursor-pointer gap-2"
                >
                  <ArrowLeft size={16} /> {t("Back")}
                </Button>

                <Button
                  onClick={handleNextStep}
                  className="rounded-2xl px-6 py-5 font-semibold text-sm cursor-pointer shadow-sm gap-2"
                >
                  {t("Continue")} <ArrowRight size={16} />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={appleSpring}
              className="p-8 rounded-3xl bg-card border border-border/30 shadow-md glass-panel"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <Upload size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{t("Showcase past work")}</h2>
                  <p className="text-xs text-muted-foreground">{t("Add links or mock uploads of integrations brands will see.")}</p>
                </div>
              </div>

              <div className="space-y-6">
                {/* Form to add item */}
                <div className="p-4 bg-secondary/30 border border-border/20 rounded-2xl space-y-3">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t("Add Portfolio Item")}</h3>
                  
                  <input
                    type="text"
                    value={newItemTitle}
                    onChange={(e) => setNewItemTitle(e.target.value)}
                    placeholder={t("Campaign Title (e.g. Acme Keyboard)")}
                    className="w-full px-4 py-2.5 rounded-xl bg-secondary/40 border border-border/20 text-xs focus:outline-none focus:border-primary/60 transition-colors"
                  />

                  <textarea
                    value={newItemDesc}
                    onChange={(e) => setNewItemDesc(e.target.value)}
                    placeholder={t("Brief scope of work & results...")}
                    rows={2}
                    className="w-full px-4 py-2.5 rounded-xl bg-secondary/40 border border-border/20 text-xs focus:outline-none focus:border-primary/60 transition-colors resize-none"
                  />

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSimulatedUpload}
                    disabled={uploading}
                    className="w-full rounded-xl text-xs py-4 cursor-pointer gap-1.5"
                  >
                    {uploading ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <>
                        <Plus size={14} /> {t("Add Campaign Integration")}
                      </>
                    )}
                  </Button>
                </div>

                {/* List of items */}
                {portfolioItems.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {portfolioItems.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="flex items-center justify-between p-3 border border-border/20 bg-secondary/20 rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={item.url} 
                            alt={item.title} 
                            className="w-10 h-10 object-cover rounded-lg border border-border/10" 
                          />
                          <div>
                            <h4 className="text-xs font-bold">{item.title}</h4>
                            <p className="text-[10px] text-muted-foreground line-clamp-1">{item.description}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => removePortfolioItem(idx)}
                          className="text-destructive hover:bg-destructive/10 rounded-xl size-8 p-0 cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 flex flex-col items-center justify-center border border-dashed border-border/40 rounded-2xl bg-secondary/10 text-center">
                    <Upload size={24} className="text-muted-foreground/60 mb-2" />
                    <p className="text-xs text-muted-foreground">{t("No portfolio integrations added yet.")}</p>
                  </div>
                )}
              </div>

              <div className="mt-8 flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-2xl border-border px-5 py-5 text-sm cursor-pointer gap-2"
                >
                  <ArrowLeft size={16} /> {t("Back")}
                </Button>

                <Button
                  onClick={handleCompleteOnboarding}
                  className="rounded-2xl px-6 py-5 font-semibold text-sm cursor-pointer shadow-sm gap-2"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> {t("Completing...")}
                    </>
                  ) : (
                    <>
                      {t("Complete Profile")} <CheckCircle2 size={16} />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
