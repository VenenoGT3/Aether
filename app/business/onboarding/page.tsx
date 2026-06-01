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
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-secondary/10 min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#007AFF]/5 via-transparent to-[#34C759]/5 pointer-events-none" />

      <div className="w-full max-w-xl relative z-10">
        {/* Step Indicator */}
        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
              {step}
            </span>
            <span className="text-sm font-semibold">
              {step === 1 ? t("Brand Profile") : t("Payment Setup")}
            </span>
          </div>
          <span className="text-xs text-muted-foreground font-semibold">
            {t("Step {step} of 2").replace("{step}", step.toString())}
          </span>
        </div>

        {/* Progress Bar (Apple-style pill indicator) */}
        <div className="w-full h-1.5 bg-secondary border border-border/20 rounded-full mb-8 overflow-hidden">
          <motion.div 
            className="h-full bg-primary rounded-full"
            initial={{ width: "50%" }}
            animate={{ width: step === 1 ? "50%" : "100%" }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
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
                  <Building2 size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{t("Tell us about your company")}</h2>
                  <p className="text-xs text-muted-foreground">{t("This helps creators understand your brand.")}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="companyName" className="text-xs font-semibold text-muted-foreground block">
                    {t("Company Name")}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted-foreground pointer-events-none">
                      <Building2 size={16} />
                    </span>
                    <input
                      id="companyName"
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Acme Corp"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="website" className="text-xs font-semibold text-muted-foreground block">
                    {t("Company Website")}
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted-foreground pointer-events-none">
                      <Globe size={16} />
                    </span>
                    <input
                      id="website"
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://acme.com"
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="industry" className="text-xs font-semibold text-muted-foreground block">
                      {t("Industry")}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted-foreground pointer-events-none">
                        <Briefcase size={16} />
                      </span>
                      <input
                        id="industry"
                        type="text"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        placeholder="Consumer Goods"
                        className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 transition-colors"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="companySize" className="text-xs font-semibold text-muted-foreground block">
                      {t("Company Size")}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted-foreground pointer-events-none">
                        <Users size={16} />
                      </span>
                      <select
                        id="companySize"
                        value={companySize}
                        onChange={(e) => setCompanySize(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 transition-colors appearance-none cursor-pointer"
                        required
                      >
                        <option value="">{t("Select size...")}</option>
                        <option value="1-10">{t("1-10 employees")}</option>
                        <option value="11-50">{t("11-50 employees")}</option>
                        <option value="51-200">{t("51-200 employees")}</option>
                        <option value="201-1000">{t("201-1000 employees")}</option>
                        <option value="1000+">{t("1000+ employees")}</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="bio" className="text-xs font-semibold text-muted-foreground block">
                    {t("Company Bio (Optional)")}
                  </label>
                  <div className="relative">
                    <span className="absolute top-3.5 left-3.5 text-muted-foreground pointer-events-none">
                      <FileText size={16} />
                    </span>
                    <textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={t("Brief description of what you do, target audience, brand aesthetic...")}
                      rows={3}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 transition-colors resize-none"
                    />
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
          ) : (
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
                  <CreditCard size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{t("Payout & Payment Gateway")}</h2>
                  <p className="text-xs text-muted-foreground">{t("Setup Stripe to fund active marketing campaigns.")}</p>
                </div>
              </div>

              <div className="py-6 flex flex-col items-center justify-center border border-dashed border-border rounded-2xl bg-secondary/20 p-6 text-center">
                {stripeConnected ? (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", damping: 15 }}
                    className="flex flex-col items-center"
                  >
                    <div className="w-16 h-16 rounded-full bg-[#34C759]/10 text-[#34C759] flex items-center justify-center mb-4">
                      <CheckCircle2 size={36} />
                    </div>
                    <h3 className="text-base font-bold">{t("Stripe Connect Account Linked")}</h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
                      {t("Account acct_mockstripe_*** linked successfully. Payments and escrow can be initialized.")}
                    </p>
                    <Button 
                      variant="outline" 
                      className="mt-6 rounded-xl border-border hover:bg-secondary/40 text-xs gap-1.5 cursor-pointer"
                      onClick={() => setStripeConnected(false)}
                    >
                      {t("Disconnect Account")}
                    </Button>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center">
                    <span className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#635BFF] to-[#00D4FF] shadow-sm flex items-center justify-center mb-4 text-white font-bold text-sm select-none">
                      S
                    </span>
                    <h3 className="text-base font-bold">{t("Connect with Stripe")}</h3>
                    <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                      {t("Aether utilizes Stripe Connect to handle secure campaign funding and release escrows. Connect your business checking or debit account.")}
                    </p>
                    <Button
                      onClick={startStripeOnboarding}
                      className="mt-6 rounded-2xl bg-[#635BFF] hover:bg-[#635BFF]/90 text-white font-semibold text-sm px-6 py-5 cursor-pointer gap-2"
                    >
                      {t("Connect Stripe Account")} <ExternalLink size={14} />
                    </Button>
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
                  disabled={loading || !stripeConnected}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> {t("Finalizing...")}
                    </>
                  ) : (
                    <>
                      {t("Complete Setup")} <CheckCircle2 size={16} />
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
        <DialogContent className="sm:max-w-md rounded-2xl border border-border p-6 shadow-xl">
          <DialogHeader className="text-center sm:text-left">
            <div className="flex items-center gap-2 text-[#635BFF] mb-2 font-bold select-none text-base">
              <span className="w-6 h-6 rounded bg-[#635BFF] flex items-center justify-center text-white text-[10px]">S</span>
              stripe <span className="text-muted-foreground/60 font-medium">connect</span>
            </div>
            <DialogTitle className="text-lg font-bold">{t("Simulate Stripe Onboarding")}</DialogTitle>
            <DialogDescription className="text-xs mt-1 leading-relaxed">
              {t("In development environment, we simulate linking your company checking credentials with Stripe Connect.")}
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 px-4 bg-secondary/30 border border-border/20 rounded-xl my-4 text-xs space-y-3 leading-relaxed">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={15} className="text-[#635BFF] shrink-0 mt-0.5" />
              <span>{t("Verify your company registration and legal details.")}</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={15} className="text-[#635BFF] shrink-0 mt-0.5" />
              <span>{t("Configure bank details or debit card for Escrow and Payout routing.")}</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={15} className="text-[#635BFF] shrink-0 mt-0.5" />
              <span>{t("Authorize Aether Inc. to request escrow funding capabilities.")}</span>
            </div>
          </div>

          <DialogFooter className="-mx-6 -mb-6 p-4 border-t bg-muted/30">
            <Button
              variant="outline"
              onClick={() => setStripeOpen(false)}
              className="rounded-xl border-border cursor-pointer text-xs"
              disabled={stripeLoading}
            >
              {t("Cancel")}
            </Button>
            <Button
              onClick={simulateStripeSuccess}
              className="rounded-xl bg-[#635BFF] hover:bg-[#635BFF]/95 text-white cursor-pointer text-xs font-semibold gap-1.5"
              disabled={stripeLoading}
            >
              {stripeLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> {t("Linking...")}
                </>
              ) : (
                <>
                  {t("Link Account")} <ArrowRight size={14} />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
