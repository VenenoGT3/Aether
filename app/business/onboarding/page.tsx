"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { updateClientProfile } from "@/lib/supabase/client";
import { startStripeOnboardingAction } from "@/lib/stripe/actions";
import { toast } from "sonner";
import { useTranslation } from "@/lib/translations";
import { 
  Building2, 
  Globe, 
  Briefcase, 
  Users, 
  FileText, 
  ArrowRight, 
  ArrowLeft, 
  CreditCard,
  ExternalLink,
  Loader2,
  Sparkles
} from "lucide-react";

export default function BusinessOnboarding() {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [stripeLoading, setStripeLoading] = useState(false);

  // Form states
  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [bio, setBio] = useState("");

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!companyName || !website || !industry || !companySize) {
        toast.error(t("Please fill in all company profile details."));
        return;
      }
      setStep(2);
    }
  };

  const handlePrevStep = () => {
    if (step === 2) {
      setStep(1);
    }
  };

  // Persist the brand profile, then hand off to real Stripe Connect onboarding.
  // The connected account id + onboarded flag are set on return by
  // /stripe/callback, so onboarding only completes after a real Stripe account.
  const handleConnectStripe = async () => {
    setStripeLoading(true);
    toast.loading(t("Saving your profile..."), { id: "biz-onboard" });
    try {
      const { error } = await updateClientProfile({
        company_name: companyName,
        website,
        industry,
        company_size: companySize,
        bio,
      });

      if (error) {
        toast.error(error.message || t("Failed to save profile."), { id: "biz-onboard" });
        setStripeLoading(false);
        return;
      }

      toast.loading(t("Redirecting to Stripe Connect onboarding..."), { id: "biz-onboard" });
      const res = await startStripeOnboardingAction("business", window.location.origin);

      if (res.success && res.url) {
        window.location.href = res.url;
      } else {
        toast.error(res.error || t("Failed to start Stripe onboarding."), { id: "biz-onboard" });
        setStripeLoading(false);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("An unexpected error occurred."),
        { id: "biz-onboard" }
      );
      setStripeLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-[calc(100vh-4rem)] relative overflow-hidden bg-black">
      {/* Background Decorative Glows */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-gradient-to-tr from-[#007AFF]/10 to-transparent blur-[80px] pointer-events-none rounded-full animate-pulse duration-[6s]" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-gradient-to-br from-[#34C759]/10 to-transparent blur-[80px] pointer-events-none rounded-full animate-pulse duration-[8s]" />

      <div className="w-full max-w-xl relative z-10">
        {/* Logo and Intro */}
        <div className="text-center mb-10">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={appleSpring}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/80 border border-border/10 text-xs font-semibold text-primary mb-4"
          >
            <Sparkles size={12} className="text-[#007AFF]" />
            <span>Aether Brand Studio</span>
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-2 font-heading">
            {t("Setup your Workspace")}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            {t("Establish your brand profile and link payouts to start matching with curated micro-influencers.")}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-4 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold border border-primary/20">
              {step}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              {step === 1 ? t("Brand Profile") : t("Stripe Payment Setup")}
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-semibold">
            {t("Step {step} of 2").replace("{step}", step.toString())}
          </span>
        </div>

        {/* Progress Bar (Apple-style pill indicator) */}
        <div className="w-full h-1.5 bg-secondary/50 border border-border/10 rounded-full mb-8 overflow-hidden">
          <motion.div 
            className="h-full bg-gradient-to-r from-[#007AFF] to-[#34C759] rounded-full"
            initial={{ width: "50%" }}
            animate={{ width: step === 1 ? "50%" : "100%" }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={appleSpring}
              className="p-8 apple-card"
            >
              <div className="flex items-center gap-3.5 mb-8">
                <div className="w-10 h-10 rounded-2xl bg-[#007AFF]/10 border border-[#007AFF]/25 flex items-center justify-center text-primary">
                  <Building2 size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">{t("Company Profile Details")}</h2>
                  <p className="text-xs text-muted-foreground">{t("Introduce your brand to the creator community.")}</p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="companyName" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    {t("Company Name")}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-muted-foreground pointer-events-none">
                      <Building2 size={15} />
                    </span>
                    <input
                      id="companyName"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Corp"
                      className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-secondary/30 border border-border/10 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/45"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="website" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    {t("Company Website")}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-muted-foreground pointer-events-none">
                      <Globe size={15} />
                    </span>
                    <input
                      id="website"
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://acme.com"
                      className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-secondary/30 border border-border/10 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/45"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="industry" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      {t("Industry")}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-muted-foreground pointer-events-none">
                        <Briefcase size={15} />
                      </span>
                      <input
                        id="industry"
                        type="text"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        placeholder="Consumer Electronics"
                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-secondary/30 border border-border/10 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/45"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="companySize" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                      {t("Company Size")}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-muted-foreground pointer-events-none">
                        <Users size={15} />
                      </span>
                      <select
                        id="companySize"
                        value={companySize}
                        onChange={(e) => setCompanySize(e.target.value)}
                        className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-secondary/30 border border-border/10 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all appearance-none cursor-pointer placeholder:text-muted-foreground/45"
                        required
                      >
                        <option value="" className="bg-popover">{t("Select size...")}</option>
                        <option value="1-10" className="bg-popover">{t("1-10 employees")}</option>
                        <option value="11-50" className="bg-popover">{t("11-50 employees")}</option>
                        <option value="51-200" className="bg-popover">{t("51-200 employees")}</option>
                        <option value="201-1000" className="bg-popover">{t("201-1000 employees")}</option>
                        <option value="1000+" className="bg-popover">{t("1000+ employees")}</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="bio" className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    {t("Company Bio (Optional)")}
                  </label>
                  <div className="relative">
                    <span className="absolute top-3.5 left-4 text-muted-foreground pointer-events-none">
                      <FileText size={15} />
                    </span>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={t("Brief description of your brand identity, target demographic, and visual aesthetics...")}
                      rows={3}
                      className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-secondary/30 border border-border/10 text-sm focus:outline-none focus:border-primary/80 focus:ring-1 focus:ring-primary/40 transition-all resize-none placeholder:text-muted-foreground/45"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <Button
                  onClick={handleNextStep}
                  className="rounded-2xl px-6 py-6 font-semibold text-xs cursor-pointer shadow-md bg-primary hover:scale-[1.02] active:scale-[0.98] transition-transform text-white border-0 gap-1.5"
                >
                  {t("Continue")} <ArrowRight size={14} />
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={appleSpring}
              className="p-8 apple-card"
            >
              <div className="flex items-center gap-3.5 mb-8">
                <div className="w-10 h-10 rounded-2xl bg-[#34C759]/10 border border-[#34C759]/25 flex items-center justify-center text-[#34C759]">
                  <CreditCard size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold tracking-tight text-foreground">{t("Payment & Escrow Setup")}</h2>
                  <p className="text-xs text-muted-foreground">{t("Link a Stripe account to fund active marketing campaigns.")}</p>
                </div>
              </div>

              <div className="py-8 px-6 flex flex-col items-center justify-center border border-dashed border-border/60 rounded-2xl bg-secondary/20 text-center mb-6">
                <div className="flex flex-col items-center">
                  <span className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#635BFF] to-[#8E2DE2] shadow-sm flex items-center justify-center mb-4 text-white font-extrabold text-base select-none">
                    S
                  </span>
                  <h3 className="text-sm font-bold text-foreground">{t("Connect Stripe Wallet")}</h3>
                  <p className="text-[11px] text-muted-foreground mt-2 max-w-sm leading-relaxed">
                    {t("Aether partners with Stripe to secure transactions. Funding is locked in escrow during campaigns and disbursed only after your content review.")}
                  </p>
                  <Button
                    onClick={handleConnectStripe}
                    disabled={stripeLoading}
                    className="mt-6 rounded-2xl bg-[#635BFF] hover:bg-[#534bc7] text-white font-semibold text-xs px-6 py-5 cursor-pointer gap-2 border-0 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-60 disabled:hover:scale-100"
                  >
                    {stripeLoading ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> {t("Redirecting...")}
                      </>
                    ) : (
                      <>
                        {t("Connect Stripe Account")} <ExternalLink size={13} />
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-muted-foreground/70 mt-4 max-w-xs leading-relaxed">
                    {t("You'll be redirected to Stripe to finish onboarding, then returned here automatically.")}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between pt-6 border-t border-border/10">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  disabled={stripeLoading}
                  className="rounded-2xl border-border px-5 py-5 text-xs font-semibold cursor-pointer gap-1.5 hover:bg-secondary/35 text-foreground h-auto"
                >
                  <ArrowLeft size={14} /> {t("Back")}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
