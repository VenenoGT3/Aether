"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wallet,
  Clock,
  DollarSign,
  Eye,
  ArrowRight,
  CheckCircle2,
  Film,
  Info,
} from "lucide-react";
import { useTranslation } from "@/lib/translations";
import {
  useCreatorClips,
  useCreatorEarnings,
  type ClipStatus,
} from "@/lib/supabase/clips";

const STATUS_STYLE: Record<ClipStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20" },
  approved: { label: "Approved", cls: "bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/20" },
  tracking: { label: "Tracking", cls: "bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20" },
  rejected: { label: "Rejected", cls: "bg-muted text-muted-foreground border-border/30" },
  disqualified: { label: "Disqualified", cls: "bg-destructive/10 text-destructive border-destructive/20" },
};

/**
 * Performance earnings + clips overview for the creator dashboard. Self-contained
 * (uses the shared clips/earnings hooks) and renders a slim CTA when the creator
 * has no clips yet, so it stays clean during the fixed→performance transition.
 */
export function CreatorPerformanceSummary() {
  const { t } = useTranslation();
  const { breakdown, payouts } = useCreatorEarnings();
  const { clips } = useCreatorClips();

  const totalAllTime = breakdown.paid + breakdown.readyForPayout + breakdown.inHoldback;
  const activeClips = clips.filter((c) => c.status === "tracking" || c.status === "pending");
  const hasActivity = totalAllTime > 0 || clips.length > 0;

  if (!hasActivity) {
    return (
      <div className="mb-12 relative z-10">
        <Link
          href="/creator/clips"
          className="flex items-center justify-between gap-4 p-5 rounded-3xl bg-[#34C759]/5 border border-[#34C759]/20 hover:bg-[#34C759]/10 transition-colors group"
        >
          <div className="flex items-start gap-3">
            <span className="p-2 rounded-2xl bg-[#34C759]/10 text-[#34C759] shrink-0">
              <Film size={16} />
            </span>
            <div>
              <h4 className="text-xs font-bold text-foreground">{t("Earn per view with clipping campaigns")}</h4>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-normal">
                {t("Join open campaigns, submit clips, and get paid for the views you generate.")}
              </p>
            </div>
          </div>
          <ArrowRight size={16} className="text-[#34C759] shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    );
  }

  const cards = [
    {
      label: t("Total earnings"),
      value: `$${totalAllTime.toLocaleString()}`,
      sub: t("All time"),
      hint: t("Everything you've earned across all clips (paid + pending)."),
      icon: DollarSign,
      color: "#34C759",
    },
    {
      label: t("Ready for payout"),
      value: `$${breakdown.readyForPayout.toLocaleString()}`,
      sub: t("Cleared holdback"),
      hint: t("Cleared the holdback window — included in your next automatic payout."),
      icon: Wallet,
      color: "#007AFF",
    },
    {
      label: t("In holdback"),
      value: `$${breakdown.inHoldback.toLocaleString()}`,
      sub: t("Settling"),
      hint: t("Recently earned; held briefly to verify views before it becomes payable."),
      icon: Clock,
      color: "#FF9500",
    },
    {
      label: t("Paid out"),
      value: `$${breakdown.paid.toLocaleString()}`,
      sub: t("Lifetime"),
      hint: t("Already transferred to your connected Stripe account."),
      icon: CheckCircle2,
      color: "#5856D6",
    },
  ];

  return (
    <div className="mb-12 relative z-10">
      <div className="flex items-center justify-between mb-5">
        <div>
          <span className="text-[10px] font-bold text-[#34C759] uppercase tracking-wider flex items-center gap-1.5">
            <Film size={12} /> {t("Performance Clipping")}
          </span>
          <h2 className="text-lg font-bold tracking-tight mt-1">{t("Clips & Earnings")}</h2>
        </div>
        <Link
          href="/creator/clips"
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 shrink-0"
        >
          {t("Open Clips & Earnings")} <ArrowRight size={13} />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} title={c.hint} className="p-5 apple-card cursor-default">
              <div className="flex justify-between items-start text-muted-foreground">
                <span className="text-[10px] font-bold uppercase tracking-wider">{c.label}</span>
                <span className="p-1.5 rounded-xl" style={{ backgroundColor: `${c.color}1a`, color: c.color }}>
                  <Icon size={14} />
                </span>
              </div>
              <h3 className="text-xl font-bold tracking-tight mt-3">{c.value}</h3>
              <span className="text-[10px] text-muted-foreground">{c.sub}</span>
            </div>
          );
        })}
      </div>

      {/* How automatic payouts work */}
      <div className="flex items-start gap-2 mb-6 px-1 text-[11px] text-muted-foreground leading-relaxed">
        <Info size={13} className="shrink-0 mt-0.5 text-primary" />
        <span>
          {t(
            "Earnings clear the holdback window automatically, then become available to withdraw from your Creator Wallet to your connected Stripe account."
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active clips */}
        <div className="lg:col-span-2 p-6 apple-card">
          <h3 className="text-sm font-bold mb-4">
            {t("Active clips")}{" "}
            <span className="text-muted-foreground font-normal">({activeClips.length})</span>
          </h3>
          {activeClips.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("No active clips. Submit one from Clips & Earnings.")}</p>
          ) : (
            <div className="space-y-3">
              {activeClips.slice(0, 4).map((clip) => {
                const style = STATUS_STYLE[clip.status];
                return (
                  <motion.div
                    key={clip.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-secondary/20 border border-border/10"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${style.cls}`}>
                          {t(style.label)}
                        </span>
                        <span className="text-[10px] text-muted-foreground capitalize">{clip.platform}</span>
                      </div>
                      <p className="text-xs font-semibold truncate mt-1">{clip.campaignTitle}</p>
                    </div>
                    <div className="flex gap-5 shrink-0 text-right">
                      <div>
                        <span className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase justify-end"><Eye size={10} /> {t("Views")}</span>
                        <p className="text-xs font-bold mt-0.5">{clip.current_views.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase justify-end"><DollarSign size={10} /> {t("Est.")}</span>
                        <p className="text-xs font-bold mt-0.5 text-[#34C759]">${clip.estimated_earnings.toLocaleString()}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent payouts */}
        <div className="p-6 apple-card">
          <h3 className="text-sm font-bold mb-4">{t("Recent payouts")}</h3>
          {payouts.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("No payouts yet.")}</p>
          ) : (
            <div className="space-y-3">
              {payouts.slice(0, 4).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle2 size={12} className="text-[#34C759]" />
                    {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="font-bold">${Number(p.amount).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Link
        href="/creator/clips"
        className="mt-6 flex items-center justify-center gap-1.5 w-full p-4 rounded-2xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/15 transition-colors group"
      >
        {t("Open Clips & Earnings")}
        <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}
