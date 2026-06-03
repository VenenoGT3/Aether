"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, Layers, Zap, ArrowRight, Megaphone, Clock } from "lucide-react";
import { isMockMode, supabase } from "@/lib/supabase/client";
import { getCampaignsAction } from "@/lib/supabase/campaigns";
import { useTranslation } from "@/lib/translations";
import { campaignCategoryLabel } from "@/lib/campaign-category";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PromoCard } from "@/components/ui/empty-state";

interface PerfCampaign {
  id: string;
  title: string;
  status: string;
  budget_pool?: number | null;
  available_pool?: number | null;
  budget_reserved?: number | null;
  budget_paid?: number | null;
  campaign_category?: "ugc" | "clipping" | null;
}

interface BrandClipLite {
  campaign_id: string;
  status: string;
  current_views: number;
  creator_id?: string;
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * Performance-campaigns-at-a-glance for the brand dashboard. Self-contained:
 * loads performance campaigns + clips (mock localStorage / real Supabase) and
 * renders nothing intrusive when the brand has no performance campaigns yet.
 */
export function BrandPerformanceSummary() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<PerfCampaign[]>([]);
  const [clips, setClips] = useState<BrandClipLite[]>([]);

  const load = useCallback(async () => {
    if (isMockMode) {
      const res = await getCampaignsAction();
      setCampaigns(
        ((res.campaigns || []) as (PerfCampaign & { campaign_type?: string })[]).filter(
          (c) => c.campaign_type === "performance"
        )
      );
      if (typeof window !== "undefined") {
        const raw = localStorage.getItem("aether-mock-clips");
        setClips(raw ? (JSON.parse(raw) as BrandClipLite[]) : []);
      }
      return;
    }
    const [{ data: camps }, { data: clipRows }] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id, title, status, budget_pool, available_pool, budget_reserved, budget_paid, campaign_category")
        .eq("campaign_type", "performance"),
      supabase.from("clips").select("campaign_id, status, current_views, creator_id"),
    ]);
    setCampaigns((camps ?? []) as PerfCampaign[]);
    setClips((clipRows ?? []) as BrandClipLite[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
    if (typeof window === "undefined") return;
    const handler = () => load();
    window.addEventListener("aether-clips-update", handler);
    window.addEventListener("campaigns-update", handler);
    return () => {
      window.removeEventListener("aether-clips-update", handler);
      window.removeEventListener("campaigns-update", handler);
    };
  }, [load]);

  // No performance campaigns yet → slim, non-intrusive prompt (transition-friendly).
  if (campaigns.length === 0) {
    return (
      <div className="mb-10 relative z-10">
        <PromoCard
          icon={Zap}
          href="/business/campaigns/new"
          title={t("New: pay-per-view clipping campaigns")}
          description={t("Fund a budget pool and let creators earn per view. Launch your first performance campaign.")}
        />
      </div>
    );
  }

  const trackingClips = clips.filter((c) => c.status === "tracking");
  const pendingClips = clips.filter((c) => c.status === "pending");
  const totalViews = trackingClips.reduce((s, c) => s + Number(c.current_views || 0), 0);
  // Creators earn from the AVAILABLE pool (post platform fee); fall back to the
  // full budget_pool for legacy campaigns without it.
  const totalPool = campaigns.reduce(
    (s, c) => s + Number(c.available_pool ?? c.budget_pool ?? 0),
    0
  );
  const totalFunded = campaigns.reduce((s, c) => s + Number(c.budget_pool || 0), 0);
  const totalFee = Math.max(Math.round((totalFunded - totalPool) * 100) / 100, 0);
  const totalReserved = campaigns.reduce((s, c) => s + Number(c.budget_reserved || 0), 0);
  const totalPaid = campaigns.reduce((s, c) => s + Number(c.budget_paid || 0), 0);
  const totalRemaining = Math.max(totalPool - totalReserved - totalPaid, 0);
  const poolPct = (v: number) => (totalPool > 0 ? Math.min((v / totalPool) * 100, 100) : 0);
  const usedPct = totalPool > 0 ? ((totalReserved + totalPaid) / totalPool) * 100 : 0;
  const anyExhausted = campaigns.some((c) => c.status === "exhausted");
  const activeCount = campaigns.filter(
    (c) => c.status === "open" || c.status === "in_progress"
  ).length;
  // Distinct creators with a tracking clip (creator_id only present in real mode).
  const activeCreators = new Set(
    trackingClips.map((c) => c.creator_id).filter(Boolean)
  ).size;

  const viewsByCampaign = (id: string) =>
    trackingClips
      .filter((c) => c.campaign_id === id)
      .reduce((s, c) => s + Number(c.current_views || 0), 0);

  const cards = [
    { label: t("Active campaigns"), value: activeCount.toLocaleString(), icon: Megaphone, color: "#007AFF" },
    { label: t("Total views"), value: totalViews.toLocaleString(), icon: Eye, color: "#FF9500" },
    {
      label: t("Active clips"),
      value: trackingClips.length.toLocaleString(),
      sub: activeCreators > 0 ? `${activeCreators} ${t("creators")}` : undefined,
      icon: Layers,
      color: "#5856D6",
    },
    { label: t("Pending review"), value: pendingClips.length.toLocaleString(), icon: Clock, color: "#FF9500" },
  ] as { label: string; value: string; sub?: string; icon: typeof Eye; color: string }[];

  return (
    <div className="mb-12 relative z-10">
      <SectionHeader
        eyebrow={t("Performance Campaigns")}
        eyebrowIcon={Zap}
        title={t("Pay-per-view at a glance")}
        action={{ label: t("Moderation"), href: "/business/moderation" }}
      />

      {/* Threshold warning / closed notice */}
      {anyExhausted ? (
        <div className="mb-4 p-4 rounded-2xl bg-destructive/5 border border-destructive/20 flex items-center gap-3">
          <span className="p-2 rounded-xl bg-destructive/10 text-destructive shrink-0">
            <Clock size={15} />
          </span>
          <p className="text-[11px] text-foreground leading-normal">
            <span className="font-bold">{t("A campaign hit 100% of its budget and was closed.")}</span>{" "}
            {t("Top up the pool with a new campaign to keep collecting clips.")}
          </p>
        </div>
      ) : usedPct >= 90 ? (
        <div className="mb-4 p-4 rounded-2xl bg-[#FF9500]/5 border border-[#FF9500]/25 flex items-center gap-3">
          <span className="p-2 rounded-xl bg-[#FF9500]/10 text-[#FF9500] shrink-0">
            <Clock size={15} />
          </span>
          <p className="text-[11px] text-foreground leading-normal">
            <span className="font-bold">{t("You've used 90%+ of your pooled budget.")}</span>{" "}
            {t("New clip submissions are paused near the limit, and campaigns close automatically at 100%.")}
          </p>
        </div>
      ) : null}

      {/* Headline budget burn-down across all performance campaigns */}
      <div className="p-5 apple-card mb-4">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
            {t("Budget burn-down")}
          </span>
          <span className="text-xs font-semibold text-foreground">
            {money(totalRemaining)} {t("remaining")}{" "}
            <span className="text-muted-foreground font-medium">/ {money(totalPool)} {t("pool")} · {Math.round(usedPct)}%</span>
          </span>
        </div>
        <div className="relative">
          <div className="h-3 rounded-full bg-secondary/40 overflow-hidden flex">
            <motion.div
              className="h-full bg-[#007AFF]"
              initial={{ width: 0 }}
              animate={{ width: `${poolPct(totalPaid)}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
            <motion.div
              className="h-full bg-[#FF9500]"
              initial={{ width: 0 }}
              animate={{ width: `${poolPct(totalReserved)}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 20 }}
            />
          </div>
          {/* 90% submission-block marker */}
          <span
            className="absolute -top-1 -bottom-1 w-0.5 bg-foreground/40"
            style={{ left: "90%" }}
            title="90% — new submissions blocked"
          />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-[10px] font-semibold text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#007AFF]" /> {t("Paid")} {money(totalPaid)}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#FF9500]" /> {t("Reserved")} {money(totalReserved)}</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-secondary border border-border/40" /> {t("Remaining")} {money(totalRemaining)}</span>
        </div>
        {totalFee > 0 && (
          <p className="text-[10px] text-muted-foreground/70 mt-2 leading-normal">
            {t("Funded")} {money(totalFunded)} · {t("platform fee")} {money(totalFee)} · {t("creators earn from")} {money(totalPool)}
          </p>
        )}
      </div>

      {/* Action CTA: clips awaiting moderation */}
      {pendingClips.length > 0 && (
        <Link
          href="/business/moderation"
          className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#FF9500]/10 border border-[#FF9500]/25 hover:bg-[#FF9500]/15 transition-colors mb-4 group"
        >
          <span className="text-xs font-bold text-foreground flex items-center gap-2">
            <Clock size={14} className="text-[#FF9500]" />
            {pendingClips.length} {t("clip(s) waiting for your review")}
          </span>
          <span className="text-xs font-bold text-[#FF9500] flex items-center gap-1">
            {t("Review now")}{" "}
            <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <StatCard
            key={c.label}
            label={c.label}
            value={c.value}
            icon={c.icon}
            color={c.color}
            sub={c.sub}
          />
        ))}
      </div>

      <div className="p-6 apple-card">
        <h3 className="text-sm font-bold mb-4">{t("Recent performance campaigns")}</h3>
        <div className="space-y-4">
          {campaigns.slice(0, 4).map((c) => {
            const pool = Number(c.budget_pool || 0);
            const used = Number(c.budget_reserved || 0) + Number(c.budget_paid || 0);
            const pct = pool > 0 ? Math.min((used / pool) * 100, 100) : 0;
            return (
              <Link
                key={c.id}
                href="/business/moderation"
                className="block p-4 rounded-2xl bg-secondary/20 border border-border/10 hover:bg-secondary/35 transition-colors"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold truncate">{c.title}</span>
                    {campaignCategoryLabel(c.campaign_category) && (
                      <StatusBadge tone="info">{t(campaignCategoryLabel(c.campaign_category)!)}</StatusBadge>
                    )}
                    <StatusBadge tone="success">{t("Performance")}</StatusBadge>
                    {c.status === "exhausted" && <StatusBadge tone="danger">{t("Closed")}</StatusBadge>}
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0 flex items-center gap-1">
                    <Eye size={11} /> {viewsByCampaign(c.id).toLocaleString()}
                  </span>
                </div>
                <div className="relative">
                  <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-[#007AFF] to-[#34C759]"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ type: "spring", stiffness: 120, damping: 20 }}
                    />
                  </div>
                  {/* 90% marker */}
                  <span className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground/40" style={{ left: "90%" }} />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5 font-medium">
                  <span>{money(used)} {t("used")}</span>
                  <span>{money(pool)} {t("pool")}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
