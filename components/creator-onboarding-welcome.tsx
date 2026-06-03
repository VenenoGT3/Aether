"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Gift,
  Clapperboard,
  Wallet,
  ArrowRight,
  Loader2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "@/lib/translations";
import { applyReferralCodeAction } from "@/lib/actions/referral";

const appleSpring = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };

const QUICK_WINS: { icon: LucideIcon; color: string; title: string; desc: string }[] = [
  {
    icon: Clapperboard,
    color: "#007AFF",
    title: "Post your first clip",
    desc: "Get a $10 welcome bonus on your first approved clip.",
  },
  {
    icon: Gift,
    color: "#5856D6",
    title: "Invite friends",
    desc: "Share your link — you both earn when they create.",
  },
  {
    icon: Wallet,
    color: "#34C759",
    title: "Get paid for views",
    desc: "Earn automatically as your clips rack up views.",
  },
];

/** Welcoming intro shown before the onboarding wizard: sets the tone, teases the
 *  rewards, and captures a referral code early (prefilled from a ?ref link). */
export function CreatorOnboardingWelcome({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read-once-on-mount
    if (ref) setCode(ref.toUpperCase());
  }, []);

  const handleStart = async () => {
    setStarting(true);
    if (code.trim()) {
      const res = await applyReferralCodeAction(code.trim());
      if (res.success) {
        toast.success(t("Referral code applied!"), {
          description: t("Post your first approved clip to unlock the bonus."),
        });
      } else {
        // Non-blocking: a bad code must never trap the user in onboarding.
        toast.error(res.error || t("Could not apply that referral code."));
      }
    }
    onStart();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-secondary/10 min-h-[calc(100vh-4rem)] relative">
      <div className="absolute inset-0 bg-gradient-to-tr from-[#007AFF]/5 via-transparent to-[#34C759]/5 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={appleSpring}
        className="w-full max-w-lg relative z-10 p-8 rounded-3xl bg-card border border-border/30 shadow-md glass-panel"
      >
        <div className="flex flex-col items-center text-center mb-7">
          <span className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#007AFF] to-[#34C759] shadow-sm flex items-center justify-center mb-4">
            <Sparkles size={22} className="text-white" />
          </span>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("Welcome to Aether")}
          </h1>
          <p className="text-muted-foreground text-sm mt-2 max-w-sm">
            {t("Turn your clips into income — here's how you'll start earning in minutes.")}
          </p>
        </div>

        <div className="space-y-3 mb-7">
          {QUICK_WINS.map((q, i) => (
            <motion.div
              key={q.title}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...appleSpring, delay: 0.05 * (i + 1) }}
              className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-secondary/20 border border-border/10"
            >
              <span
                className="size-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${q.color}1a`, color: q.color }}
              >
                <q.icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight">{t(q.title)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t(q.desc)}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Referral code — prefilled from a ?ref share link, optional */}
        <div className="mb-6">
          <label className="text-[11px] font-bold text-muted-foreground/85 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <Users size={12} /> {t("Have a referral code?")}
          </label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("Enter a referral code")}
            maxLength={12}
            className="w-full px-4 py-3 rounded-2xl bg-secondary/40 border border-border/20 text-sm font-semibold uppercase tracking-wide focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-colors"
          />
        </div>

        <Button
          onClick={handleStart}
          disabled={starting}
          className="w-full rounded-2xl py-6 font-semibold text-sm gap-2"
        >
          {starting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              {t("Let's get started")} <ArrowRight size={16} />
            </>
          )}
        </Button>
      </motion.div>
    </div>
  );
}

export default CreatorOnboardingWelcome;
