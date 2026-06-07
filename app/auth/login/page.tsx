"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import {
  signInClient,
  resendSignupConfirmation,
  supabase,
} from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  KeyRound,
  Mail,
  Loader2,
  Building2,
  UserRound,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { useTranslation } from "@/lib/translations";
import { motion } from "framer-motion";
import { apiGet, apiPost } from "@/lib/api/client";

type TestLoginRole = "business" | "influencer";

type TestLoginConfigResponse = {
  success: true;
  roles: TestLoginRole[];
};

type TestLoginResponse = {
  success: true;
  redirectTo: string;
  session: {
    accessToken: string;
    refreshToken: string;
  };
};

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

function safeRedirectPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return "/dashboard";
  }
  return path;
}

function LoginForm() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [testLoginRoles, setTestLoginRoles] = useState<TestLoginRole[]>([]);
  const [testLoading, setTestLoading] = useState<TestLoginRole | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const authNoticeHandled = useRef(false);

  const redirectTo = safeRedirectPath(searchParams.get("redirectTo"));

  useEffect(() => {
    if (authNoticeHandled.current) return;

    const confirmed = searchParams.get("confirmed");
    const confirmationExpired = searchParams.get("confirmationExpired");
    const authError = searchParams.get("authError");

    if (confirmed) {
      toast.success(t("Email confirmed."), {
        description: t("You can now sign in to your Aether workspace."),
      });
      authNoticeHandled.current = true;
      return;
    }

    if (confirmationExpired) {
      toast.error(t("Your confirmation link expired."), {
        description: t("Enter your email and request a new confirmation link."),
      });
      authNoticeHandled.current = true;
      return;
    }

    if (authError) {
      toast.error(t("Authentication link failed."), {
        description: authError,
      });
      authNoticeHandled.current = true;
    }
  }, [searchParams, t]);

  useEffect(() => {
    let active = true;
    apiGet<TestLoginConfigResponse>("/api/test-login")
      .then((data) => {
        if (active) setTestLoginRoles(data.roles);
      })
      .catch(() => {
        if (active) setTestLoginRoles([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error(t("Please enter both email and password."));
      return;
    }

    setLoading(true);

    try {
      const { error } = await withTimeout(
        signInClient(email, password),
        20000,
        t("Sign in timed out. Please try again.")
      );
      
      if (error) {
        if (/confirm|verified|verification/i.test(error.message || "")) {
          setConfirmationEmail(email);
        }
        toast.error(error.message || t("Failed to sign in. Please verify your credentials."));
        setLoading(false);
        return;
      }

      toast.success(t("Welcome back!"), {
        description: t("Secure authentication completed."),
      });

      window.location.assign(redirectTo);
      return;
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("An unexpected error occurred during login.")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const targetEmail = confirmationEmail || email;
    if (!targetEmail) {
      toast.error(t("Enter your email address first."));
      return;
    }

    setResending(true);
    try {
      const { error } = await resendSignupConfirmation(targetEmail, redirectTo);
      if (error) {
        toast.error(error.message || t("Could not resend the confirmation email."));
        return;
      }

      setConfirmationEmail(targetEmail);
      toast.success(t("Confirmation email sent."), {
        description: t("Open the newest email link to finish signup."),
      });
    } catch {
      toast.error(t("Could not resend the confirmation email."));
    } finally {
      setResending(false);
    }
  };

  const handleTestLogin = async (role: TestLoginRole) => {
    setTestLoading(role);
    try {
      const data = await apiPost<TestLoginResponse>("/api/test-login", { role });
      const { error } = await supabase.auth.setSession({
        access_token: data.session.accessToken,
        refresh_token: data.session.refreshToken,
      });

      if (error) {
        throw error;
      }

      toast.success(t("Welcome back!"), {
        description: t("Secure authentication completed."),
      });
      window.location.assign(safeRedirectPath(data.redirectTo));
      return;
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("Could not sign in to the test account.")
      );
    } finally {
      setTestLoading(null);
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
              {t("Access campaigns, payouts, and creator workflows.")}
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
              {t("Secure sign in")}
            </p>
            <h2 className="font-sans text-3xl font-black tracking-tight text-white">
              {t("Welcome Back")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#c2c6d6]">
              {t("Sign in to access your Aether workspace.")}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
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
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.055] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#adc6ff]/55 focus:ring-2 focus:ring-[#adc6ff]/15"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="password" className="block text-xs font-bold text-[#c2c6d6]">
                  {t("Password")}
                </label>
                <Link
                  href="#"
                  className="text-xs font-semibold text-[#adc6ff] hover:text-white"
                  onClick={() => toast.info(t("Password reset is coming soon."), { description: t("Please contact support to reset your password.") })}
                >
                  {t("Forgot password?")}
                </Link>
              </div>
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
                  className="w-full rounded-2xl border border-white/10 bg-white/[0.055] py-3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#adc6ff]/55 focus:ring-2 focus:ring-[#adc6ff]/15"
                  required
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="mt-2 h-12 w-full rounded-2xl bg-gradient-to-r from-[#adc6ff] to-[#54a2ff] text-sm font-black text-[#07101f] shadow-[0_0_28px_rgba(173,198,255,0.20)] hover:brightness-105"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {t("Signing In...")}
              </>
            ) : (
              <>
                {t("Sign In")} <ArrowRight size={16} />
              </>
            )}
          </Button>

          {(confirmationEmail || searchParams.get("confirmationExpired")) && (
            <div className="rounded-2xl border border-[#adc6ff]/20 bg-[#adc6ff]/10 p-4 text-sm text-[#c2c6d6]">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0 text-[#adc6ff]" />
                <div className="space-y-3">
                  <div>
                    <p className="font-bold text-white">{t("Need a new confirmation link?")}</p>
                    <p className="mt-1 text-xs leading-relaxed">
                      {confirmationEmail
                        ? t("Open the newest email we send before trying to sign in again.")
                        : t("Enter your email above, then request a new confirmation link.")}
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

        {testLoginRoles.length > 0 && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#c2c6d6]">
                {t("Testing")}
              </span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {testLoginRoles.includes("business") && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-white/10 bg-white/[0.04] text-xs font-bold text-white hover:bg-white/[0.08]"
                  disabled={loading || testLoading !== null}
                  onClick={() => void handleTestLogin("business")}
                >
                  {testLoading === "business" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Building2 size={15} />
                  )}
                  {t("Brand")}
                </Button>
              )}
              {testLoginRoles.includes("influencer") && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl border-white/10 bg-white/[0.04] text-xs font-bold text-white hover:bg-white/[0.08]"
                  disabled={loading || testLoading !== null}
                  onClick={() => void handleTestLogin("influencer")}
                >
                  {testLoading === "influencer" ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <UserRound size={15} />
                  )}
                  {t("Creator")}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="mt-8 text-center text-xs text-[#c2c6d6]">
          {t("Don't have an account?")}{" "}
          <Link href="/auth/signup" className="font-bold text-[#adc6ff] hover:text-white">
            {t("Sign up now")}
          </Link>
        </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="relative flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center bg-[#0c1324] p-6">
        <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-xl flex min-h-[350px] flex-col items-center justify-center">
          <Loader2 className="animate-spin text-[#adc6ff]" size={32} />
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
