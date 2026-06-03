"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Compass, ArrowLeft, Home } from "lucide-react";
import { useTranslation } from "@/lib/translations";

const appleSpring = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-4rem)] p-6 bg-secondary/10 relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#007AFF]/5 via-transparent to-[#5856D6]/5 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={appleSpring}
        className="w-full max-w-md relative z-10 apple-card p-8 text-center"
      >
        <span className="inline-flex w-14 h-14 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] items-center justify-center mb-5">
          <Compass size={26} />
        </span>
        <p className="text-5xl font-bold tracking-tight mb-2">404</p>
        <h1 className="text-lg font-bold tracking-tight mb-2">{t("Page not found")}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-7">
          {t("We couldn't find the page you're looking for. It may have moved or no longer exists.")}
        </p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl px-5 h-10.5 text-sm font-semibold bg-primary text-primary-foreground hover:opacity-95 transition-opacity"
          >
            <Home size={15} /> {t("Back to home")}
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl px-5 h-10.5 text-sm font-semibold border border-border bg-background hover:bg-secondary/60 transition-colors"
          >
            {t("Go to dashboard")} <ArrowLeft size={15} className="rotate-180" />
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
