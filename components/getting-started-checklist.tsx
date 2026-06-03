"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket,
  CheckCircle2,
  UserRound,
  Clapperboard,
  Gift,
  Wallet,
  Sparkles,
  Loader2,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/translations";
import {
  getOnboardingProgressAction,
  claimFirstClipBonusAction,
} from "@/lib/actions/onboarding";
import { startStripeOnboardingAction } from "@/lib/stripe/actions";
import type { OnboardingProgress } from "@/types/onboarding";

const appleSpring = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };
const ACCENT = "#34C759"; // green — creator accent
const money = (n: number) =>
  `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

type StepKey = "profile" | "clip" | "invite" | "payouts";

export function GettingStartedChecklist() {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<StepKey | null>(null);

  const load = useCallback(async () => {
    const res = await getOnboardingProgressAction();
    if (res.success && res.progress) setProgress(res.progress);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  const burst = () => {
    confetti({
      particleCount: 140,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#34C759", "#007AFF", "#FF9500", "#5856D6"],
    });
  };

  const handleClaimBonus = async () => {
    setBusy("clip");
    const res = await claimFirstClipBonusAction();
    setBusy(null);
    if (res.success) {
      burst();
      toast.success(t("First clip bonus claimed!"), {
        description: t("{amount} added to your wallet.").replace(
          "{amount}",
          money(res.reward ?? 0)
        ),
      });
      load();
    } else {
      toast.error(res.error || t("Could not claim the bonus."));
    }
  };

  const handlePayouts = async () => {
    setBusy("payouts");
    try {
      const res = await startStripeOnboardingAction("influencer", window.location.origin);
      if (res.success && res.url) {
        window.location.href = res.url;
        return;
      }
      toast.error(res.error || t("Couldn't start payout setup."));
    } catch {
      toast.error(t("Couldn't start payout setup."));
    }
    setBusy(null);
  };

  const handleInvite = () => {
    const el = document.getElementById("refer-a-friend");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Hidden once fully activated (and no bonus left to claim), or before data loads.
  if (loading || !progress || progress.allComplete) return null;

  const { firstClipBonus } = progress;
  const pct = Math.round((progress.completedCount / progress.totalCount) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={appleSpring}
      className="apple-card p-6 relative overflow-hidden mb-8"
    >
      <div
        className="absolute top-0 right-0 w-[260px] h-[140px] blur-[70px] pointer-events-none"
        style={{ background: `linear-gradient(to left, ${ACCENT}1f, transparent)` }}
      />

      {/* Header + progress */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div>
          <span
            className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
            style={{ color: ACCENT }}
          >
            <Rocket size={12} /> {t("Getting Started")}
          </span>
          <h3 className="text-lg font-bold tracking-tight mt-1">
            {t("Your first wins on Aether")}
          </h3>
        </div>
        <div className="sm:text-right">
          <p className="text-sm font-bold">
            {t("{done} of {total} complete")
              .replace("{done}", String(progress.completedCount))
              .replace("{total}", String(progress.totalCount))}
          </p>
          <div className="w-full sm:w-44 bg-secondary/60 h-2 rounded-full overflow-hidden mt-1.5">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${ACCENT}, #007AFF)` }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="relative z-10 space-y-2.5">
        {/* 1. Profile */}
        <StepRow
          icon={UserRound}
          done={progress.profileComplete}
          title={t("Complete your profile")}
          description={t("Tell brands who you are and what you create.")}
        >
          {!progress.profileComplete && (
            <Link
              href="/creator/onboarding"
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "shrink-0 rounded-full text-xs font-bold"
              )}
            >
              {t("Set up")} <ArrowRight size={13} />
            </Link>
          )}
        </StepRow>

        {/* 2. First clip (+ bonus) */}
        <StepRow
          icon={firstClipBonus.claimable ? Gift : Clapperboard}
          done={progress.firstClipApproved && firstClipBonus.claimed}
          highlight={firstClipBonus.claimable}
          title={t("Post your first clip")}
          description={t("Earn a {amount} welcome bonus on your first approved clip.").replace(
            "{amount}",
            money(firstClipBonus.amount)
          )}
        >
          {firstClipBonus.claimable ? (
            <Button
              size="sm"
              onClick={handleClaimBonus}
              disabled={busy === "clip"}
              className="shrink-0 rounded-full font-bold text-xs gap-1.5 text-white border-0 bg-[#34C759] hover:bg-[#30b551]"
            >
              {busy === "clip" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Sparkles size={13} />
              )}
              {t("Claim {amount}").replace("{amount}", money(firstClipBonus.amount))}
            </Button>
          ) : firstClipBonus.claimed ? (
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#34C759] shrink-0">
              {t("+{amount} earned").replace("{amount}", money(firstClipBonus.amount))}
            </span>
          ) : progress.firstClipPosted ? (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#FF9500] shrink-0">
              {t("Awaiting approval")}
            </span>
          ) : (
            <Link
              href="/creator/clips"
              className={cn(
                buttonVariants({ size: "sm" }),
                "shrink-0 rounded-full text-xs font-bold gap-1.5"
              )}
            >
              {t("Post a clip")} <ArrowRight size={13} />
            </Link>
          )}
        </StepRow>

        {/* 3. Invite a friend */}
        <StepRow
          icon={Gift}
          done={progress.invitedFriend}
          title={t("Invite a friend")}
          description={t("Share your link — you both earn a bonus.")}
        >
          {!progress.invitedFriend && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleInvite}
              className="shrink-0 rounded-full text-xs font-bold"
            >
              {t("Invite")} <ArrowRight size={13} />
            </Button>
          )}
        </StepRow>

        {/* 4. Payouts */}
        <StepRow
          icon={Wallet}
          done={progress.payoutsConnected}
          title={t("Set up payouts")}
          description={t("Connect Stripe so you can cash out your earnings.")}
        >
          {!progress.payoutsConnected && (
            <Button
              size="sm"
              variant="outline"
              onClick={handlePayouts}
              disabled={busy === "payouts"}
              className="shrink-0 rounded-full text-xs font-bold"
            >
              {busy === "payouts" ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <>
                  {t("Connect")} <ArrowRight size={13} />
                </>
              )}
            </Button>
          )}
        </StepRow>
      </div>
    </motion.div>
  );
}

function StepRow({
  icon: Icon,
  done,
  highlight,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  done: boolean;
  highlight?: boolean;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 p-3 rounded-2xl border transition-colors"
      style={
        highlight
          ? { backgroundColor: `${ACCENT}14`, borderColor: `${ACCENT}40` }
          : { backgroundColor: "rgba(255,255,255,0.02)", borderColor: "var(--border)" }
      }
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="size-9 rounded-xl flex items-center justify-center shrink-0"
          style={
            done
              ? { backgroundColor: `${ACCENT}1a`, color: ACCENT }
              : { backgroundColor: "rgba(255,255,255,0.05)", color: "var(--muted-foreground)" }
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.span
                key="done"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={appleSpring}
              >
                <CheckCircle2 size={18} />
              </motion.span>
            ) : (
              <motion.span key="todo" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <Icon size={17} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <div className="min-w-0">
          <p
            className={`text-sm font-bold leading-tight ${done ? "text-muted-foreground line-through decoration-1" : ""}`}
          >
            {title}
          </p>
          {!done && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          )}
        </div>
      </div>
      {done ? (
        <CheckCircle2 size={16} className="text-[#34C759] shrink-0" />
      ) : (
        children
      )}
    </div>
  );
}

export default GettingStartedChecklist;
