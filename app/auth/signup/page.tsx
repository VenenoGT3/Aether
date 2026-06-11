"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import {
  resendSignupConfirmation,
  signInWithGoogleClient,
  signUpClient,
} from "@/lib/supabase/client";
import { toast } from "sonner";
import { Sparkles, ArrowRight, ArrowLeft, Mail, KeyRound, User, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [referralRef, setReferralRef] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");

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

  const onboardingDestination = () => {
    const segment = role === "influencer" ? "creator" : "business";
    return segment === "creator" && referralRef
      ? `/creator/onboarding?ref=${encodeURIComponent(referralRef)}`
      : `/${segment}/onboarding`;
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    try {
      const { data, error } = await signInWithGoogleClient(onboardingDestination());
      if (error) {
        toast.error(error.message || t("Google sign in failed."));
        setGoogleLoading(false);
        return;
      }
      if (data?.url) {
        window.location.assign(data.url);
        return;
      }
      toast.error(t("Google sign in failed."));
    } catch {
      toast.error(t("Google sign in failed."));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      toast.error("Please fill in all details.");
      return;
    }

    setLoading(true);

    try {
      // Redirect to the onboarding wizard. Role "influencer" maps to the
      // "/creator" URL segment; carry any referral code through to onboarding.
      const dest = onboardingDestination();

      const { error, needsEmailConfirmation } = await signUpClient(
        email,
        password,
        fullName,
        role,
        dest
      );

      if (error) {
        toast.error(error.message || t("Failed to sign up. Please try again."));
        setLoading(false);
        return;
      }

      if (needsEmailConfirmation) {
        setPendingEmail(email);
        toast.success(t("Check your email to confirm your account."), {
          description: t("After confirming, Aether will send you to the right workspace."),
        });
        setLoading(false);
        return;
      }

      toast.success("Account created successfully!", {
        description: `Welcome to Aether. Redirecting you to your ${
          role === "business" ? "Brand" : "Creator"
        } onboarding.`,
      });

      router.push(dest);
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred during signup.");
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const targetEmail = pendingEmail || email;
    if (!targetEmail) {
      toast.error(t("Enter your email address first."));
      return;
    }

    setResending(true);
    try {
      const dest = onboardingDestination();
      const { error } = await resendSignupConfirmation(targetEmail, dest);

      if (error) {
        toast.error(error.message || t("Could not resend the confirmation email."));
        return;
      }

      toast.success(t("Confirmation email sent."), {
        description: t("Open the newest email link to finish signup."),
      });
    } catch {
      toast.error(t("Could not resend the confirmation email."));
    } finally {
      setResending(false);
    }
  };

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center overflow-hidden bg-[#0c1324] px-4 py-10 text-[#dce1fb] sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(173,198,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(173,198,255,0.045)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(77,142,255,0.20),rgba(12,19,36,0.62)_48%,transparent_76%)]" />
      <div className="pointer-events-none absolute -left-24 top-28 h-72 w-72 rounded-full bg-[#adc6ff]/10 blur-[90px]" />
      <div className="pointer-events-none absolute -right-20 bottom-16 h-80 w-80 rounded-full bg-[#d0bcff]/10 blur-[100px]" />

      <Link
        href="/"
        className="absolute left-5 top-5 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-[#c2c6d6] backdrop-blur-xl transition-colors hover:text-white sm:left-6 sm:top-6"
      >
        <ArrowLeft size={14} /> {t("Back to home")}
      </Link>
      <div className="absolute right-5 top-5 z-10 sm:right-6 sm:top-6">
        <LanguageToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={appleSpring}
        className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-[0_30px_100px_-50px_rgba(0,0,0,0.95)] backdrop-blur-2xl md:grid-cols-[0.92fr_1.08fr]"
      >
        <div className="relative hidden min-h-[560px] flex-col justify-between overflow-hidden border-r border-white/10 bg-slate-950/70 p-8 md:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_20%,rgba(173,198,255,0.16),transparent_32%),radial-gradient(circle_at_80%_70%,rgba(208,188,255,0.12),transparent_36%)]" />
          <div className="relative">
            <span className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#adc6ff] to-[#54a2ff] text-[#07101f] shadow-[0_0_32px_rgba(173,198,255,0.24)]">
              <Sparkles size={20} />
            </span>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#adc6ff]/20 bg-[#adc6ff]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-[#adc6ff]">
              <ShieldCheck size={13} />
              {t("Protected workspace")}
            </p>
            <h1 className="max-w-sm font-sans text-4xl font-black leading-tight tracking-tight text-white">
              {t("Join Aether to scale your performance campaigns.")}
            </h1>
          </div>
          <div className="relative grid gap-3 text-sm text-[#c2c6d6]">
            {[
              t("Verified view tracking"),
              t("Stripe-backed payouts"),
              t("Brand and creator workspaces"),
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <span className="h-2 w-2 rounded-full bg-[#adc6ff]" />
                <span className="font-semibold">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-8 md:p-10">
          <div className="mb-8">
            <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#adc6ff] to-[#54a2ff] text-[#07101f] md:hidden">
              <Sparkles size={18} />
            </span>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#adc6ff]">
              {t("Secure sign up")}
            </p>
            <h2 className="font-sans text-3xl font-black tracking-tight text-white">
              {t("Create Account")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#c2c6d6]">
              {t("Join the premium marketing ecosystem.")}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="mb-5 h-12 w-full rounded-2xl border-white/10 bg-white/[0.055] text-sm font-black text-white hover:bg-white/[0.09]"
            disabled={loading || googleLoading}
            onClick={() => void handleGoogleSignUp()}
          >
            {googleLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-white text-xs font-black text-[#07101f]">
                G
              </span>
            )}
            {googleLoading ? t("Redirecting to Google...") : t("Continue with Google")}
          </Button>

          <div className="mb-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c2c6d6]">
              {t("or")}
            </span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* iOS Segmented Pill Selector for Roles */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#c2c6d6] block">
                {t("Join as")}
              </label>
              <div className="bg-white/[0.055] p-[3px] rounded-2xl flex items-center border border-white/10 text-sm font-semibold select-none relative">
                <button
                  type="button"
                  onClick={() => setRole("business")}
                  className={`flex-1 py-2 rounded-xl transition-all cursor-pointer relative z-10 ${
                    role === "business"
                      ? "text-[#07101f] font-black"
                      : "text-[#c2c6d6] hover:text-white"
                  }`}
                >
                  {t("Brand / Business")}
                  {role === "business" && (
                    <motion.div
                      layoutId="activeAuthRoleTab"
                      className="absolute inset-0 bg-[#adc6ff] rounded-xl shadow-sm z-[-1]"
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setRole("influencer")}
                  className={`flex-1 py-2 rounded-xl transition-all cursor-pointer relative z-10 ${
                    role === "influencer"
                      ? "text-[#07101f] font-black"
                      : "text-[#c2c6d6] hover:text-white"
                  }`}
                >
                  {t("Influencer / Creator")}
                  {role === "influencer" && (
                    <motion.div
                      layoutId="activeAuthRoleTab"
                      className="absolute inset-0 bg-[#adc6ff] rounded-xl shadow-sm z-[-1]"
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="fullName" className="block text-xs font-bold text-[#c2c6d6]">
                  {role === "business" ? t("Full Name / Representative") : t("Full Name")}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#c2c6d6]">
                    <User size={16} />
                  </span>
                  <input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={role === "business" ? "Jane Doe" : "Sarah Jenkins"}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.055] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/60 focus:border-[#adc6ff]/55 focus:ring-2 focus:ring-[#adc6ff]/15"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-xs font-bold text-[#c2c6d6]">
                  {t("Email Address")}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#c2c6d6]">
                    <Mail size={16} />
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.055] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/60 focus:border-[#adc6ff]/55 focus:ring-2 focus:ring-[#adc6ff]/15"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-xs font-bold text-[#c2c6d6]">
                  {t("Password")}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#c2c6d6]">
                    <KeyRound size={16} />
                  </span>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.055] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/60 focus:border-[#adc6ff]/55 focus:ring-2 focus:ring-[#adc6ff]/15"
                    required
                  />
                </div>
              </div>
            </div>

            <Button
              type="submit"
              className="mt-2 h-12 w-full rounded-2xl bg-gradient-to-r from-[#adc6ff] to-[#54a2ff] text-sm font-black text-[#07101f] shadow-[0_0_28px_rgba(173,198,255,0.20)] hover:brightness-105"
              disabled={loading || googleLoading}
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

            {pendingEmail && (
              <div className="rounded-2xl border border-[#adc6ff]/20 bg-[#adc6ff]/10 p-4 text-sm text-[#c2c6d6]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#adc6ff]" />
                  <div className="space-y-3">
                    <div>
                      <p className="font-bold text-white">{t("Check your inbox")}</p>
                      <p className="mt-1 text-xs leading-relaxed">
                        {t("We sent a confirmation link to")}{" "}
                        <span className="font-bold text-white">{pendingEmail}</span>.{" "}
                        {t("Use the newest email link before signing in.")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-xl border-white/10 bg-white/[0.04] text-xs font-bold text-white hover:bg-white/[0.08]"
                      disabled={resending}
                      onClick={() => void handleResendConfirmation()}
                    >
                      {resending ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          {t("Resending...")}
                        </>
                      ) : (
                        t("Resend confirmation email")
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </form>

          <div className="mt-8 text-center text-xs text-[#c2c6d6]">
            {t("Already have an account?")}{" "}
            <Link href="/auth/login" className="font-bold text-[#adc6ff] hover:text-white">
              {t("Sign In")}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
