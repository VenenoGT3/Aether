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
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "@/lib/translations";
import { isMockMode, supabase, getClientProfile } from "@/lib/supabase/client";
import { getCampaignsAction } from "@/lib/supabase/campaigns";
import {
  useCreatorClips,
  useCreatorEarnings,
  useJoinedCampaigns,
  type ClipStatus,
} from "@/lib/supabase/clips";
import { approvalCountdownLabel } from "@/lib/approval";
import { AyrshareLinkPlaceholder } from "@/components/ayrshare-link-placeholder";
import { CreatorWallet } from "@/components/creator-wallet";
import { ShieldCheck } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

interface PerfCampaign {
  id: string;
  title: string;
  cpm_rate?: number | null;
}

const STATUS_STYLES: Record<ClipStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending review", tone: "warning" },
  approved: { label: "Approved", tone: "info" },
  tracking: { label: "Tracking · Live", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
  disqualified: { label: "Disqualified", tone: "danger" },
};

export default function CreatorClipsPage() {
  const { t } = useTranslation();
  const { clips, loading, submitClip } = useCreatorClips();
  const { breakdown, payouts } = useCreatorEarnings();
  const { joinedIds, join } = useJoinedCampaigns();

  const [campaigns, setCampaigns] = useState<PerfCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinCpm, setJoinCpm] = useState(2.5);
  const [trusted, setTrusted] = useState(false);

  const isJoined = selectedCampaign ? joinedIds.has(selectedCampaign) : false;
  const selectedOfferedCpm =
    campaigns.find((c) => c.id === selectedCampaign)?.cpm_rate ?? null;

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
      .select("id, title, cpm_rate")
      .eq("campaign_type", "performance")
      .in("status", ["open", "in_progress"]);
    const list = (data ?? []) as PerfCampaign[];
    setCampaigns(list);
    if (list.length > 0) setSelectedCampaign(list[0].id);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadCampaigns();
    getClientProfile()
      .then((p) => setTrusted(p?.trusted_creator === true))
      .catch(() => {});
  }, [loadCampaigns]);

  // Default the join CPM to the selected campaign's offered rate.
  useEffect(() => {
    if (selectedOfferedCpm != null && selectedOfferedCpm > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derive default from selection
      setJoinCpm(Number(selectedOfferedCpm));
    }
  }, [selectedOfferedCpm]);

  const handleJoin = async () => {
    if (!selectedCampaign) {
      toast.error(t("Pick a campaign to join."));
      return;
    }
    setJoining(true);
    const res = await join(selectedCampaign, joinCpm > 0 ? joinCpm : undefined);
    setJoining(false);
    if (res.ok) {
      toast.success(
        res.alreadyJoined
          ? t("You're already in this campaign.")
          : t("Joined! You can now submit clips.")
      );
    } else {
      toast.error(res.error || t("Could not join campaign."));
    }
  };

  const handleSubmit = async () => {
    if (!selectedCampaign) {
      toast.error(t("Pick a campaign to clip for."));
      return;
    }
    if (!isJoined) {
      toast.error(t("Join this campaign before submitting clips."));
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

      {/* Trusted Creator banner — clips skip the review window. */}
      {trusted && (
        <div className="mb-8 p-4 rounded-2xl bg-[#34C759]/5 border border-[#34C759]/20 flex items-center gap-3">
          <span className="p-2 rounded-xl bg-[#34C759]/10 text-[#34C759] shrink-0">
            <ShieldCheck size={16} />
          </span>
          <div>
            <h4 className="text-xs font-bold text-foreground">{t("You're a Trusted Creator")}</h4>
            <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">
              {t("Your clips are approved instantly and start tracking right away — no 5-day review wait.")}
            </p>
          </div>
        </div>
      )}

      {/* Wallet — balances + withdraw */}
      <div className="mb-8">
        <CreatorWallet />
      </div>

      {/* Earnings summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard
          label={t("Ready for payout")}
          value={`$${breakdown.readyForPayout.toLocaleString()}`}
          icon={Wallet}
          color="#34C759"
          sub={t("Cleared holdback")}
        />
        <StatCard
          label={t("In holdback")}
          value={`$${breakdown.inHoldback.toLocaleString()}`}
          icon={Clock}
          color="#FF9500"
          sub={t("Pending settle window")}
        />
        <StatCard
          label={t("Paid out")}
          value={`$${breakdown.paid.toLocaleString()}`}
          icon={DollarSign}
          color="#007AFF"
          sub={t("Lifetime")}
        />
        <StatCard
          label={t("Live views")}
          value={totalLiveViews.toLocaleString()}
          icon={TrendingUp}
          color="#5856D6"
          sub={t("Across tracking clips")}
        />
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
            <div className="apple-card">
              <EmptyState
                icon={Link2}
                title={t("No clips yet")}
                description={t("Submit your first clip to start earning per view.")}
              />
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
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {clip.quality_status === "changes_requested" ? (
                        <StatusBadge tone="warning">{t("Changes requested")}</StatusBadge>
                      ) : (
                        <StatusBadge tone={style.tone}>{t(style.label)}</StatusBadge>
                      )}
                      <span className="text-[10px] text-muted-foreground capitalize">{clip.platform}</span>
                      {clip.status === "pending" && clip.quality_status !== "changes_requested" && (
                        <span className="text-[9px] font-bold text-[#FF9500] flex items-center gap-1">
                          <Clock size={9} /> {t(approvalCountdownLabel(clip.approval_deadline))}
                        </span>
                      )}
                      {clip.status === "tracking" && clip.auto_approved && (
                        <StatusBadge tone="neutral">
                          {trusted ? t("Auto-approved · Trusted") : t("Auto-approved")}
                        </StatusBadge>
                      )}
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
                    {clip.quality_notes &&
                      (clip.quality_status === "changes_requested" ||
                        clip.quality_status === "rejected") && (
                        <div className="mt-2 p-2.5 rounded-xl bg-[#FF9500]/5 border border-[#FF9500]/15 text-[11px] text-foreground leading-normal">
                          <span className="font-bold text-[#FF9500]">
                            {clip.quality_status === "changes_requested"
                              ? t("Changes requested:")
                              : t("Rejected:")}
                          </span>{" "}
                          {clip.quality_notes}
                          {clip.quality_status === "changes_requested" && (
                            <span className="block text-muted-foreground mt-1">
                              {t("Submit an improved clip below to try again.")}
                            </span>
                          )}
                        </div>
                      )}
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
                      {clip.creator_cpm != null && (
                        <span className="text-[9px] text-muted-foreground block mt-0.5">
                          @ ${Number(clip.creator_cpm).toFixed(2)} {t("CPM")}
                        </span>
                      )}
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
            {!isJoined ? (
              <div className="space-y-3 pt-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    {t("Your CPM ($ / 1,000 views)")}
                  </label>
                  <div className="relative">
                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max={selectedOfferedCpm ?? undefined}
                      value={joinCpm}
                      onChange={(e) => setJoinCpm(Number(e.target.value))}
                      className="w-full pl-8 pr-3 py-2.5 text-sm rounded-xl border border-border bg-secondary/30 focus:outline-none focus:border-primary/80"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-normal">
                    {selectedOfferedCpm
                      ? t("Brand offers up to ${rate}. Earn ${per100k} per 100k views.")
                          .replace("{rate}", Number(selectedOfferedCpm).toFixed(2))
                          .replace("{per100k}", Math.round(Math.max(joinCpm, 0) * 100).toLocaleString())
                      : t("You earn ${per100k} per 100k views.").replace(
                          "{per100k}",
                          Math.round(Math.max(joinCpm, 0) * 100).toLocaleString()
                        )}
                  </p>
                </div>
                <Button
                  onClick={handleJoin}
                  disabled={joining || !selectedCampaign}
                  className="w-full rounded-xl py-5 font-bold text-xs gap-1.5 cursor-pointer bg-[#34C759] hover:bg-[#2fb350] text-white border-0 h-auto"
                >
                  {joining ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {t("Join Campaign")}
                </Button>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  {t("Join this campaign to start submitting clips. It's instant and free — no application needed.")}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">{t("Clip URL")}</label>
                    <span className="text-[9px] font-bold text-[#34C759] flex items-center gap-1">
                      <CheckCircle2 size={10} /> {t("Joined")}
                    </span>
                  </div>
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
              </>
            )}
          </div>

          <AyrshareLinkPlaceholder />

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
              {t("Earnings clear the holdback window automatically, then become available to withdraw from your Creator Wallet above.")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
