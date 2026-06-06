"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Eye,
  Film,
  Lock,
  Megaphone,
  Percent,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LandingStats } from "@/lib/supabase/landing-stats";
import { useTranslation } from "@/lib/translations";

type Props = {
  stats: LandingStats;
};

const heroImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBKXtiY8dKgANTKw-yp9-I_zjbX0ZGtyii9_LhO09OUzA5f0yKBZIpcFGI8fnOV6oahU2v3YZYYAhTQlOpB-G1vcUlHP3WJNvsbb9pbHXyvTCBsr-xQF6S8s40Nqj6EPDSiUNl6GNP8R5EvXcBum1VQI4c0ZINyyBj58atgi8WsBl4gYleLesmSdVEvOYuIVfLWMUwyqu11qpH6E8KxF488T5SebX5J7kOEVjuHQfEExsJ3pXvaGH3QPakJPd6SQ44SHL_ZZTtsutyFzQ";

const appleSpring = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

const processSteps = [
  {
    title: "Brief and budget allocation",
    accent: "text-[#adc6ff]",
    body: "Brands define UGC requirements or upload source content for clipping campaigns. The campaign budget is reserved before creators start producing.",
  },
  {
    title: "UGC and viral clipping",
    accent: "text-[#d0bcff]",
    body: "Creators produce original native content, while clipping editors turn long-form assets into short vertical videos for TikTok, Reels, and Shorts.",
  },
  {
    title: "View verification",
    accent: "text-[#9ed7ff]",
    body: "Aether syncs platform metrics, stores snapshots, and applies fraud checks before views become billable.",
  },
  {
    title: "Creator payouts",
    accent: "text-emerald-400",
    body: "Approved earnings accrue from verified views and move through Stripe Connect withdrawal flows.",
  },
];

const marketplaceCards = [
  {
    icon: Lock,
    title: "Native UGC",
    body: "Launch campaigns for reviews, tutorials, routines, demos, and authentic creator-led storytelling.",
    color: "text-[#adc6ff]",
    bg: "bg-[#adc6ff]/10",
    border: "border-[#adc6ff]/20",
  },
  {
    icon: Scissors,
    title: "Clipping services",
    body: "Turn podcasts, webinars, interviews, and brand footage into high-volume short-form clips.",
    color: "text-[#d0bcff]",
    bg: "bg-[#d0bcff]/10",
    border: "border-[#d0bcff]/20",
  },
  {
    icon: Wallet,
    title: "Pay-per-view escrow",
    body: "Fund a performance pool and let creators earn against verified views, capped by campaign rules.",
    color: "text-emerald-300",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
  },
];

function compact(value: number | null, locale: string, fallback: string): string {
  if (value === null) return fallback;
  return new Intl.NumberFormat(locale, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

function money(value: number | null, locale: string, fallback: string): string {
  if (value === null) return fallback;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

function percentFromViews(views: number | null): number {
  if (!views || views <= 0) return 0;
  return Math.min(100, Math.round((views / 1_200_000) * 100));
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Eye;
  tone: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
          {label}
        </span>
        <span className={`rounded-2xl border border-white/10 bg-white/[0.04] p-2 ${tone}`}>
          <Icon size={16} />
        </span>
      </div>
      <p className="font-sans text-3xl font-black tracking-tight text-white">{value}</p>
    </div>
  );
}

export function AetherLandingPage({ stats }: Props) {
  const { t, locale } = useTranslation();
  const formatterLocale = locale === "it" ? "it-IT" : "en-US";
  const progress = percentFromViews(stats.verifiedViews);

  const liveStats = [
    {
      label: t("Open campaigns"),
      value: compact(stats.openCampaigns, formatterLocale, t("Ready")),
      icon: Megaphone,
      tone: "text-[#adc6ff]",
    },
    {
      label: t("Creator network"),
      value: compact(stats.activeCreators, formatterLocale, t("Ready")),
      icon: Film,
      tone: "text-[#d0bcff]",
    },
    {
      label: t("Verified views"),
      value: compact(stats.verifiedViews, formatterLocale, t("Ready")),
      icon: Eye,
      tone: "text-emerald-300",
    },
    {
      label: t("Creator earnings"),
      value: money(stats.creatorEarnings, formatterLocale, t("Secured")),
      icon: Wallet,
      tone: "text-amber-300",
    },
  ];

  return (
    <div className="relative isolate flex-1 overflow-hidden bg-[#0c1324] text-[#dce1fb]">
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(173,198,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(173,198,255,0.045)_1px,transparent_1px)] bg-[size:64px_64px]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[760px] bg-[radial-gradient(ellipse_at_top,rgba(77,142,255,0.18),rgba(12,19,36,0.6)_42%,transparent_72%)]" />

      <section className="mx-auto flex w-full max-w-7xl flex-col items-center px-5 pb-14 pt-12 text-center sm:px-6 md:pb-20 md:pt-18">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={appleSpring}
          className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#adc6ff]/20 bg-[#adc6ff]/10 px-4 py-2 shadow-[0_0_24px_rgba(173,198,255,0.12)]"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-[#adc6ff]" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#adc6ff]">
            {t("UGC and clipping marketplace")}
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...appleSpring, delay: 0.06 }}
          className="max-w-5xl font-sans text-4xl font-black leading-[1.02] tracking-tight text-white sm:text-6xl lg:text-7xl"
        >
          {t("Performance creator campaigns, paid by verified views")}
          <span className="mt-3 block bg-gradient-to-r from-[#adc6ff] via-[#c4abff] to-[#d0bcff] bg-clip-text text-transparent">
            {t("not guesswork")}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...appleSpring, delay: 0.12 }}
          className="mt-6 max-w-3xl text-base leading-8 text-[#c2c6d6] sm:text-lg"
        >
          {t(
            "Aether connects brands with creators and clipping editors. Brands fund a capped pool, creators publish native short-form content, and payouts are calculated from tracked, fraud-checked views."
          )}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...appleSpring, delay: 0.18 }}
          className="mt-8 flex w-full max-w-xl flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link href="/auth/signup?role=business" className="w-full sm:w-auto">
            <Button className="h-12 w-full rounded-2xl bg-gradient-to-r from-[#adc6ff] to-[#54a2ff] px-7 text-sm font-black text-[#07101f] shadow-[0_0_28px_rgba(173,198,255,0.24)] hover:scale-[1.02] active:scale-[0.98]">
              <Zap className="h-4 w-4 fill-current" />
              {t("Start a campaign")}
            </Button>
          </Link>
          <Link href="/auth/signup?role=influencer" className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="h-12 w-full rounded-2xl border-white/10 bg-slate-950/70 px-7 text-sm font-bold text-white hover:scale-[1.02] hover:bg-white/[0.06] active:scale-[0.98]"
            >
              {t("Join as creator")}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...appleSpring, delay: 0.26 }}
          className="mt-16 w-full max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-2 shadow-2xl backdrop-blur-xl sm:p-3"
        >
          <div className="relative overflow-hidden rounded-[1.4rem] bg-slate-950">
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/85 px-3 py-2 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-rose-500" />
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-rose-300">
                {t("Live escrow monitor")}
              </span>
            </div>
            <div
              aria-label="Aether performance monitor"
              className="h-[280px] w-full bg-cover bg-center opacity-85 sm:h-[420px]"
              role="img"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
          </div>
        </motion.div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 px-5 pb-20 sm:px-6 md:grid-cols-4">
        {liveStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section id="process" className="mx-auto w-full max-w-4xl px-5 py-20 sm:px-6">
        <div className="mb-14 text-center">
          <h2 className="font-sans text-3xl font-black tracking-tight text-white sm:text-5xl">
            {t("The UGC and clipping workflow")}
          </h2>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.24em] text-slate-400">
            {t("From brief to verified payout")}
          </p>
        </div>

        <div className="relative mx-auto max-w-2xl space-y-11 pl-12 sm:pl-16">
          <div className="absolute left-[19px] top-4 h-[calc(100%-2rem)] w-px bg-gradient-to-b from-[#adc6ff] via-[#d0bcff] to-transparent sm:left-[27px]" />
          {processSteps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={appleSpring}
              className="relative"
            >
              <span className={`absolute -left-[42px] flex h-8 w-8 items-center justify-center rounded-2xl border border-white/10 bg-slate-950 font-mono text-xs font-black shadow-[0_0_18px_rgba(173,198,255,0.12)] sm:-left-[48px] ${step.accent}`}>
                {index + 1}
              </span>
              <h3 className={`font-sans text-lg font-black ${step.accent}`}>{t(step.title)}</h3>
              <p className="mt-2 text-sm leading-7 text-[#c2c6d6]">{t(step.body)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="marketplace" className="border-y border-white/5 bg-slate-950/40 px-5 py-20 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <h2 className="font-sans text-3xl font-black tracking-tight text-white sm:text-5xl">
              {t("One marketplace for UGC, clipping, and performance payout logic")}
            </h2>
            <p className="mt-4 text-[#c2c6d6]">
              {t(
                "Aether brings the full campaign path into one product: signup, onboarding, campaign creation, creator discovery, tracked clips, and payouts."
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {marketplaceCards.map((card) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={appleSpring}
                  className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-7 backdrop-blur-xl"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
                  <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border ${card.border} ${card.bg} ${card.color}`}>
                    <Icon size={23} />
                  </div>
                  <h3 className="font-sans text-xl font-black text-white">{t(card.title)}</h3>
                  <p className="mt-3 text-sm leading-7 text-[#c2c6d6]">{t(card.body)}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 px-5 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <h2 className="font-sans text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            {t("Efficiency for brands,")}
            <span className="block bg-gradient-to-r from-[#adc6ff] to-[#d0bcff] bg-clip-text text-transparent">
              {t("protection for creators")}
            </span>
          </h2>
          <p className="mt-5 text-base leading-8 text-[#c2c6d6]">
            {t(
              "Aether replaces fixed-fee uncertainty with a budget pool, creator caps, view verification, fraud screening, and Stripe payout flows designed for performance campaigns."
            )}
          </p>

          <div className="mt-8 space-y-5">
            {[
              {
                icon: Coins,
                title: "No blind flat spend",
                body: "Campaign pools cap spend upfront while letting real creator distribution scale inside the budget.",
                color: "text-[#adc6ff]",
                bg: "bg-[#adc6ff]/10",
              },
              {
                icon: Percent,
                title: "Performance economics",
                body: "CPM, creator caps, available pool, and earned payouts are modeled in the backend instead of a spreadsheet.",
                color: "text-[#d0bcff]",
                bg: "bg-[#d0bcff]/10",
              },
              {
                icon: ShieldAlert,
                title: "Fraud-aware tracking",
                body: "The worker records view snapshots, computes deltas, and flags suspicious growth before money moves.",
                color: "text-rose-300",
                bg: "bg-rose-500/10",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex gap-4">
                  <span className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${item.bg} ${item.color}`}>
                    <Icon size={19} />
                  </span>
                  <div>
                    <h3 className="font-sans text-sm font-black text-white">{t(item.title)}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#c2c6d6]">{t(item.body)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-white/10 pb-5">
            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-[#adc6ff]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#adc6ff]" />
              {t("Active campaign monitor")}
            </span>
            <span className="font-mono text-xl font-black text-white">
              {money(stats.fundedPool, formatterLocale, t("Secured"))}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-xs font-mono text-[#c2c6d6]">
              <span>
                {t("Verified views")}:{" "}
                {stats.verifiedViews === null
                  ? t("sync ready")
                  : compact(stats.verifiedViews, formatterLocale, t("Ready"))}
              </span>
              <span className="font-black text-[#adc6ff]">{progress}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full border border-white/10 bg-slate-950 p-[1px]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#adc6ff] via-[#54a2ff] to-emerald-300"
                style={{ width: `${Math.max(progress, stats.verifiedViews === null ? 48 : 4)}%` }}
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-center">
              <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                {t("Campaign CPM")}
              </span>
              <span className="mt-1 block font-mono text-xl font-black text-white">$5.10</span>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 text-center">
              <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                {t("Provider")}
              </span>
              <span className="mt-1 block font-mono text-xl font-black text-emerald-300">
                {t("Official")}
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 p-4 text-[11px] font-mono text-[#c2c6d6]">
            <span>{t("Escrow vault and fraud checks")}</span>
            <span className="flex items-center gap-1 font-black text-emerald-300">
              <CheckCircle2 size={14} />
              {t("protected")}
            </span>
          </div>
        </div>
      </section>

      <section id="security" className="px-5 py-8 sm:px-6">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-[#adc6ff]/15 bg-slate-950/50 p-8 text-center shadow-2xl backdrop-blur-xl md:p-12">
          <div className="mb-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <span className="flex items-center gap-2 rounded-full border border-[#adc6ff]/20 bg-[#adc6ff]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#adc6ff]">
              <ShieldCheck size={16} />
              {t("Escrow guarded")}
            </span>
            <span className="flex items-center gap-2 rounded-full border border-[#d0bcff]/20 bg-[#d0bcff]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#d0bcff]">
              <CheckCircle2 size={16} />
              {t("Fraud ledger")}
            </span>
          </div>
          <h2 className="font-sans text-3xl font-black tracking-tight text-white sm:text-5xl">
            {t("Built around money-path integrity")}
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-sm leading-8 text-[#c2c6d6] sm:text-base">
            {t(
              "Campaign budgets, earned views, creator earnings, payout claims, and moderation decisions stay in the production Aether backend. The landing UI now points users into those flows instead of running a disconnected demo."
            )}
          </p>
        </div>
      </section>

      <section id="start" className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-5 px-5 py-20 sm:px-6 md:grid-cols-2">
        <div className="flex min-h-[320px] flex-col justify-between rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl">
          <div>
            <h2 className="font-sans text-3xl font-black tracking-tight text-white">
              {t("Ready to launch a campaign?")}
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#c2c6d6]">
              {t(
                "Start from the real brand onboarding path, then create and fund a performance campaign inside Aether."
              )}
            </p>
          </div>
          <Link href="/auth/signup?role=business" className="mt-8">
            <Button className="h-12 w-full rounded-2xl bg-white text-sm font-black text-slate-950 hover:bg-[#adc6ff]">
              {t("Create brand account")}
              <ArrowRight size={16} />
            </Button>
          </Link>
        </div>

        <div className="flex min-h-[320px] flex-col justify-between rounded-[2rem] border border-[#d0bcff]/20 bg-white/[0.04] p-8 backdrop-blur-xl">
          <div>
            <h2 className="font-sans text-3xl font-black tracking-tight text-white">
              {t("Creator or clipping editor?")}
            </h2>
            <p className="mt-4 text-sm leading-7 text-[#c2c6d6]">
              {t(
                "Create a creator account, connect social profiles, discover live campaigns, submit clips, and withdraw approved earnings."
              )}
            </p>
          </div>
          <Link href="/auth/signup?role=influencer" className="mt-8">
            <Button className="h-12 w-full rounded-2xl bg-[#571bc1] text-sm font-black text-white hover:bg-[#6d28d9]">
              {t("Join creator network")}
              <Sparkles size={16} />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 border-t border-white/10 px-5 py-10 text-xs text-[#c2c6d6] sm:px-6 md:flex-row">
        <span>&copy; {new Date().getFullYear()} {t("Aether. Performance creator marketing.")}</span>
        <div className="flex gap-6">
          <Link href="/privacy" className="hover:text-white">
            {t("Privacy")}
          </Link>
          <Link href="/auth/login" className="hover:text-white">
            {t("Sign in")}
          </Link>
          <Link href="/auth/signup?role=business" className="hover:text-white">
            {t("Start")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
