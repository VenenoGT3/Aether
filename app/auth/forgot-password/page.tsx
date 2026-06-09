"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Send, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { requestPasswordResetClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/translations";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function ForgotPasswordForm() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      toast.error(t("Enter your email address first."));
      return;
    }

    setLoading(true);
    try {
      const { error } = await withTimeout(
        requestPasswordResetClient(email.trim()),
        20000,
        t("Password reset request timed out. Please try again.")
      );

      if (error) {
        toast.error(error.message || t("Could not send password reset email."));
        return;
      }

      setSent(true);
      toast.success(t("Password reset email sent."), {
        description: t("Open the newest email link to choose a new password."),
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("Could not send password reset email.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center overflow-hidden bg-[#0c1324] px-4 py-10 text-[#dce1fb] sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(173,198,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(173,198,255,0.045)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(77,142,255,0.20),rgba(12,19,36,0.62)_48%,transparent_76%)]" />

      <Link
        href="/auth/login"
        className="absolute left-5 top-5 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-[#c2c6d6] backdrop-blur-xl transition-colors hover:text-white sm:left-6 sm:top-6"
      >
        <ArrowLeft size={14} /> {t("Back to sign in")}
      </Link>
      <div className="absolute right-5 top-5 z-10 sm:right-6 sm:top-6">
        <LanguageToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={appleSpring}
        className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 shadow-[0_30px_100px_-50px_rgba(0,0,0,0.95)] backdrop-blur-2xl"
      >
        <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#adc6ff] to-[#54a2ff] text-[#07101f]">
          {sent ? <CheckCircle2 size={22} /> : <Sparkles size={22} />}
        </span>
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#adc6ff]">
          {t("Password recovery")}
        </p>
        <h1 className="font-sans text-3xl font-black tracking-tight text-white">
          {sent ? t("Check your email") : t("Reset your password")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#c2c6d6]">
          {sent
            ? t("If an Aether account exists for this email, the newest message contains a secure reset link.")
            : t("Enter the email attached to your Aether account and we will send a secure reset link.")}
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="reset-email" className="block text-xs font-bold text-[#c2c6d6]">
              {t("Email Address")}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#c2c6d6]">
                <Mail size={16} />
              </span>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.055] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#adc6ff]/55 focus:ring-2 focus:ring-[#adc6ff]/15"
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#adc6ff] to-[#54a2ff] text-sm font-black text-[#07101f] shadow-[0_0_28px_rgba(173,198,255,0.20)] hover:brightness-105"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {t("Sending reset link...")}
              </>
            ) : (
              <>
                {t("Send reset link")} <Send size={16} />
              </>
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="relative flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center bg-[#0c1324] p-6">
          <Loader2 className="animate-spin text-[#adc6ff]" size={32} />
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
