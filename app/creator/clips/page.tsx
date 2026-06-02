"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  DollarSign,
  Clock,
  CheckCircle2,
  Plus,
  Link2,
  Loader2,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "@/lib/translations";
import { isMockMode, supabase } from "@/lib/supabase/client";
import { getCampaignsAction } from "@/lib/supabase/campaigns";
import {
  useCreatorClips,
  useCreatorEarnings,
  type ClipStatus,
} from "@/lib/supabase/clips";

interface PerfCampaign {
  id: string;
  title: string;
}

const STATUS_STYLES: Record<ClipStatus, { label: string; cls: string }> = {
  pending: { label: "Pending review", cls: "bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20" },
  approved: { label: "Approved", cls: "bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/20" },
  tracking: { label: "Tracking · Live", cls: "bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20" },
  rejected: { label: "Rejected", cls: "bg-muted text-muted-foreground border-border/30" },
  disqualified: { label: "Disqualified", cls: "bg-destructive/10 text-destructive border-destructive/20" },
};

export default function CreatorClipsPage() {
  const { t } = useTranslation();
  const { clips, loading, submitClip } = useCreatorClips();
  const { breakdown, payouts } = useCreatorEarnings();

  const [campaigns, setCampaigns] = useState<PerfCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadCampaigns = useCallback(async () => {
    if (isMockMode) {
      const res = await getCampaignsAction();
      const perf = (res.campaigns || []).filter(
        (c: { campaign_type?: string }) => c.campaign_type === "performance"
      );
      setCampaigns(perf as PerfCampaign[]);
      if (perf.length > 0) setSelectedCampaign((perf[0] as PerfCampaign).id);
      return;
    }
    const { data } = await supabase
      .from("campaigns")
      .select("id, title")
      .eq("campaign_type", "performance")
      .in("status", ["open", "in_progress"]);
    const list = (data ?? []) as PerfCampaign[];
    setCampaigns(list);
    if (list.length > 0) setSelectedCampaign(list[0].id);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadCampaigns();
  }, [loadCampaigns]);

  const handleSubmit = async () => {
    if (!selectedCampaign) {
      toast.error(t("Pick a campaign to clip for."));
      return;
    }
    if (!postUrl.trim()) {
      toast.error(t("Paste your clip URL."));
      return;
    }
    setSubmitting(true);
    const campaignTitle = campaigns.find((c) => c.id === selectedCampaign)?.title;
    const res = await submitClip(selectedCampaign, postUrl.trim(), campaignTitle);
    setSubmitting(false);
    if (res.ok) {
      toast.success(t("Clip submitted!"), {
        description: t("It will start earning once the brand approves it."),
      });
      setPostUrl("");
    } else {
      toast.error(res.error || t("Could not submit clip."));
    }
  };

  const totalLiveViews = clips
    .filter((c) => c.status === "tracking")
    .reduce((sum, c) => sum + c.current_views, 0);

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 md:py-16">
      <div className="mb-10">
        <span className="text-xs font-semibold text-[#34C759] uppercase tracking-wider block mb-1.5">
          {t("Performance Clipping")}
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("Clips & Earnings")}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("Submit clips, track live views, and watch your earnings accrue per view.")}
        </p>
      </div>

      {/* Earnings summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <motion.div whileHover={{ y: -3 }} className="p-6 apple-card">
          <div className="flex justify-between items-start text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">{t("Ready for payout")}</span>
            <span className="p-2 rounded-xl bg-[#34C759]/10 text-[#34C759]"><Wallet size={15} /></span>
          </div>
          <h3 className="text-2xl font-bold tracking-tight mt-4">${breakdown.readyForPayout.toLocaleString()}</h3>
          <span className="text-[11px] text-muted-foreground">{t("Cleared holdback")}</span>
        </motion.div>

        <motion.div whileHover={{ y: -3 }} className="p-6 apple-card">
          <div className="flex justify-between items-start text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">{t("In holdback")}</span>
            <span className="p-2 rounded-xl bg-[#FF9500]/10 text-[#FF9500]"><Clock size={15} /></span>
          </div>
          <h3 className="text-2xl font-bold tracking-tight mt-4">${breakdown.inHoldback.toLocaleString()}</h3>
          <span className="text-[11px] text-muted-foreground">{t("Pending settle window")}</span>
        </motion.div>

        <motion.div whileHover={{ y: -3 }} className="p-6 apple-card">
          <div className="flex justify-between items-start text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">{t("Paid out")}</span>
            <span className="p-2 rounded-xl bg-[#007AFF]/10 text-[#007AFF]"><DollarSign size={15} /></span>
          </div>
          <h3 className="text-2xl font-bold tracking-tight mt-4">${breakdown.paid.toLocaleString()}</h3>
          <span className="text-[11px] text-muted-foreground">{t("Lifetime")}</span>
        </motion.div>

        <motion.div whileHover={{ y: -3 }} className="p-6 apple-card">
          <div className="flex justify-between items-start text-muted-foreground">
            <span className="text-[10px] font-bold uppercase tracking-wider">{t("Live views")}</span>
            <span className="p-2 rounded-xl bg-primary/10 text-primary"><TrendingUp size={15} /></span>
          </div>
          <h3 className="text-2xl font-bold tracking-tight mt-4">{totalLiveViews.toLocaleString()}</h3>
          <span className="text-[11px] text-muted-foreground">{t("Across tracking clips")}</span>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Clips list */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold tracking-tight">{t("Your Clips")}</h2>

          {loading ? (
            <div className="p-12 apple-card flex justify-center text-muted-foreground">
              <Loader2 className="animate-spin" />
            </div>
          ) : clips.length === 0 ? (
            <div className="p-10 apple-card text-center text-muted-foreground">
              <Link2 size={22} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">{t("No clips yet")}</p>
              <p className="text-xs mt-1">{t("Submit your first clip to start earning per view.")}</p>
            </div>
          ) : (
            clips.map((clip) => {
              const style = STATUS_STYLES[clip.status];
              return (
                <motion.div
                  key={clip.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 apple-card flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${style.cls}`}>
                        {t(style.label)}
                      </span>
                      <span className="text-[10px] text-muted-foreground capitalize">{clip.platform}</span>
                    </div>
                    <p className="text-sm font-semibold truncate">{clip.campaignTitle}</p>
                    <a
                      href={clip.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-primary hover:underline truncate block max-w-full"
                    >
                      {clip.post_url}
                    </a>
                  </div>
                  <div className="flex gap-6 shrink-0">
                    <div className="text-right">
                      <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase justify-end">
                        <Eye size={11} /> {t("Views")}
                      </span>
                      <p className="text-sm font-bold mt-0.5">{clip.current_views.toLocaleString()}</p>
                    </div>
                    <div className="text-right">
                      <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase justify-end">
                        <DollarSign size={11} /> {t("Earned")}
                      </span>
                      <p className="text-sm font-bold mt-0.5 text-[#34C759]">
                        ${clip.estimated_earnings.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Submit + payout history */}
        <div className="space-y-6">
          <div className="p-6 apple-card space-y-4">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Plus size={15} className="text-primary" /> {t("Submit a clip")}
            </h3>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Campaign")}</label>
              <select
                value={selectedCampaign}
                onChange={(e) => setSelectedCampaign(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 cursor-pointer"
              >
                {campaigns.length === 0 && <option value="">{t("No open campaigns")}</option>}
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id} className="bg-popover">
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Clip URL")}</label>
              <input
                type="url"
                placeholder="https://tiktok.com/@you/video/..."
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80 placeholder:text-muted-foreground/40"
              />
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full rounded-xl py-5 font-bold text-xs gap-1.5 cursor-pointer bg-primary text-white border-0 h-auto"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {t("Submit clip")}
            </Button>
            <p className="text-[10px] text-muted-foreground leading-normal">
              {t("You can submit as many clips as you like. Each is reviewed, then tracked for views.")}
            </p>
          </div>

          <div className="p-6 apple-card">
            <h3 className="text-sm font-bold mb-4">{t("Payout history")}</h3>
            {payouts.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("No payouts yet.")}</p>
            ) : (
              <div className="space-y-3">
                {payouts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={13} className="text-[#34C759]" />
                      <span className="text-muted-foreground">
                        {new Date(p.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <span className="font-bold">${Number(p.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-4 pt-3 border-t border-border/10 leading-normal">
              {t("Earnings clear the holdback window automatically, then pay out to your connected Stripe account.")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
