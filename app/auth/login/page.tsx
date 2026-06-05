"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signInClient, getClientProfile } from "@/lib/supabase/client";
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
};

function LoginForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [testLoginRoles, setTestLoginRoles] = useState<TestLoginRole[]>([]);
  const [testLoading, setTestLoading] = useState<TestLoginRole | null>(null);

  const redirectTo = searchParams.get("redirectTo") || "/dashboard";

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
      toast.error("Please enter both email and password.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await signInClient(email, password);
      
      if (error) {
        toast.error(error.message || "Failed to sign in. Please verify your credentials.");
        setLoading(false);
        return;
      }

      toast.success("Welcome back!", {
        description: "Secure authentication completed.",
      });

      // Fetch the updated profile to determine onboarding direction
      const profile = await getClientProfile();
      if (profile) {
        // Role "influencer" maps to the "/creator" URL segment.
        const segment = profile.role === "influencer" ? "creator" : "business";
        if (!profile.onboarded) {
          router.push(`/${segment}/onboarding`);
        } else {
          router.push(redirectTo === "/dashboard" ? `/${segment}/dashboard` : redirectTo);
        }
      } else {
        router.push("/dashboard");
      }
      
      router.refresh();
    } catch {
      toast.error("An unexpected error occurred during login.");
      setLoading(false);
    }
  };

  const handleTestLogin = async (role: TestLoginRole) => {
    setTestLoading(role);
    try {
      const data = await apiPost<TestLoginResponse>("/api/test-login", { role });
      toast.success(t("Welcome back!"), {
        description: t("Secure authentication completed."),
      });
      router.push(data.redirectTo);
      router.refresh();
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
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-4rem)] p-6 bg-secondary/10 relative">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 bg-gradient-to-tr from-[#007AFF]/5 via-transparent to-[#FF9500]/5 pointer-events-none" />

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
        <div className="flex flex-col items-center text-center mb-8">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#34C759] shadow-sm flex items-center justify-center mb-4">
            <Sparkles size={20} className="text-white" />
          </span>
          <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
            {t("Welcome Back")}
          </h2>
          <p className="text-muted-foreground text-sm mt-2">
            {t("Sign in to access your Aether workspace.")}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
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
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-colors"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="password" className="text-xs font-semibold text-muted-foreground block">
                  {t("Password")}
                </label>
                <Link
                  href="#"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => toast.info(t("Password reset is coming soon."), { description: t("Please contact support to reset your password.") })}
                >
                  {t("Forgot password?")}
                </Link>
              </div>
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
                <Loader2 size={16} className="animate-spin" /> {t("Signing In...")}
              </>
            ) : (
              <>
                {t("Sign In")} <ArrowRight size={16} />
              </>
            )}
          </Button>
        </form>

        {testLoginRoles.length > 0 && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border/30" />
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                {t("Testing")}
              </span>
              <span className="h-px flex-1 bg-border/30" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {testLoginRoles.includes("business") && (
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl py-5 text-xs font-semibold gap-2"
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
                  className="rounded-2xl py-5 text-xs font-semibold gap-2"
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

        <div className="mt-8 text-center text-xs text-muted-foreground">
          {t("Don't have an account?")}{" "}
          <Link href="/auth/signup" className="text-primary font-semibold hover:underline">
            {t("Sign up now")}
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-4rem)] p-6 bg-secondary/10 relative animate-pulse">
        <div className="absolute inset-0 bg-gradient-to-tr from-[#007AFF]/5 via-transparent to-[#FF9500]/5 pointer-events-none" />
        <div className="w-full max-w-md p-8 rounded-3xl bg-card border border-border/30 shadow-md relative z-10 glass-panel flex flex-col items-center justify-center min-h-[350px]">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
