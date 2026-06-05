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
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { PromoCard } from "@/components/ui/empty-state";

const STATUS_STYLE: Record<ClipStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "info" },
  tracking: { label: "Tracking", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
  disqualified: { label: "Disqualified", tone: "danger" },
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
        <PromoCard
          icon={Film}
          href="/creator/clips"
          title={t("Earn per view with clipping campaigns")}
          description={t("Join open campaigns, submit clips, and get paid for the views you generate.")}
        />
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
      hint: t("Cleared the holdback window — available to withdraw from your Creator Wallet."),
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
      <SectionHeader
        eyebrow={t("Performance Clipping")}
        eyebrowIcon={Film}
        title={t("Clips & Earnings")}
        action={{ label: t("Open Clips & Earnings"), href: "/creator/clips" }}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <StatCard
            key={c.label}
            label={c.label}
            value={c.value}
            icon={c.icon}
            color={c.color}
            sub={c.sub}
            hint={c.hint}
          />
        ))}
      </div>

      {/* How withdrawals work */}
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
                        <StatusBadge tone={style.tone}>{t(style.label)}</StatusBadge>
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
