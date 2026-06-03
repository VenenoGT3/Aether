"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signUpClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Sparkles, ArrowRight, ArrowLeft, Mail, KeyRound, User, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "@/lib/translations";

export default function SignupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [role, setRole] = useState<"business" | "influencer">("business");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [referralRef, setReferralRef] = useState("");

  // Pre-select the role from the landing-page CTA (?role=business|influencer)
  // and capture a referral code from a share link (?ref=CODE).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get("role");
    const ref = params.get("ref");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read-once-on-mount
    if (r === "influencer" || r === "business") setRole(r);
    if (ref) setReferralRef(ref);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      toast.error("Please fill in all details.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await signUpClient(email, password, fullName, role);

      if (error) {
        toast.error(error.message || "Failed to sign up. Please try again.");
        setLoading(false);
        return;
      }

      toast.success("Account created successfully!", {
        description: `Welcome to Aether. Redirecting you to your ${
          role === "business" ? "Brand" : "Creator"
        } onboarding.`,
      });

      // Redirect to the onboarding wizard. Role "influencer" maps to the
      // "/creator" URL segment; carry any referral code through to onboarding.
      const segment = role === "influencer" ? "creator" : "business";
      const dest =
        segment === "creator" && referralRef
          ? `/creator/onboarding?ref=${encodeURIComponent(referralRef)}`
          : `/${segment}/onboarding`;
      router.push(dest);
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred during signup.");
      setLoading(false);
    }
  };

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

  return (
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-4rem)] p-6 bg-secondary/10 relative">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#007AFF]/5 via-transparent to-[#34C759]/5 pointer-events-none" />

      {/* Back button */}
      <Link
        href="/"
        className="absolute top-6 left-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> {t("Back to home")}
      </Link>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={appleSpring}
        className="w-full max-w-md p-8 rounded-3xl bg-card border border-border/30 shadow-md relative z-10 glass-panel"
      >
        {/* Logo and title */}
        <div className="flex flex-col items-center text-center mb-6">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#34C759] shadow-sm flex items-center justify-center mb-4">
            <Sparkles size={20} className="text-white" />
          </span>
          <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
            {t("Create your account")}
          </h2>
          <p className="text-muted-foreground text-sm mt-1.5">
            {t("Join the premium marketing ecosystem.")}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* iOS Segmented Pill Selector for Roles */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground/85 uppercase tracking-wider block">
              {t("Join as")}
            </label>
            <div className="bg-secondary/60 p-[3px] rounded-2xl flex items-center border border-border/20 text-sm font-semibold select-none relative">
              <button
                type="button"
                onClick={() => setRole("business")}
                className={`flex-1 py-2 rounded-xl transition-all cursor-pointer relative z-10 ${
                  role === "business"
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground/80 hover:text-foreground"
                }`}
              >
                {t("Brand / Business")}
                {role === "business" && (
                  <motion.div
                    layoutId="activeAuthRoleTab"
                    className="absolute inset-0 bg-background rounded-xl shadow-sm z-0 border border-border/10"
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => setRole("influencer")}
                className={`flex-1 py-2 rounded-xl transition-all cursor-pointer relative z-10 ${
                  role === "influencer"
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground/80 hover:text-foreground"
                }`}
              >
                {t("Influencer / Creator")}
                {role === "influencer" && (
                  <motion.div
                    layoutId="activeAuthRoleTab"
                    className="absolute inset-0 bg-background rounded-xl shadow-sm z-0 border border-border/10"
                    transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="text-xs font-semibold text-muted-foreground block">
                {role === "business" ? t("Full Name / Representative") : t("Full Name")}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted-foreground pointer-events-none">
                  <User size={16} />
                </span>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={role === "business" ? "Jane Doe" : "Sarah Jenkins"}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-colors"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-muted-foreground block">
                {t("Email Address")}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted-foreground pointer-events-none">
                  <Mail size={16} />
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-colors"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold text-muted-foreground block">
                {t("Password")}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-muted-foreground pointer-events-none">
                  <KeyRound size={16} />
                </span>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-colors"
                  required
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full rounded-2xl py-6 font-semibold text-sm shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-transform cursor-pointer gap-2 mt-2"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {t("Creating Account...")}
              </>
            ) : (
              <>
                {t("Sign Up")} <ArrowRight size={16} />
              </>
            )}
          </Button>
        </form>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          {t("Already have an account?")}{" "}
          <Link href="/auth/login" className="text-primary font-semibold hover:underline">
            {t("Sign In")}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
