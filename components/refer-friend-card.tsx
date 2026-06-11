"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gift,
  Users,
  Copy,
  Check,
  Share2,
  Loader2,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { useTranslation } from "@/lib/translations";
import { formatMoney } from "@/lib/currency";
import {
  getReferralOverviewAction,
  claimReferralBonusAction,
  applyReferralCodeAction,
} from "@/lib/actions/referral";
import type { ReferralOverview, ReferralStatus } from "@/types/referral";

const appleSpring = { type: "spring" as const, stiffness: 300, damping: 30, mass: 0.8 };
const ACCENT = "#5856D6"; // purple — referrals
const money = (n: number) =>
  formatMoney(Number(n || 0), { maximumFractionDigits: 2 });

const STATUS_TONE: Record<ReferralStatus, BadgeTone> = {
  pending: "neutral",
  qualified: "warning",
  rewarded: "success",
};

export function ReferFriendCard() {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyCode, setApplyCode] = useState("");
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    const res = await getReferralOverviewAction();
    if (res.success && res.overview) setOverview(res.overview);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  const burst = () => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ["#007AFF", "#34C759", "#FF9500", "#5856D6"],
    });
  };

  const handleCopy = () => {
    if (!overview) return;
    navigator.clipboard.writeText(overview.link);
    setCopied(true);
    toast.success(t("Copied to clipboard!"), {
      description: t("Share your link — you both earn a bonus."),
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!overview) return;
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({
          title: t("Join me on Aether"),
          text: t("Earn from your clips on Aether — use my link:"),
          url: overview.link,
        });
        return;
      } catch {
        /* user dismissed the share sheet — no-op */
      }
    }
    handleCopy();
  };

  const handleClaim = async (referredId: string) => {
    setClaimingId(referredId);
    const res = await claimReferralBonusAction(referredId);
    setClaimingId(null);
    if (res.success) {
      burst();
      toast.success(t("Referral bonus claimed!"), {
        description: t("{amount} added to your wallet.").replace(
          "{amount}",
          money(res.reward ?? 0)
        ),
      });
      load();
    } else {
      toast.error(res.error || t("Could not claim the referral bonus."));
    }
  };

  const handleApply = async () => {
    if (!applyCode.trim()) {
      toast.error(t("Enter a referral code."));
      return;
    }
    setApplying(true);
    const res = await applyReferralCodeAction(applyCode.trim());
    setApplying(false);
    if (res.success) {
      toast.success(t("Referral code applied!"), {
        description: t("Post your first approved clip to unlock the bonus."),
      });
      setApplyCode("");
      setApplyOpen(false);
      load();
    } else {
      toast.error(res.error || t("Could not apply that referral code."));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={appleSpring}
      className="creator-glass relative flex flex-col overflow-hidden rounded-2xl p-5"
    >
      <div
        className="absolute top-0 right-0 w-[200px] h-[120px] blur-[60px] pointer-events-none"
        style={{ background: `linear-gradient(to left, ${ACCENT}1f, transparent)` }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between gap-4 mb-5">
        <div>
          <span
            className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
            style={{ color: ACCENT }}
          >
            <Gift size={12} /> {t("Refer a Friend")}
          </span>
          <h3 className="text-lg font-bold tracking-tight mt-1">
            {t("Invite creators, earn together")}
          </h3>
        </div>
        <span
          className="p-2.5 rounded-2xl shrink-0"
          style={{ backgroundColor: `${ACCENT}1a`, color: ACCENT }}
        >
          <Users size={18} />
        </span>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : !overview ? (
        <p className="text-sm text-muted-foreground py-6">
          {t("Referrals are unavailable right now.")}
        </p>
      ) : (
        <div className="relative z-10 flex flex-col flex-1">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="p-3 rounded-2xl bg-secondary/20 border border-border/10">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Referrals")}
              </p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">
                {overview.referral_count}
              </p>
            </div>
            <div className="p-3 rounded-2xl bg-secondary/20 border border-border/10">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("Total Earned")}
              </p>
              <p
                className="text-2xl font-bold tracking-tight mt-0.5"
                style={{ color: "#34C759" }}
              >
                {money(overview.total_earned)}
              </p>
            </div>
          </div>

          {/* Referral link + copy/share */}
          <div className="flex items-center gap-2 mb-4">
            <input
              readOnly
              value={overview.link}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t("Your referral link")}
              className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-secondary/30 border border-border/20 text-xs text-muted-foreground font-medium truncate outline-none focus:border-ring/50"
            />
            <Button
              size="icon"
              variant="outline"
              onClick={handleCopy}
              aria-label={t("Copy link")}
              className="shrink-0"
            >
              <AnimatePresence mode="wait" initial={false}>
                {copied ? (
                  <motion.span
                    key="check"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={appleSpring}
                  >
                    <Check size={16} className="text-[#34C759]" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="copy"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    transition={appleSpring}
                  >
                    <Copy size={16} />
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
            <Button
              onClick={handleShare}
              className="shrink-0 rounded-xl font-bold text-xs gap-1.5 text-white border-0"
              style={{ backgroundColor: ACCENT }}
            >
              <Share2 size={14} /> {t("Share")}
            </Button>
          </div>

          {/* Referred users */}
          {overview.referrals.length > 0 && (
            <div className="space-y-2 mb-2">
              {overview.referrals.slice(0, 4).map((r) => (
                <div
                  key={r.referred_id}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-secondary/20 border border-border/10"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{r.name}</p>
                    <StatusBadge tone={STATUS_TONE[r.status]} className="mt-1">
                      {r.status === "rewarded"
                        ? t("Rewarded")
                        : r.status === "qualified"
                          ? t("Ready to claim")
                          : t("Pending")}
                    </StatusBadge>
                  </div>
                  {r.claimable ? (
                    <Button
                      size="sm"
                      onClick={() => handleClaim(r.referred_id)}
                      disabled={claimingId === r.referred_id}
                      className="shrink-0 rounded-full font-bold text-xs gap-1.5 text-white border-0 bg-[#34C759] hover:bg-[#30b551]"
                    >
                      {claimingId === r.referred_id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      {t("Claim")}
                    </Button>
                  ) : r.status === "rewarded" ? (
                    <Check size={16} className="text-[#34C759] shrink-0" />
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* Apply a referral code */}
          <div className="mt-auto pt-3">
            {applyOpen ? (
              <div className="flex items-center gap-2">
                <input
                  value={applyCode}
                  onChange={(e) => setApplyCode(e.target.value)}
                  placeholder={t("Enter a referral code")}
                  maxLength={12}
                  className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-secondary/30 border border-border/20 text-xs font-semibold uppercase tracking-wide outline-none focus:border-ring/50"
                />
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={applying}
                  className="shrink-0 rounded-xl font-bold text-xs"
                >
                  {applying ? <Loader2 size={13} className="animate-spin" /> : t("Apply")}
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setApplyOpen(true)}
                className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("Have a referral code?")}
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default ReferFriendCard;
