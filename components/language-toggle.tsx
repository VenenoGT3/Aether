"use client";

import { useTranslation, Locale } from "@/lib/translations";
import { motion } from "framer-motion";

export function LanguageToggle() {
  const { locale, setLocale } = useTranslation();

  const handleToggle = (lang: Locale) => {
    setLocale(lang);
  };

  return (
    <div className="bg-secondary/40 p-[2.5px] rounded-full flex items-center border border-border/10 text-[10px] font-bold select-none relative h-7">
      <button
        onClick={() => handleToggle("en")}
        className={`px-2 h-full flex items-center justify-center rounded-full transition-all cursor-pointer relative z-10 ${
          locale === "en"
            ? "text-foreground font-extrabold"
            : "text-muted-foreground/80 hover:text-foreground"
        }`}
      >
        EN
        {locale === "en" && (
          <motion.div
            layoutId="activeLangTab"
            className="absolute inset-0 bg-background rounded-full shadow-sm z-0 border border-border/5"
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
          />
        )}
      </button>
      <button
        onClick={() => handleToggle("it")}
        className={`px-2 h-full flex items-center justify-center rounded-full transition-all cursor-pointer relative z-10 ${
          locale === "it"
            ? "text-foreground font-extrabold"
            : "text-muted-foreground/80 hover:text-foreground"
        }`}
      >
        IT
        {locale === "it" && (
          <motion.div
            layoutId="activeLangTab"
            className="absolute inset-0 bg-background rounded-full shadow-sm z-0 border border-border/5"
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
          />
        )}
      </button>
    </div>
  );
}
