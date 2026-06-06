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
          className="fixed inset-x-4 bottom-4 md:inset-x-auto md:left-6 md:bottom-6 z-[60] md:max-w-md"
        >
          <div className="apple-card p-4 sm:p-5 shadow-2xl">
            <div className="flex items-start gap-3 mb-3 sm:mb-4">
              <span className="p-2 rounded-2xl bg-[#007AFF]/10 text-[#007AFF] shrink-0">
                <Cookie size={18} />
              </span>
              <div>
                <h3 className="text-sm font-bold tracking-tight">{t("We value your privacy")}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  {t(
                    "We use essential cookies to run Aether and optional analytics to improve it. You're in control."
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => decide(true)}
                className="flex-1 rounded-xl font-bold text-xs text-white border-0 bg-[#007AFF] hover:opacity-95"
              >
                {t("Accept all")}
              </Button>
              <Button
                onClick={() => decide(false)}
                variant="outline"
                className="flex-1 rounded-xl font-bold text-xs"
              >
                {t("Essential only")}
              </Button>
            </div>

            <Link
              href="/privacy"
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
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
