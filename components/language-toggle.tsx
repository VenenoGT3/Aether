"use client";

import { useTranslation, Locale } from "@/lib/translations";
import { motion } from "framer-motion";

export function LanguageToggle() {
  const { locale, setLocale } = useTranslation();

  const handleToggle = (lang: Locale) => {
    setLocale(lang);
  };

  return (
    <div className="relative flex h-8 select-none items-center rounded-full border border-white/10 bg-slate-950/70 p-1 text-[10px] font-bold shadow-[0_8px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl">
      <button
        onClick={() => handleToggle("en")}
        className={`relative z-10 flex h-full cursor-pointer items-center justify-center rounded-full px-2.5 transition-all ${
          locale === "en"
            ? "font-extrabold text-[#07101f]"
            : "text-[#c2c6d6] hover:text-white"
        }`}
      >
        <span className="relative z-10">EN</span>
        {locale === "en" && (
          <motion.div
            layoutId="activeLangTab"
            className="absolute inset-0 z-0 rounded-full border border-white/10 bg-[#adc6ff] shadow-sm"
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
          />
        )}
      </button>
      <button
        onClick={() => handleToggle("it")}
        className={`relative z-10 flex h-full cursor-pointer items-center justify-center rounded-full px-2.5 transition-all ${
          locale === "it"
            ? "font-extrabold text-[#07101f]"
            : "text-[#c2c6d6] hover:text-white"
        }`}
      >
        <span className="relative z-10">IT</span>
        {locale === "it" && (
          <motion.div
            layoutId="activeLangTab"
            className="absolute inset-0 z-0 rounded-full border border-white/10 bg-[#adc6ff] shadow-sm"
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
          />
        )}
      </button>
    </div>
  );
}
