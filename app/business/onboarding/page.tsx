"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { updateClientProfile } from "@/lib/supabase/client";
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
  CheckCircle2, 
  CreditCard,
  ExternalLink,
  Loader2,
  Sparkles
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function BusinessOnboarding() {
  const router = useRouter();
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [stripeOpen, setStripeOpen] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);

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

  const startStripeOnboarding = () => {
    setStripeOpen(true);
  };

  const simulateStripeSuccess = () => {
    setStripeLoading(true);
    setTimeout(() => {
      setStripeConnected(true);
      setStripeLoading(false);
      setStripeOpen(false);
      toast.success(t("Stripe Connect Account linked successfully!"), {
        description: t("Your business is ready to fund campaigns."),
      });
    }, 2000);
  };

  const handleCompleteOnboarding = async () => {
    if (!stripeConnected) {
      toast.error(t("Please connect your Stripe account before completing onboarding."));
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await updateClientProfile({
        company_name: companyName,
        website,
        industry,
        company_size: companySize,
        bio,
        stripe_connect_id: "acct_mockstripe_" + Math.random().toString(36).substring(7),
        stripe_onboarding_completed: true,
        onboarded: true,
      });

      if (error) {
        toast.error(error.message || t("Failed to save profile."));
        setLoading(false);
        return;
      }

      toast.success(t("Welcome to Aether!"), {
        description: t("Your business dashboard is now fully active."),
      });

      router.push("/business/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(t("An unexpected error occurred."));
      setLoading(false);
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
                {stripeConnected ? (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", damping: 15 }}
                    className="flex flex-col items-center"
                  >
                    <div className="w-14 h-14 rounded-full bg-[#34C759]/10 border border-[#34C759]/25 text-[#34C759] flex items-center justify-center mb-4">
                      <CheckCircle2 size={28} />
                    </div>
                    <h3 className="text-sm font-bold text-foreground">{t("Stripe Account Verified")}</h3>
                    <p className="text-[11px] text-muted-foreground mt-1.5 max-w-[285px] leading-relaxed">
                      {t("Simulated merchant credentials linked successfully. Your business is ready to create and fund escrow-backed campaigns.")}
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-5 rounded-xl border-border bg-card hover:bg-secondary/40 text-xs px-4 py-2 gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground h-auto"
                      onClick={() => setStripeConnected(false)}
                    >
                      {t("Disconnect Account")}
                    </Button>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center">
                    <span className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#635BFF] to-[#8E2DE2] shadow-sm flex items-center justify-center mb-4 text-white font-extrabold text-base select-none">
                      S
                    </span>
                    <h3 className="text-sm font-bold text-foreground">{t("Connect Stripe Wallet")}</h3>
                    <p className="text-[11px] text-muted-foreground mt-2 max-w-sm leading-relaxed">
                      {t("Aether partners with Stripe to secure transactions. Funding is locked in escrow during campaigns and disbursed only after your content review.")}
                    </p>
                    <Button
                      onClick={startStripeOnboarding}
                      className="mt-6 rounded-2xl bg-[#635BFF] hover:bg-[#534bc7] text-white font-semibold text-xs px-6 py-5 cursor-pointer gap-2 border-0 shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform"
                    >
                      {t("Connect Stripe Account")} <ExternalLink size={13} />
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-8 flex items-center justify-between pt-6 border-t border-border/10">
                <Button
                  variant="outline"
                  onClick={handlePrevStep}
                  className="rounded-2xl border-border px-5 py-5 text-xs font-semibold cursor-pointer gap-1.5 hover:bg-secondary/35 text-foreground h-auto"
                >
                  <ArrowLeft size={14} /> {t("Back")}
                </Button>

                <Button
                  onClick={handleCompleteOnboarding}
                  className={`rounded-2xl px-6 py-5 font-semibold text-xs cursor-pointer shadow-md gap-1.5 text-white border-0 h-auto ${
                    stripeConnected ? "bg-[#34C759] hover:scale-[1.02] active:scale-[0.98]" : "bg-muted cursor-not-allowed opacity-50"
                  }`}
                  disabled={loading || !stripeConnected}
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> {t("Finalizing...")}
                    </>
                  ) : (
                    <>
                      {t("Complete Setup")} <CheckCircle2 size={14} />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stripe Connect Modal Dialog */}
      <Dialog open={stripeOpen} onOpenChange={setStripeOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl border border-border/40 p-6 shadow-2xl bg-popover/90 backdrop-blur-xl">
          <DialogHeader className="text-center sm:text-left">
            <div className="flex items-center gap-1.5 text-[#635BFF] mb-2 font-bold select-none text-sm">
              <span className="w-5 h-5 rounded bg-[#635BFF] flex items-center justify-center text-white text-[10px]">S</span>
              stripe <span className="text-muted-foreground/60 font-semibold">connect</span>
            </div>
            <DialogTitle className="text-lg font-bold tracking-tight text-foreground">{t("Simulate Stripe Onboarding")}</DialogTitle>
            <DialogDescription className="text-xs mt-1 leading-relaxed text-muted-foreground">
              {t("In development mode, we bypass Stripe Connect authentication and register a sandbox merchant account.")}
            </DialogDescription>
          </DialogHeader>

          <div className="py-5 px-4 bg-secondary/30 border border-border/10 rounded-2xl my-4 text-xs space-y-3 leading-relaxed">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={14} className="text-[#635BFF] shrink-0 mt-0.5" />
              <span>{t("Validate business registration credentials and EIN number.")}</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={14} className="text-[#635BFF] shrink-0 mt-0.5" />
              <span>{t("Authorize escrow operations and payment collection on campaign launches.")}</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={14} className="text-[#635BFF] shrink-0 mt-0.5" />
              <span>{t("Configure default funding sources (Visa / Mastercard mock routing).")}</span>
            </div>
          </div>

          <DialogFooter className="-mx-6 -mb-6 p-4 border-t border-border/10 bg-secondary/20 flex gap-2 sm:gap-0 justify-end rounded-b-3xl">
            <Button
              variant="outline"
              onClick={() => setStripeOpen(false)}
              className="rounded-xl border-border hover:bg-secondary/40 cursor-pointer text-xs h-auto py-2.5 px-4"
              disabled={stripeLoading}
            >
              {t("Cancel")}
            </Button>
            <Button
              onClick={simulateStripeSuccess}
              className="rounded-xl bg-[#635BFF] hover:bg-[#524bc5] text-white cursor-pointer text-xs font-semibold gap-1.5 border-0 h-auto py-2.5 px-4"
              disabled={stripeLoading}
            >
              {stripeLoading ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> {t("Verifying...")}
                </>
              ) : (
                <>
                  {t("Link Sandbox")} <ArrowRight size={13} />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
