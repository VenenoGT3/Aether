"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/translations";

const EMAIL_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function safeNextPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function emailOtpType(value: string | null): EmailOtpType {
  if (value && EMAIL_OTP_TYPES.has(value as EmailOtpType)) {
    return value as EmailOtpType;
  }
  return "email";
}

function loginUrl(params: Record<string, string>): string {
  const url = new URL("/auth/login", window.location.origin);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return `${url.pathname}${url.search}`;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function completeAuthRedirect() {
      const currentUrl = new URL(window.location.href);
      const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
      const nextPath = safeNextPath(currentUrl.searchParams.get("next"));
      const authError = hashParams.get("error") || currentUrl.searchParams.get("error");
      const authErrorCode = hashParams.get("error_code") || currentUrl.searchParams.get("error_code");
      const authErrorDescription =
        hashParams.get("error_description") ||
        currentUrl.searchParams.get("error_description") ||
        t("Authentication link failed.");

      if (authError) {
        const isExpired = authErrorCode === "otp_expired";
        router.replace(
          loginUrl({
            ...(isExpired ? { confirmationExpired: "1" } : {}),
            authError: authErrorDescription,
          })
        );
        return;
      }

      try {
        const tokenHash = currentUrl.searchParams.get("token_hash");
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: emailOtpType(currentUrl.searchParams.get("type")),
          });
          if (error) throw error;
        }

        const code = currentUrl.searchParams.get("code");
        if (!tokenHash && code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error) throw error;

        if (!session) {
          router.replace(loginUrl({ confirmed: "1" }));
          return;
        }

        router.replace(nextPath);
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error && err.message.includes("PKCE code verifier")
            ? t("This confirmation link was opened outside the browser that started signup. Please request a new confirmation email and open the new link.")
            : err instanceof Error
              ? err.message
              : t("Authentication link failed.");
        if (active) setErrorMessage(message);
      }
    }

    void completeAuthRedirect();
    return () => {
      active = false;
    };
  }, [router, t]);

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] flex-1 items-center justify-center overflow-hidden bg-[#0c1324] px-4 py-10 text-[#dce1fb] sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(173,198,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(173,198,255,0.045)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(77,142,255,0.20),rgba(12,19,36,0.62)_48%,transparent_76%)]" />

      <div className="relative z-10 w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 text-center shadow-[0_30px_100px_-50px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
        <span className="mx-auto mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#adc6ff] to-[#54a2ff] text-[#07101f]">
          {errorMessage ? <AlertCircle size={22} /> : <Sparkles size={22} />}
        </span>
        <h1 className="font-sans text-2xl font-black tracking-tight text-white">
          {errorMessage ? t("Authentication link failed") : t("Confirming your account")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#c2c6d6]">
          {errorMessage ||
            t("Please wait while Aether verifies your email and prepares your workspace.")}
        </p>
        {errorMessage ? (
          <Link
            href="/auth/login"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-[#adc6ff] px-6 text-sm font-black text-[#07101f] transition hover:brightness-105"
          >
            {t("Back to sign in")}
          </Link>
        ) : (
          <div className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#adc6ff]">
            <Loader2 size={16} className="animate-spin" />
            {t("Loading")}
          </div>
        )}
      </div>
    </div>
  );
}
