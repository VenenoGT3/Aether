"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShieldCheck, Lock, BarChart3, ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "@/lib/translations";
import { getCookieConsent, setCookieConsent, clearCookieConsent } from "@/lib/consent";

const appleSpring = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };

export default function PrivacyPage() {
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState(false);
  const [decided, setDecided] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    const c = getCookieConsent();
    if (!c) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read stored consent on mount
    setAnalytics(c.analytics);
    setDecided(true);
    setSavedAt(c.updatedAt || null);
  }, []);

  const save = () => {
    const v = setCookieConsent(analytics);
    setSavedAt(v.updatedAt);
    setDecided(true);
    toast.success(t("Preferences saved."));
  };

  const withdraw = () => {
    clearCookieConsent();
    setAnalytics(false);
    setDecided(false);
    setSavedAt(null);
    toast.success(t("Consent withdrawn."), {
      description: t("You'll be asked again next time."),
    });
  };

  const sections: { title: string; body: string }[] = [
    {
      title: t("What we collect"),
      body: t(
        "Account details you provide (name, email, role), content you create on Aether, and technical data needed to keep the platform secure and reliable."
      ),
    },
    {
      title: t("How we use it"),
      body: t(
        "To run campaigns, calculate earnings and payouts, prevent fraud, and provide support. We never sell your personal data."
      ),
    },
    {
      title: t("Your rights (GDPR)"),
      body: t(
        "You can access, correct, export, or delete your data, and withdraw consent at any time. Contact privacy@aether.app to exercise these rights."
      ),
    },
  ];

  return (
    <div className="flex-1 w-full max-w-2xl mx-auto px-6 py-12 md:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft size={14} /> {t("Back to home")}
      </Link>

      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={appleSpring}>
        <span className="text-xs font-semibold text-[#007AFF] uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
          <ShieldCheck size={14} /> {t("Privacy & Cookies")}
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
          {t("Your privacy, your choice")}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-10 max-w-xl">
          {t(
            "We're committed to protecting your data and complying with the GDPR. Manage your cookie preferences below — your choice applies right away."
          )}
        </p>

        {/* Cookie preferences */}
        <div className="apple-card p-6 mb-10">
          <h2 className="text-sm font-bold tracking-tight mb-4">{t("Cookie preferences")}</h2>

          {/* Essential — always on */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-secondary/20 border border-border/10 mb-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="p-2 rounded-xl bg-[#34C759]/10 text-[#34C759] shrink-0">
                <Lock size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight">{t("Essential cookies")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("Required for sign-in, security, and core features.")}
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#34C759] shrink-0">
              {t("Always on")}
            </span>
          </div>

          {/* Analytics — toggle */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-secondary/20 border border-border/10">
            <div className="flex items-start gap-3 min-w-0">
              <span className="p-2 rounded-xl bg-[#007AFF]/10 text-[#007AFF] shrink-0">
                <BarChart3 size={16} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight">{t("Analytics cookies")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("Help us understand usage to improve Aether.")}
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={analytics}
              aria-label={t("Analytics cookies")}
              onClick={() => setAnalytics((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${analytics ? "bg-[#34C759]" : "bg-secondary border border-border/40"}`}
            >
              <motion.span
                layout
                transition={appleSpring}
                className="absolute top-0.5 size-5 rounded-full bg-white shadow-sm"
                style={{ left: analytics ? "calc(100% - 1.375rem)" : "0.125rem" }}
              />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-5">
            <Button onClick={save} className="w-full sm:w-auto rounded-xl font-bold text-xs gap-1.5">
              <Check size={14} /> {t("Save preferences")}
            </Button>
            {decided && (
              <button
                onClick={withdraw}
                className="text-xs font-semibold text-muted-foreground hover:text-destructive transition-colors"
              >
                {t("Withdraw consent")}
              </button>
            )}
            {savedAt && (
              <span className="text-[11px] text-muted-foreground sm:ml-auto">
                {t("Last updated")} {new Date(savedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Policy summary */}
        <div className="space-y-6">
          {sections.map((s) => (
            <div key={s.title}>
              <h3 className="text-sm font-bold tracking-tight mb-1.5">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
