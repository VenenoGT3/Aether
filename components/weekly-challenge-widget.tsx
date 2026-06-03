"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Trophy, Target, Check, Loader2, Lock, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/translations";
import {
  getWeeklyChallengeAction,
  claimWeeklyChallengeRewardAction,
} from "@/lib/actions/challenges";
import type { WeeklyChallenge } from "@/types/referral";

const appleSpring = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };
const ACCENT = "#FF9500"; // orange — challenge
const money = (n: number) =>
  `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function WeeklyChallengeWidget() {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState<WeeklyChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await getWeeklyChallengeAction();
    if (res.success && res.challenge) setChallenge(res.challenge);
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
      colors: ["#FF9500", "#34C759", "#007AFF", "#5856D6"],
    });
  };

  const handleClaim = async (milestone: number) => {
    setClaiming(milestone);
    const res = await claimWeeklyChallengeRewardAction(milestone);
    setClaiming(null);
    if (res.success) {
      burst();
      toast.success(t("Challenge reward claimed!"), {
        description: t("{amount} added to your wallet.").replace(
          "{amount}",
          money(res.reward ?? 0)
        ),
      });
      load();
    } else {
      toast.error(res.error || t("Could not claim this reward."));
    }
  };

  const maxClips =
    challenge && challenge.milestones.length
      ? challenge.milestones[challenge.milestones.length - 1].clips
      : 0;
  const pct =
    maxClips > 0
      ? Math.min(100, Math.round((challenge!.clips_this_week / maxClips) * 100))
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={appleSpring}
      className="apple-card p-6 relative overflow-hidden h-full flex flex-col"
    >
      <div
        className="absolute top-0 right-0 w-[200px] h-[120px] blur-[60px] pointer-events-none"
        style={{ background: `linear-gradient(to left, ${ACCENT}24, transparent)` }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between gap-4 mb-5">
        <div>
          <span
            className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
            style={{ color: ACCENT }}
          >
            <Trophy size={12} /> {t("Weekly Challenge")}
          </span>
          <h3 className="text-lg font-bold tracking-tight mt-1">
            {t("Post clips, earn bonuses")}
          </h3>
        </div>
        <span
          className="p-2.5 rounded-2xl shrink-0"
          style={{ backgroundColor: `${ACCENT}1a`, color: ACCENT }}
        >
          <Target size={18} />
        </span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : !challenge ? (
        <p className="text-sm text-muted-foreground py-6">
          {t("The challenge is unavailable right now.")}
        </p>
      ) : (
        <div className="relative z-10 flex flex-col flex-1">
          {/* Progress */}
          <div className="mb-5">
            <div className="flex items-end justify-between mb-2">
              <div>
                <span className="text-3xl font-bold tracking-tight">
                  {challenge.clips_this_week}
                </span>
                <span className="text-sm font-semibold text-muted-foreground ml-1.5">
                  {t("clips this week")}
                </span>
              </div>
              {challenge.next_milestone !== null ? (
                <span className="text-xs font-semibold text-muted-foreground text-right">
                  {t("{n} to go").replace("{n}", String(challenge.clips_to_next))}
                </span>
              ) : (
                <span className="text-xs font-bold text-[#34C759] flex items-center gap-1">
                  <Sparkles size={13} /> {t("All milestones reached!")}
                </span>
              )}
            </div>
            <div className="w-full bg-secondary/60 h-2.5 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${ACCENT}, #34C759)`,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
          </div>

          {/* Milestones */}
          <div className="space-y-2">
            {challenge.milestones.map((m) => {
              const tone = m.claimed
                ? "done"
                : m.claimable
                  ? "ready"
                  : m.reached
                    ? "ready"
                    : "locked";
              return (
                <div
                  key={m.clips}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-secondary/20 border border-border/10"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="size-9 rounded-xl flex items-center justify-center shrink-0"
                      style={
                        tone === "done"
                          ? { backgroundColor: "#34C7591a", color: "#34C759" }
                          : tone === "ready"
                            ? { backgroundColor: `${ACCENT}1a`, color: ACCENT }
                            : { backgroundColor: "rgba(255,255,255,0.05)", color: "var(--muted-foreground)" }
                      }
                    >
                      {m.claimed ? (
                        <Check size={16} />
                      ) : m.reached ? (
                        <Trophy size={16} />
                      ) : (
                        <Lock size={15} />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold leading-tight">
                        {t("{n} clips").replace("{n}", String(m.clips))}
                      </p>
                      <p
                        className="text-xs font-semibold"
                        style={{ color: "#34C759" }}
                      >
                        {money(m.reward)}
                      </p>
                    </div>
                  </div>

                  {m.claimed ? (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-[#34C759] shrink-0">
                      {t("Claimed")}
                    </span>
                  ) : m.claimable ? (
                    <Button
                      size="sm"
                      onClick={() => handleClaim(m.clips)}
                      disabled={claiming === m.clips}
                      className="shrink-0 rounded-full font-bold text-xs gap-1.5 text-white border-0 bg-[#34C759] hover:bg-[#30b551]"
                    >
                      {claiming === m.clips ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      {t("Claim")}
                    </Button>
                  ) : (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shrink-0">
                      {t("{n} left").replace("{n}", String(Math.max(0, m.clips - challenge.clips_this_week)))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {challenge.total_claimable > 0 && (
            <div
              className="mt-4 rounded-2xl p-3 flex items-center justify-between gap-3"
              style={{ backgroundColor: `${ACCENT}14`, border: `1px solid ${ACCENT}33` }}
            >
              <span className="text-xs font-semibold">
                {t("You have {amount} ready to claim!").replace(
                  "{amount}",
                  money(challenge.total_claimable)
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default WeeklyChallengeWidget;
