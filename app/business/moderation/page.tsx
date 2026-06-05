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
  Play,
  MessageSquare,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "@/lib/translations";
import { supabase } from "@/lib/supabase/client";
import { useBrandModeration } from "@/lib/supabase/clips";
import { approvalCountdownLabel, workingDaysLeft } from "@/lib/approval";
import { Clock } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CAMPAIGN_CATEGORY_LABELS,
  type CampaignCategory,
} from "@/lib/campaign-category";

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

/** Extract a YouTube video id so it can be played inline in the review queue. */
function getYouTubeId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/
  );
  return m ? m[1] : null;
}

export default function BrandModerationPage() {
  const { t } = useTranslation();
  const [campaigns, setCampaigns] = useState<PerfCampaign[]>([]);
  const [allClips, setAllClips] = useState<BrandClip[]>([]);
  const { clips: pending, flagged, loading, moderate, override } = useBrandModeration();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Per-clip review inputs.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, number>>({});

  const loadCampaigns = useCallback(async () => {
    const { data } = await supabase
      .from("campaigns")
      .select("id, title, status, budget_pool, available_pool, budget_reserved, budget_paid")
      .eq("campaign_type", "performance");
    setCampaigns((data ?? []) as PerfCampaign[]);
  }, []);

  const loadClips = useCallback(async () => {
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
    return () => {
      window.removeEventListener("aether-clips-update", handler);
    };
  }, [loadCampaigns, loadClips]);

  const handleModerate = async (
    clipId: string,
    action: "approve" | "reject" | "request_changes"
  ) => {
    const reason = notes[clipId]?.trim();
    if (action === "request_changes" && (!reason || reason.length < 3)) {
      toast.error(t("Add feedback so the creator knows what to change."));
      return;
    }
    setBusyId(clipId);
    const res = await moderate(clipId, action, { reason, score: scores[clipId] });
    setBusyId(null);
    if (res.ok) {
      toast.success(
        action === "approve"
          ? t("Clip approved — now tracking")
          : action === "request_changes"
          ? t("Changes requested — sent back to the creator")
          : t("Clip rejected")
      );
      loadClips();
      window.dispatchEvent(new Event("aether-clips-update"));
    } else {
      toast.error(res.error || t("Action failed"));
    }
  };

  const handleDisqualify = async (clipId: string) => {
    setBusyId(clipId);
    const res = await moderate(clipId, "disqualify", {});
    setBusyId(null);
    if (res.ok) {
      toast.success(t("Clip disqualified — earnings stopped and reversed"));
      loadClips();
      window.dispatchEvent(new Event("aether-clips-update"));
    } else {
      toast.error(res.error || t("Action failed"));
    }
  };

  const handleOverride = async (clipId: string) => {
    setBusyId(clipId);
    const res = await override(clipId);
    setBusyId(null);
    if (res.ok) {
      toast.success(t("Flag cleared — clip keeps earning"));
      loadClips();
      window.dispatchEvent(new Event("aether-clips-update"));
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
            <div className="apple-card">
              <EmptyState
                icon={Check}
                title={t("All caught up")}
                description={t("No clips waiting for review.")}
              />
            </div>
          ) : (
            pending.map((clip) => {
              const ytId = getYouTubeId(clip.post_url);
              return (
              <motion.div
                key={clip.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-5 apple-card space-y-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <StatusBadge tone="warning">{t("Pending review")}</StatusBadge>
                    <span className="text-[10px] text-muted-foreground capitalize">{clip.platform}</span>
                    {clip.campaignCategory && (
                      <StatusBadge tone="purple">
                        {t(CAMPAIGN_CATEGORY_LABELS[clip.campaignCategory as CampaignCategory])}
                      </StatusBadge>
                    )}
                    {clip.creatorCpm != null && (
                      <StatusBadge tone="info">
                        ${Number(clip.creatorCpm).toFixed(2)} {t("CPM")}
                      </StatusBadge>
                    )}
                    {clip.approval_deadline && (
                      <StatusBadge
                        tone={(workingDaysLeft(clip.approval_deadline) ?? 0) <= 1 ? "danger" : "warning"}
                      >
                        <Clock size={9} aria-hidden="true" /> {t(approvalCountdownLabel(clip.approval_deadline))}
                      </StatusBadge>
                    )}
                  </div>
                  <p className="text-sm font-semibold truncate">{clip.creatorName} · {clip.campaignTitle}</p>
                </div>

                {/* Watch the actual content */}
                {ytId ? (
                  <div className="rounded-2xl overflow-hidden border border-border/15 bg-black aspect-video">
                    <iframe
                      src={`https://www.youtube.com/embed/${ytId}`}
                      title="Clip preview"
                      className="w-full h-full"
                      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <a
                    href={clip.post_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-secondary/25 border border-border/10 hover:bg-secondary/40 transition-colors group"
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <span className="p-2 rounded-xl bg-primary/10 text-primary"><Play size={14} /></span>
                      {t("Watch the video")} <span className="capitalize text-muted-foreground">· {clip.platform}</span>
                    </span>
                    <ExternalLink size={14} className="text-muted-foreground group-hover:text-foreground" />
                  </a>
                )}
                <a
                  href={clip.post_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-muted-foreground hover:text-primary hover:underline truncate block max-w-full"
                >
                  {clip.post_url}
                </a>

                {/* Feedback (required to request changes, optional reason for reject) */}
                <textarea
                  rows={2}
                  placeholder={t("Feedback for the creator — required to request changes, optional when rejecting…")}
                  value={notes[clip.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [clip.id]: e.target.value }))}
                  className="w-full px-3 py-2.5 text-xs rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 transition-all resize-none placeholder:text-muted-foreground/45"
                />

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    {t("Quality score")}
                    <select
                      value={scores[clip.id] ?? ""}
                      onChange={(e) =>
                        setScores((s) => ({ ...s, [clip.id]: Number(e.target.value) }))
                      }
                      className="px-2 py-1 rounded-lg border border-border/30 bg-background text-[11px] font-semibold text-foreground cursor-pointer"
                    >
                      <option value="">{t("—")}</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      onClick={() => handleModerate(clip.id, "approve")}
                      disabled={busyId === clip.id}
                      className="rounded-full px-4 py-4 text-xs font-bold gap-1.5 cursor-pointer bg-[#34C759] hover:bg-[#2fb350] text-white border-0 h-auto"
                    >
                      {busyId === clip.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {t("Approve")}
                    </Button>
                    <Button
                      onClick={() => handleModerate(clip.id, "request_changes")}
                      disabled={busyId === clip.id}
                      variant="outline"
                      className="rounded-full px-4 py-4 text-xs font-bold gap-1.5 cursor-pointer border-border hover:bg-[#FF9500]/10 hover:text-[#FF9500] text-foreground h-auto"
                    >
                      <MessageSquare size={13} /> {t("Request changes")}
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
                </div>
              </motion.div>
              );
            })
          )}

          {/* Fraud risk — flagged tracking clips for manual review */}
          {flagged.length > 0 && (
            <div className="space-y-3 pt-4">
              <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                <ShieldAlert size={18} className="text-destructive" /> {t("Fraud risk — flagged for review")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t("Still earning, but these clips tripped fraud signals. Review and disqualify if abusive.")}
              </p>
              {flagged.map((clip) => (
                <motion.div
                  key={clip.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 apple-card border-destructive/20 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <StatusBadge tone="danger">{t("Risk")} {clip.fraud_score ?? 0}</StatusBadge>
                      <span className="text-[10px] text-muted-foreground capitalize">{clip.platform}</span>
                      <span className="text-[11px] font-semibold truncate">{clip.creatorName} · {clip.campaignTitle}</span>
                    </div>
                    <a
                      href={clip.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 shrink-0"
                    >
                      <Play size={11} /> {t("Watch")} <ExternalLink size={10} />
                    </a>
                  </div>
                  {clip.fraud_reasons && clip.fraud_reasons.length > 0 && (
                    <ul className="text-[11px] text-muted-foreground list-disc list-inside space-y-0.5">
                      {clip.fraud_reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button
                      onClick={() => handleOverride(clip.id)}
                      disabled={busyId === clip.id}
                      variant="outline"
                      className="rounded-full px-4 py-4 text-xs font-bold gap-1.5 cursor-pointer border-border hover:bg-[#34C759]/10 hover:text-[#34C759] text-foreground h-auto"
                    >
                      {busyId === clip.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {t("Override (keep)")}
                    </Button>
                    <Button
                      onClick={() => handleDisqualify(clip.id)}
                      disabled={busyId === clip.id}
                      variant="outline"
                      className="rounded-full px-4 py-4 text-xs font-bold gap-1.5 cursor-pointer border-border hover:bg-destructive/10 hover:text-destructive text-foreground h-auto"
                    >
                      {busyId === clip.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                      {t("Disqualify")}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
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
