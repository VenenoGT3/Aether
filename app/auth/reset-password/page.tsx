"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Loader2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { signOutClient, supabase, updatePasswordClient } from "@/lib/supabase/client";
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

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [loading, setLoading] = useState(false);

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8,
  };

  useEffect(() => {
    let active = true;

    async function checkRecoverySession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      setHasSession(!!session);
      setCheckingSession(false);
    }

    void checkRecoverySession();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (password.length < 8) {
      toast.error(t("Password must be at least 8 characters."));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t("Passwords do not match."));
      return;
    }

    setLoading(true);
    try {
      const { error } = await withTimeout(
        updatePasswordClient(password),
        20000,
        t("Password update timed out. Please try again.")
      );

      if (error) {
        toast.error(error.message || t("Could not update password."));
        return;
      }

      toast.success(t("Password updated."), {
        description: t("Sign in again with your new password."),
      });

      await signOutClient();
      router.replace("/auth/login?passwordReset=1");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("Could not update password."));
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
          {checkingSession ? (
            <Loader2 size={22} className="animate-spin" />
          ) : hasSession ? (
            <Sparkles size={22} />
          ) : (
            <AlertCircle size={22} />
          )}
        </span>

        {checkingSession ? (
          <div>
            <h1 className="font-sans text-3xl font-black tracking-tight text-white">
              {t("Checking reset link")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#c2c6d6]">
              {t("Please wait while Aether verifies your password recovery session.")}
            </p>
          </div>
        ) : hasSession ? (
          <>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[#adc6ff]">
              {t("Password recovery")}
            </p>
            <h1 className="font-sans text-3xl font-black tracking-tight text-white">
              {t("Choose a new password")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#c2c6d6]">
              {t("Use a strong password you do not use on other services.")}
            </p>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="block text-xs font-bold text-[#c2c6d6]">
                  {t("New password")}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#c2c6d6]">
                    <KeyRound size={16} />
                  </span>
                  <input
                    id="new-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.055] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#adc6ff]/55 focus:ring-2 focus:ring-[#adc6ff]/15"
                    minLength={8}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="block text-xs font-bold text-[#c2c6d6]">
                  {t("Confirm new password")}
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#c2c6d6]">
                    <CheckCircle2 size={16} />
                  </span>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.055] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#adc6ff]/55 focus:ring-2 focus:ring-[#adc6ff]/15"
                    minLength={8}
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
                    <Loader2 size={16} className="animate-spin" /> {t("Updating password...")}
                  </>
                ) : (
                  t("Update password")
                )}
              </Button>
            </form>
          </>
        ) : (
          <div>
            <h1 className="font-sans text-3xl font-black tracking-tight text-white">
              {t("Reset link expired")}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#c2c6d6]">
              {t("Request a new password reset email and open the newest link.")}
            </p>
            <Link
              href="/auth/forgot-password"
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[#adc6ff] px-6 text-sm font-black text-[#07101f] transition hover:brightness-105"
            >
              {t("Request new reset link")}
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}
