"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, ShieldCheck, Cpu, Zap } from "lucide-react";
import { useTranslation } from "@/lib/translations";

export default function Home() {
  const { t } = useTranslation();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
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

  return (
    <div className="flex-1 flex flex-col justify-center items-center overflow-x-hidden">
      {/* Background radial accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-r from-[#007AFF]/12 to-[#34C759]/8 rounded-full blur-[130px] pointer-events-none z-0" />
      <div className="absolute top-32 left-1/4 w-[350px] h-[350px] bg-[#FF9500]/5 rounded-full blur-[110px] pointer-events-none z-0" />

      {/* Hero Section */}
      <section className="relative z-10 w-full max-w-7xl px-6 pt-24 pb-20 md:pt-36 md:pb-28 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-secondary border border-border/30 rounded-full text-xs font-semibold text-muted-foreground mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-[#007AFF] animate-pulse" />
          {t("Introducing Aether platform v1.0")}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl sm:text-6xl font-bold tracking-tight max-w-3xl leading-[1.1] mb-8"
        >
          {t("Frictionless campaigns for")}{" "}
          <span className="bg-gradient-to-r from-[#007AFF] via-[#34C759] to-[#FF9500] bg-clip-text text-transparent">
            {t("microinfluencers & brands")}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-muted-foreground text-lg sm:text-xl max-w-2xl leading-relaxed mb-12"
        >
          {t("The premium Apple-designed marketing ecosystem. Close deals, track metrics, and manage secure escrows in seconds. No friction.")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 items-center justify-center"
        >
          <Link href="/auth">
            <Button className="rounded-full px-8 py-6 text-base font-semibold shadow-md bg-primary hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer gap-2">
              {t("Get Started")} <ArrowRight size={18} />
            </Button>
          </Link>
          <Link href="#features">
            <Button variant="outline" className="rounded-full px-8 py-6 text-base font-semibold hover:scale-[1.02] active:scale-[0.98] transition-transform cursor-pointer border-border/60 hover:bg-secondary/40">
              {t("Explore Features")}
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* Scannable Grid Modules (Apple-Style) */}
      <section id="features" className="w-full max-w-7xl px-6 py-20 md:py-28 border-t border-border/10 bg-secondary/5 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            {t("Built with iOS elegance. Tuned for business growth.")}
          </h2>
          <p className="text-muted-foreground">
            {t("Every component crafted to look like native macOS widgets, with premium layout aesthetics.")}
          </p>
        </div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {/* Card 1 */}
          <motion.div
            variants={itemVariants}
            whileHover={{ scale: 1.025, y: -6 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="p-8 h-80 flex flex-col justify-between relative overflow-hidden group apple-card cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#007AFF]/10 flex items-center justify-center text-[#007AFF] mb-6">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">{t("Secure Escrow Protection")}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t("Powered by Stripe Connect. Brands lock funds into escrow, and creators are paid instantly upon verifying deliverables.")}
              </p>
            </div>
          </motion.div>

          {/* Card 2 */}
          <motion.div
            variants={itemVariants}
            whileHover={{ scale: 1.025, y: -6 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="p-8 h-80 flex flex-col justify-between relative overflow-hidden group apple-card cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#34C759]/10 flex items-center justify-center text-[#34C759] mb-6">
              <Cpu size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">{t("Automated Media Kits")}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t("Connect TikTok, YouTube, or Instagram profiles. Metrics update automatically using a live synchronization engine.")}
              </p>
            </div>
          </motion.div>

          {/* Card 3 */}
          <motion.div
            variants={itemVariants}
            whileHover={{ scale: 1.025, y: -6 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="p-8 h-80 flex flex-col justify-between relative overflow-hidden group apple-card cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#FF9500]/10 flex items-center justify-center text-[#FF9500] mb-6">
              <Zap size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">{t("Direct Negotiation Pipelines")}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {t("No intermediate emails. Chat directly, suggest rates, attach drafts, and finalize agreements inside a beautiful card timeline.")}
              </p>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="w-full max-w-7xl px-6 py-12 border-t border-border/10 flex flex-col md:flex-row items-center justify-between text-muted-foreground text-xs gap-4 relative z-10">
        <div>&copy; {new Date().getFullYear()} Aether Inc. {t("Privacy Policy").includes("Informativa") ? "Tutti i diritti riservati." : "All rights reserved."}</div>
        <div className="flex gap-6">
          <Link href="#" className="hover:text-foreground">{t("Privacy Policy")}</Link>
          <Link href="#" className="hover:text-foreground">{t("Terms of Service")}</Link>
          <Link href="#" className="hover:text-foreground">{t("Contact")}</Link>
        </div>
      </footer>
    </div>
  );
}
