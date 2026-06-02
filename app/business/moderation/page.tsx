"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  Users,
  Check,
  X,
  Loader2,
  Layers,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "@/lib/translations";
import { isMockMode, supabase } from "@/lib/supabase/client";
import { getCampaignsAction } from "@/lib/supabase/campaigns";
import { useBrandModeration } from "@/lib/supabase/clips";
import { approvalCountdownLabel, workingDaysLeft } from "@/lib/approval";
import { Clock } from "lucide-react";

interface PerfCampaign {
  id: string;
  title: string;
  status?: string;
  budget_pool?: number | null;
  available_pool?: number | null;
  budget_reserved?: number | null;
  budget_paid?: number | null;
}

interface BrandClip {
  campaign_id: string;
  status: string;
  current_views: number;
  platform?: string;
  post_url?: string;
}

function money(n: number | null | undefined): string {
  return `$${Math.round(Number(n ?? 0)).toLocaleString()}`;
}

export default function BrandModerationPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<PerfCampaign[]>([]);
  const [allClips, setAllClips] = useState<BrandClip[]>([]);
  const { clips: pending, loading, moderate } = useBrandModeration();
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    if (isMockMode) {
      const res = await getCampaignsAction();
      setCampaigns(
        ((res.campaigns || []) as (PerfCampaign & { campaign_type?: string })[]).filter(
          (c) => c.campaign_type === "performance"
        )
      );
      return;
    }
    const { data } = await supabase
      .from("campaigns")
      .select("id, title, status, budget_pool, available_pool, budget_reserved, budget_paid")
      .eq("campaign_type", "performance");
    setCampaigns((data ?? []) as PerfCampaign[]);
  }, []);

  const loadClips = useCallback(async () => {
    if (isMockMode) {
      if (typeof window === "undefined") return;
      const raw = localStorage.getItem("aether-mock-clips");
      setAllClips(raw ? (JSON.parse(raw) as BrandClip[]) : []);
      return;
    }
    const { data } = await supabase
      .from("clips")
      .select("campaign_id, status, current_views, platform, post_url");
    setAllClips((data ?? []) as BrandClip[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadCampaigns();
    loadClips();
    const handler = () => loadClips();
    window.addEventListener("aether-clips-update", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("aether-clips-update", handler);
      window.removeEventListener("storage", handler);
    };
  }, [loadCampaigns, loadClips]);

  const handleModerate = async (clipId: string, action: "approve" | "reject") => {
    setBusyId(clipId);
    const res = await moderate(clipId, action);
    setBusyId(null);
    if (res.ok) {
      toast.success(action === "approve" ? t("Clip approved — now tracking") : t("Clip rejected"));
      loadClips();
    } else {
      toast.error(res.error || t("Action failed"));
    }
  };

  const trackingClips = allClips.filter((c) => c.status === "tracking");
  const totalViews = trackingClips.reduce((s, c) => s + Number(c.current_views || 0), 0);
  const topClips = [...trackingClips]
    .sort((a, b) => Number(b.current_views || 0) - Number(a.current_views || 0))
    .slice(0, 5);

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 md:py-16">
      <div className="mb-10">
        <span className="text-xs font-semibold text-[#007AFF] uppercase tracking-wider block mb-1.5">
          {t("Performance Campaigns")}
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("Clips & Moderation")}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("Review submitted clips and watch your budget convert into views.")}
        </p>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <div className="p-6 apple-card">
          <div className="flex justify-between items-start text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">{t("Total views")}</span>
            <span className="p-2 rounded-xl bg-primary/10 text-primary"><Eye size={15} /></span>
          </div>
          <h3 className="text-2xl font-bold tracking-tight mt-4">{totalViews.toLocaleString()}</h3>
          <span className="text-[11px] text-muted-foreground">{t("Across tracking clips")}</span>
        </div>
        <div className="p-6 apple-card">
          <div className="flex justify-between items-start text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">{t("Active clips")}</span>
            <span className="p-2 rounded-xl bg-[#34C759]/10 text-[#34C759]"><Layers size={15} /></span>
          </div>
          <h3 className="text-2xl font-bold tracking-tight mt-4">{trackingClips.length}</h3>
          <span className="text-[11px] text-muted-foreground">{t("Currently earning")}</span>
        </div>
        <div className="p-6 apple-card">
          <div className="flex justify-between items-start text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">{t("Pending review")}</span>
            <span className="p-2 rounded-xl bg-[#FF9500]/10 text-[#FF9500]"><Users size={15} /></span>
          </div>
          <h3 className="text-2xl font-bold tracking-tight mt-4">{pending.length}</h3>
          <span className="text-[11px] text-muted-foreground">{t("Awaiting your call")}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Moderation queue */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold tracking-tight">{t("Moderation Queue")}</h2>
          {loading ? (
            <div className="p-12 apple-card flex justify-center text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          ) : pending.length === 0 ? (
            <div className="p-10 apple-card text-center text-muted-foreground">
              <Check size={22} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">{t("All caught up")}</p>
              <p className="text-xs mt-1">{t("No clips waiting for review.")}</p>
            </div>
          ) : (
            pending.map((clip) => (
              <motion.div
                key={clip.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 apple-card flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20 uppercase tracking-wide">
                      {t("Pending")}
                    </span>
                    <span className="text-[10px] text-muted-foreground capitalize">{clip.platform}</span>
                    {clip.creatorCpm != null && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20 flex items-center gap-0.5">
                        ${Number(clip.creatorCpm).toFixed(2)} {t("CPM")}
                      </span>
                    )}
                    {clip.approval_deadline && (
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          (workingDaysLeft(clip.approval_deadline) ?? 0) <= 1
                            ? "bg-destructive/10 text-destructive border-destructive/20"
                            : "bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20"
                        }`}
                      >
                        <Clock size={9} /> {t(approvalCountdownLabel(clip.approval_deadline))}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold truncate">{clip.creatorName} · {clip.campaignTitle}</p>
                  <a
                    href={clip.post_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary hover:underline truncate flex items-center gap-1 max-w-full"
                  >
                    <ExternalLink size={10} /> {clip.post_url}
                  </a>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    onClick={() => handleModerate(clip.id, "approve")}
                    disabled={busyId === clip.id}
                    className="rounded-full px-4 py-4 text-xs font-bold gap-1.5 cursor-pointer bg-[#34C759] hover:bg-[#2fb350] text-white border-0 h-auto"
                  >
                    {busyId === clip.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    {t("Approve")}
                  </Button>
                  <Button
                    onClick={() => handleModerate(clip.id, "reject")}
                    disabled={busyId === clip.id}
                    variant="outline"
                    className="rounded-full px-4 py-4 text-xs font-bold gap-1.5 cursor-pointer border-border hover:bg-destructive/10 hover:text-destructive text-foreground h-auto"
                  >
                    <X size={13} /> {t("Reject")}
                  </Button>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Burn-down + top clips */}
        <div className="space-y-6">
          <div className="p-6 apple-card">
            <h3 className="text-sm font-bold mb-4">{t("Budget burn-down")}</h3>
            {campaigns.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("No performance campaigns yet.")}</p>
            ) : (
              <div className="space-y-5">
                {campaigns.map((c) => {
                  // Creator-earnable pool (post platform fee), legacy → full pool.
                  const pool = Number(c.available_pool ?? c.budget_pool ?? 0);
                  const reserved = Number(c.budget_reserved ?? 0);
                  const paid = Number(c.budget_paid ?? 0);
                  const remaining = Math.max(pool - reserved - paid, 0);
                  const pct = (v: number) => (pool > 0 ? (v / pool) * 100 : 0);
                  return (
                    <div key={c.id}>
                      <div className="flex justify-between items-center mb-1.5 gap-2">
                        <span className="text-xs font-semibold truncate max-w-[120px] flex items-center gap-1.5">
                          {c.title}
                          {c.status === "exhausted" && (
                            <span className="text-[8px] font-bold uppercase tracking-wide bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 rounded-full shrink-0">
                              {t("Closed")}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{money(pool)} {t("pool")}</span>
                      </div>
                      <div className="relative">
                        <div className="h-2.5 rounded-full bg-secondary/40 overflow-hidden flex">
                          <div className="h-full bg-[#007AFF]" style={{ width: `${pct(paid)}%` }} title="Paid" />
                          <div className="h-full bg-[#FF9500]" style={{ width: `${pct(reserved)}%` }} title="Reserved" />
                        </div>
                        <span className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground/40" style={{ left: "90%" }} title="90%" />
                      </div>
                      <div className="flex justify-between text-[9px] font-semibold mt-1.5 text-muted-foreground">
                        <span className="text-[#007AFF]">{t("Paid")} {money(paid)}</span>
                        <span className="text-[#FF9500]">{t("Reserved")} {money(reserved)}</span>
                        <span>{t("Left")} {money(remaining)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-6 apple-card">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-1.5">
              <TrendingUp size={15} className="text-[#34C759]" /> {t("Top clips")}
            </h3>
            {topClips.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("No tracking clips yet.")}</p>
            ) : (
              <div className="space-y-3">
                {topClips.map((c, i) => (
                  <div key={c.post_url ?? i} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-muted-foreground w-4">{i + 1}.</span>
                      <span className="capitalize text-muted-foreground truncate">{c.platform}</span>
                    </span>
                    <span className="font-bold">{Number(c.current_views || 0).toLocaleString()} {t("views")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
