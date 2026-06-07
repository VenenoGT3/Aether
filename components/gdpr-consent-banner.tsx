"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/translations";
import { getCookieConsent, setCookieConsent, CONSENT_CHANGE_EVENT } from "@/lib/consent";

const appleSpring = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };

/**
 * GDPR cookie-consent banner. Shows once per user (until they decide), persists
 * the choice via lib/consent, and re-appears if consent is withdrawn from the
 * privacy settings page. Mounted globally in the root layout.
 */
export function GdprConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read stored consent on mount
    setVisible(getCookieConsent() === null);
    const sync = () => setVisible(getCookieConsent() === null);
    window.addEventListener(CONSENT_CHANGE_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, sync);
  }, []);

  const decide = (analytics: boolean) => {
    setCookieConsent(analytics);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={appleSpring}
          role="dialog"
          aria-label={t("Cookie consent")}
          aria-live="polite"
          className="fixed inset-x-4 bottom-4 z-[60] md:inset-x-auto md:left-6 md:bottom-6 md:max-w-md"
        >
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0c1324]/[0.92] p-4 text-[#dce1fb] shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-5">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#adc6ff]/55 to-transparent" />
            <div className="mb-4 flex items-start gap-3">
              <span className="shrink-0 rounded-2xl border border-[#adc6ff]/20 bg-[#adc6ff]/10 p-2 text-[#adc6ff]">
                <Cookie size={18} />
              </span>
              <div>
                <h3 className="font-sans text-sm font-black tracking-tight text-white">
                  {t("We value your privacy")}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#c2c6d6]">
                  {t(
                    "We use essential cookies to run Aether and optional analytics to improve it. You're in control."
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => decide(true)}
                className="h-10 flex-1 rounded-2xl border-0 bg-gradient-to-r from-[#adc6ff] to-[#54a2ff] text-xs font-black text-[#07101f] hover:scale-[1.02] active:scale-[0.98]"
              >
                {t("Accept all")}
              </Button>
              <Button
                onClick={() => decide(false)}
                variant="outline"
                className="h-10 flex-1 rounded-2xl border-white/10 bg-slate-950/70 text-xs font-bold text-white hover:bg-white/[0.06]"
              >
                {t("Essential only")}
              </Button>
            </div>

            <Link
              href="/privacy"
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#c2c6d6] transition-colors hover:text-white"
            >
              <ShieldCheck size={12} /> {t("Privacy & cookie settings")}
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default GdprConsentBanner;
