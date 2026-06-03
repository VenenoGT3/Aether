"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Users,
  Eye,
  Wallet,
  Film,
  Megaphone,
  BarChart3,
} from "lucide-react";
import { useTranslation } from "@/lib/translations";

export default function Home() {
  const { t } = useTranslation();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 28 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 30,
        mass: 0.8,
      },
    },
  };

  const brandSteps = [
    {
      icon: Wallet,
      title: t("Fund a budget pool"),
      body: t("Set your total budget and a max CPM (cost per 1,000 views). Funds are held securely in Stripe escrow."),
    },
    {
      icon: Film,
      title: t("Creators post clips"),
      body: t("Your campaign opens to creators who join instantly and submit clips — no manual outreach or contracts."),
    },
    {
      icon: BarChart3,
      title: t("Pay per view, automatically"),
      body: t("Views are synced, verified, and priced against your CPM. You only ever pay for the views you receive."),
    },
  ];

  const creatorSteps = [
    {
      icon: Megaphone,
      title: t("Join open campaigns"),
      body: t("Browse live brand campaigns and join the ones you like — instantly, with no application backlog."),
    },
    {
      icon: Film,
      title: t("Post your clip"),
      body: t("Submit your TikTok, Reel, or Short. Set your own CPM up to the campaign max and start tracking views."),
    },
    {
      icon: Wallet,
      title: t("Get paid per view"),
      body: t("Earnings accrue automatically from real views and become available to withdraw to your account."),
    },
  ];

  const features = [
    {
      icon: Zap,
      color: "#007AFF",
      title: t("Pay for performance"),
      body: t("No flat fees or guesswork. Brands pay a transparent CPM for real views, with a hard budget cap that can never be exceeded."),
    },
    {
      icon: ShieldCheck,
      color: "#34C759",
      title: t("Protected, automated payouts"),
      body: t("Stripe Connect escrow, a view-verification holdback window, and advanced bot & fake-account detection keep every payout fair."),
    },
    {
      icon: Users,
      color: "#FF9500",
      title: t("An open creator marketplace"),
      body: t("Creators join in one click, submit clips, and watch earnings update live. Brands get reach without the recruiting overhead."),
    },
  ];

  return (
    <div className="flex-1 flex flex-col justify-center items-center overflow-x-hidden">
      {/* Background radial accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-r from-[#007AFF]/12 to-[#34C759]/8 rounded-full blur-[130px] pointer-events-none z-0" />
      <div className="absolute top-32 left-1/4 w-[350px] h-[350px] bg-[#FF9500]/5 rounded-full blur-[110px] pointer-events-none z-0" />

      {/* Hero Section */}
      <section className="relative z-10 w-full max-w-7xl px-6 pt-24 pb-20 md:pt-36 md:pb-24 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-secondary border border-border/30 rounded-full text-xs font-semibold text-muted-foreground mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-[#34C759] animate-pulse" />
          {t("Performance-based creator marketing")}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-6xl font-bold tracking-tight max-w-4xl leading-[1.1] mb-8"
        >
          {t("Pay only for the")}{" "}
          <span className="bg-gradient-to-r from-[#007AFF] via-[#34C759] to-[#FF9500] bg-clip-text text-transparent">
            {t("views your content earns")}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-muted-foreground text-lg sm:text-xl max-w-2xl leading-relaxed mb-12"
        >
          {t("Aether is the pay-per-view UGC & clipping platform. Brands fund a budget, creators post clips, and payouts are calculated automatically from real views — no fixed fees, no guesswork.")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 items-center justify-center"
        >
          <Link href="/auth/signup?role=business">
            <Button className="rounded-full px-8 py-6 text-base font-semibold shadow-md bg-primary hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer gap-2">
              <Megaphone size={18} /> {t("Start a campaign")}
            </Button>
          </Link>
          <Link href="/auth/signup?role=influencer">
            <Button variant="outline" className="rounded-full px-8 py-6 text-base font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-border/60 hover:bg-secondary/40 gap-2">
              <Film size={18} /> {t("Earn as a creator")}
            </Button>
          </Link>
        </motion.div>

        {/* Trust strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.45 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs font-semibold text-muted-foreground"
        >
          <span className="flex items-center gap-1.5"><Eye size={14} className="text-[#007AFF]" /> {t("Pay per 1,000 views")}</span>
          <span className="flex items-center gap-1.5"><Wallet size={14} className="text-[#34C759]" /> {t("Automated payouts")}</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#FF9500]" /> {t("Fraud-protected")}</span>
          <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#5856D6]" /> {t("Stripe-secured escrow")}</span>
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="w-full max-w-7xl px-6 py-20 md:py-28 border-t border-border/10 bg-secondary/5 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            {t("How Aether works")}
          </h2>
          <p className="text-muted-foreground">
            {t("One platform, two simple flows. Brands launch performance campaigns; creators earn from the views they drive.")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* For brands */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="apple-card p-8 flex flex-col"
          >
            <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#007AFF] mb-6">
              <Megaphone size={14} /> {t("For brands")}
            </span>
            <div className="space-y-6 flex-1">
              {brandSteps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={step.title} variants={itemVariants} className="flex gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] flex items-center justify-center shrink-0 relative">
                      <Icon size={18} />
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#007AFF] text-white text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold mb-1">{step.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <Link href="/auth/signup?role=business" className="mt-8">
              <Button className="w-full rounded-2xl py-5 font-semibold text-sm bg-primary hover:scale-[1.01] active:scale-[0.99] transition-transform cursor-pointer gap-2 h-auto">
                {t("Start a campaign")} <ArrowRight size={16} />
              </Button>
            </Link>
          </motion.div>

          {/* For creators */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            className="apple-card p-8 flex flex-col"
          >
            <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#34C759] mb-6">
              <Film size={14} /> {t("For creators")}
            </span>
            <div className="space-y-6 flex-1">
              {creatorSteps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div key={step.title} variants={itemVariants} className="flex gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-[#34C759]/10 text-[#34C759] flex items-center justify-center shrink-0 relative">
                      <Icon size={18} />
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#34C759] text-white text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold mb-1">{step.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.body}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
            <Link href="/auth/signup?role=influencer" className="mt-8">
              <Button variant="outline" className="w-full rounded-2xl py-5 font-semibold text-sm border-[#34C759]/30 text-[#34C759] hover:bg-[#34C759]/10 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer gap-2 h-auto">
                {t("Earn as a creator")} <ArrowRight size={16} />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Why Aether (feature cards) */}
      <section id="features" className="w-full max-w-7xl px-6 py-20 md:py-28 border-t border-border/10 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            {t("Built for fair, measurable growth")}
          </h2>
          <p className="text-muted-foreground">
            {t("Every dollar tied to a real view, every payout protected — wrapped in a premium, Apple-inspired experience.")}
          </p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {features.map((card) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.title}
                variants={itemVariants}
                whileHover={{ scale: 1.025, y: -6 }}
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
                className="p-8 h-72 flex flex-col justify-between relative overflow-hidden group apple-card"
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6"
                  style={{ backgroundColor: `${card.color}1a`, color: card.color }}
                >
                  <Icon size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">{card.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{card.body}</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        <p className="text-center text-xs text-muted-foreground/70 mt-10">
          {t("Prefer a fixed fee? Aether also supports classic escrow-based campaigns alongside the performance model.")}
        </p>
      </section>

      {/* Final CTA band */}
      <section className="w-full max-w-7xl px-6 pb-24 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="apple-card relative overflow-hidden p-10 md:p-14 text-center"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-gradient-to-r from-[#007AFF]/10 to-[#34C759]/10 blur-[90px] pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3 max-w-2xl">
              {t("Ready to turn views into results?")}
            </h2>
            <p className="text-muted-foreground max-w-xl mb-8">
              {t("Launch a performance campaign or start earning per view today. Setup takes minutes.")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
              <Link href="/auth/signup?role=business">
                <Button className="rounded-full px-8 py-6 text-base font-semibold shadow-md bg-primary hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer gap-2">
                  <Megaphone size={18} /> {t("Start a campaign")}
                </Button>
              </Link>
              <Link href="/auth/signup?role=influencer">
                <Button variant="outline" className="rounded-full px-8 py-6 text-base font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-border/60 hover:bg-secondary/40 gap-2">
                  <Film size={18} /> {t("Earn as a creator")}
                </Button>
              </Link>
            </div>
            <Link href="/auth/login" className="mt-6 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              {t("Already have an account? Sign in")}
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-7xl px-6 py-12 border-t border-border/10 flex flex-col md:flex-row items-center justify-between text-muted-foreground text-xs gap-4 relative z-10">
        <div>&copy; {new Date().getFullYear()} Aether Inc. {t("Privacy Policy").includes("Informativa") ? "Tutti i diritti riservati." : "All rights reserved."}</div>
        <div className="flex gap-6">
          <Link href="/privacy" className="hover:text-foreground">{t("Privacy Policy")}</Link>
          <Link href="#" className="hover:text-foreground">{t("Terms of Service")}</Link>
          <Link href="#" className="hover:text-foreground">{t("Contact")}</Link>
        </div>
      </footer>
    </div>
  );
}
