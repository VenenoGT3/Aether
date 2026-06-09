"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  Link2,
  Loader2,
  Plus,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  CreatorActionButton,
  CreatorEmptyState,
  CreatorGlassCard,
  CreatorMetricCard,
  CreatorPageShell,
  CreatorSectionHeader,
  CreatorStatusPill,
  type CreatorTone,
} from "@/components/creator/creator-ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import confetti from "canvas-confetti";
import { approvalCountdownLabel } from "@/lib/approval";
import { isYoutubePostUrl } from "@/lib/social-post";
import { getClientProfile, supabase } from "@/lib/supabase/client";
import {
  useCreatorClips,
  useCreatorEarnings,
  useJoinedCampaigns,
  type ClipStatus,
} from "@/lib/supabase/clips";
import { useTranslation } from "@/lib/translations";

interface PerfCampaign {
  id: string;
  title: string;
  cpm_rate?: number | null;
  platforms?: string[] | null;
}

const STATUS_STYLES: Record<ClipStatus, { label: string; tone: CreatorTone }> = {
  pending: { label: "Pending review", tone: "warning" },
  approved: { label: "Approved", tone: "accent" },
  tracking: { label: "Tracking live", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
  disqualified: { label: "Disqualified", tone: "danger" },
};

function money(value: number) {
  return `$${Math.round(value).toLocaleString()}`;
}

export default function CreatorClipsPage() {
  const { t } = useTranslation();
  const { clips, loading, submitClip } = useCreatorClips();
  const { breakdown, payouts, withdraw } = useCreatorEarnings();
  const { joinedIds, join } = useJoinedCampaigns();

  const [campaigns, setCampaigns] = useState<PerfCampaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [trusted, setTrusted] = useState(false);

  const isJoined = selectedCampaign ? joinedIds.has(selectedCampaign) : false;
  const selectedOfferedCpm = campaigns.find((c) => c.id === selectedCampaign)?.cpm_rate ?? null;

  const loadCampaigns = useCallback(async () => {
    const { data } = await supabase
      .from("campaigns")
      .select("id, title, cpm_rate, platforms")
      .eq("campaign_type", "performance")
      .in("status", ["open", "in_progress"])
      .contains("platforms", ["youtube"]);
    const list = ((data ?? []) as PerfCampaign[]).filter((campaign) =>
      (campaign.platforms ?? []).includes("youtube")
    );
    setCampaigns(list);
    if (list.length > 0) setSelectedCampaign((current) => current || list[0].id);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadCampaigns();
    getClientProfile()
      .then((profile) => setTrusted(profile?.trusted_creator === true))
      .catch(() => {});
  }, [loadCampaigns]);

  const handleJoin = async () => {
    if (!selectedCampaign) {
      toast.error(t("Pick a campaign to join."));
      return;
    }
    setJoining(true);
    const res = await join(selectedCampaign);
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
    if (!isYoutubePostUrl(postUrl.trim())) {
      toast.error(t("Aether beta currently accepts YouTube Shorts links only."));
      return;
    }
    setSubmitting(true);
    const res = await submitClip(selectedCampaign, postUrl.trim());
    setSubmitting(false);
    if (res.ok) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#4d8eff", "#9f8dfa", "#22d3ee"],
      });
      toast.success(t("Clip submitted!"), {
        description: t("It will start earning once the brand approves it."),
      });
      setPostUrl("");
    } else {
      toast.error(res.error || t("Could not submit clip."));
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    toast.loading(t("Preparing withdrawal..."), { id: "creator-withdrawal" });
    const res = await withdraw();
    setWithdrawing(false);
    if (res.ok) {
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.6 },
        colors: ["#34d399", "#22d3ee", "#4d8eff"],
      });
      toast.success(t("Withdrawal requested."), {
        id: "creator-withdrawal",
        description:
          res.net != null
            ? t("Net payout: {amount}").replace("{amount}", money(Number(res.net)))
            : undefined,
      });
    } else {
      toast.error(res.error || t("Withdrawal failed."), { id: "creator-withdrawal" });
    }
  };

  const totalLiveViews = clips
    .filter((clip) => clip.status === "tracking")
    .reduce((sum, clip) => sum + clip.current_views, 0);
  const grossEarnings = breakdown.readyForPayout + breakdown.inHoldback + breakdown.paid;

  return (
    <CreatorPageShell>
      <CreatorSectionHeader
        eyebrow={t("Performance clipping")}
        title={t("Clips & Earnings")}
        description={t("Submit clips, track live views, manage holdback, and request Stripe-backed creator payouts.")}
        action={
          <CreatorActionButton href="/creator/discover" variant="secondary">
            <Zap size={15} className="text-[var(--creator-success)]" />
            {t("Find Campaigns")}
          </CreatorActionButton>
        }
      />

      {trusted ? (
        <CreatorGlassCard className="mt-8 border-[rgba(52,211,153,0.18)] bg-[rgba(52,211,153,0.055)]">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(52,211,153,0.22)] bg-[rgba(52,211,153,0.10)] text-[var(--creator-success)]">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">{t("You're a Trusted Creator")}</h2>
              <p className="mt-1 text-xs leading-5 text-white/70">
                {t("Your clips are approved instantly and start tracking right away, without the review wait.")}
              </p>
            </div>
          </div>
        </CreatorGlassCard>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CreatorMetricCard
          label={t("Gross earnings")}
          value={money(grossEarnings)}
          icon={TrendingUp}
          detail={t("Across performance clips")}
          tone="cyan"
        />
        <CreatorMetricCard
          label={t("Available balance")}
          value={money(breakdown.readyForPayout)}
          icon={Wallet}
          detail={t("Cleared holdback")}
          tone="accent"
        />
        <CreatorMetricCard
          label={t("Locked in holdback")}
          value={money(breakdown.inHoldback)}
          icon={Clock}
          detail={t("Pending settle window")}
          tone="warning"
        />
        <CreatorMetricCard
          label={t("Live views")}
          value={totalLiveViews.toLocaleString()}
          icon={Eye}
          detail={t("Across tracking clips")}
          tone="violet"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)]">
        <div className="space-y-4">
          <CreatorGlassCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="creator-label text-white/60">{t("Creator clips")}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{t("Your Clips")}</h2>
              </div>
              <CreatorStatusPill tone="neutral">{clips.length} clips</CreatorStatusPill>
            </div>

            {loading ? (
              <div className="flex h-44 items-center justify-center text-white/60">
                <Loader2 className="animate-spin" />
              </div>
            ) : clips.length === 0 ? (
              <CreatorEmptyState
                icon={Link2}
                title={t("No clips yet")}
                description={t("Submit your first clip to start earning per verified view.")}
              />
            ) : (
              <div className="space-y-3">
                {clips.map((clip) => {
                  const style = STATUS_STYLES[clip.status];
                  return (
                    <motion.article
                      key={clip.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            {clip.quality_status === "changes_requested" ? (
                              <CreatorStatusPill tone="warning">{t("Changes requested")}</CreatorStatusPill>
                            ) : (
                              <CreatorStatusPill tone={style.tone}>{t(style.label)}</CreatorStatusPill>
                            )}
                            <span className="text-[10px] capitalize text-white/60">{clip.platform}</span>
                            {clip.status === "pending" && clip.quality_status !== "changes_requested" ? (
                              <span className="flex items-center gap-1 text-[9px] font-semibold text-[var(--creator-warning)]">
                                <Clock size={9} />
                                {t(approvalCountdownLabel(clip.approval_deadline))}
                              </span>
                            ) : null}
                            {clip.status === "tracking" && clip.auto_approved ? (
                              <CreatorStatusPill tone="neutral">
                                {trusted ? t("Auto-approved trusted") : t("Auto-approved")}
                              </CreatorStatusPill>
                            ) : null}
                          </div>
                          <p className="truncate text-sm font-semibold text-white">{clip.campaignTitle}</p>
                          <a
                            href={clip.post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block max-w-full truncate text-xs text-[var(--creator-primary)] hover:underline"
                          >
                            {clip.post_url}
                          </a>
                          {clip.quality_notes &&
                          (clip.quality_status === "changes_requested" || clip.quality_status === "rejected") ? (
                            <div className="mt-3 rounded-xl border border-[rgba(245,158,11,0.18)] bg-[rgba(245,158,11,0.06)] p-3 text-xs leading-5 text-white/70">
                              <span className="font-semibold text-[var(--creator-warning)]">
                                {clip.quality_status === "changes_requested" ? t("Changes requested:") : t("Rejected:")}
                              </span>{" "}
                              {clip.quality_notes}
                            </div>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:w-44">
                          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-right">
                            <span className="flex items-center justify-end gap-1 text-[10px] font-semibold uppercase text-white/60">
                              <Eye size={11} /> {t("Views")}
                            </span>
                            <p className="mt-1 text-sm font-bold text-white">{clip.current_views.toLocaleString()}</p>
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-right">
                            <span className="flex items-center justify-end gap-1 text-[10px] font-semibold uppercase text-white/60">
                              <DollarSign size={11} /> {t("Earned")}
                            </span>
                            <p className="mt-1 text-sm font-bold text-[var(--creator-success)]">
                              {money(clip.estimated_earnings)}
                            </p>
                            {clip.creator_cpm != null ? (
                              <span className="mt-0.5 block text-[9px] text-white/60">
                                @ ${Number(clip.creator_cpm).toFixed(2)} {t("CPM")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            )}
          </CreatorGlassCard>
        </div>

        <div className="space-y-4">
          <CreatorGlassCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="creator-label text-white/60">{t("Submit work")}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{t("Submit a clip")}</h2>
              </div>
              <Plus size={20} className="text-[var(--creator-primary)]" />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="creator-label block text-white/60">{t("Campaign")}</label>
                <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                  <SelectTrigger className="creator-input h-12 w-full rounded-xl px-4 py-3 text-sm">
                    <SelectValue placeholder={t("Select a campaign")} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0f172a] text-white border-white/10">
                    {campaigns.length === 0 ? (
                      <SelectItem value="empty" disabled>{t("No open campaigns")}</SelectItem>
                    ) : (
                      campaigns.map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.title}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {!isJoined ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <p className="creator-label text-white/60">{t("Brand rate")}</p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white">
                        ${Number(selectedOfferedCpm ?? 0).toFixed(2)}
                      </span>
                      <span className="text-xs text-white/60">{t("CPM per 1,000 views")}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/60">
                      {selectedOfferedCpm
                        ? t("Earn ${per100k} per 100k views at the brand's rate.").replace(
                            "{per100k}",
                            Math.round(Number(selectedOfferedCpm) * 100).toLocaleString()
                          )
                        : t("This brand sets the pay-per-view rate.")}
                    </p>
                  </div>
                  <Button
                    onClick={handleJoin}
                    disabled={joining || !selectedCampaign}
                    className="creator-gradient-accent h-11 w-full rounded-xl border-0 text-xs font-semibold text-white hover:brightness-105"
                  >
                    {joining ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    {t("Join Campaign")}
                  </Button>
                  <p className="text-xs leading-5 text-white/60">
                    {t("Join this campaign to start submitting clips. It is instant and free.")}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="creator-label block text-white/60">{t("Clip URL")}</label>
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--creator-success)]">
                        <CheckCircle2 size={10} /> {t("Joined")}
                      </span>
                    </div>
                    <input
                      type="url"
                      placeholder="https://youtube.com/shorts/..."
                      value={postUrl}
                      onChange={(event) => setPostUrl(event.target.value)}
                      className="creator-input w-full rounded-xl px-3 py-3 text-sm placeholder:text-white/60"
                    />
                  </div>
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="creator-gradient-accent h-11 w-full rounded-xl border-0 text-xs font-semibold text-white hover:brightness-105"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {t("Submit clip")}
                  </Button>
                  <p className="text-xs leading-5 text-white/60">
                    {t("You can submit multiple clips. Each is reviewed, then tracked for verified views.")}
                  </p>
                </div>
              )}
            </div>
          </CreatorGlassCard>

          <CreatorGlassCard>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="creator-label text-white/60">{t("Available balance")}</p>
                <h2 className="mt-1 text-3xl font-bold text-[var(--creator-primary)]">
                  {money(breakdown.readyForPayout)}
                </h2>
              </div>
              <Wallet size={22} className="text-[var(--creator-primary)]" />
            </div>
            <Button
              onClick={handleWithdraw}
              disabled={withdrawing || breakdown.readyForPayout <= 0}
              className="creator-gradient-accent h-11 w-full rounded-xl border-0 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-45"
            >
              {withdrawing ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
              {t("Withdraw Funds")}
            </Button>
            <p className="mt-3 text-xs leading-5 text-white/60">
              {t("Only cleared earnings can be withdrawn. Holdback earnings become available automatically.")}
            </p>
          </CreatorGlassCard>

          <CreatorGlassCard>
            <p className="creator-label mb-3 text-white/60">{t("Recent performance payouts")}</p>
            {payouts.length === 0 ? (
              <p className="text-xs text-white/60">{t("No payouts yet.")}</p>
            ) : (
              <div className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5">
                {payouts.slice(0, 6).map((payout) => (
                  <div key={payout.id} className="flex items-center justify-between gap-3 p-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[var(--creator-success)]">
                        <CheckCircle2 size={15} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-white">
                          {new Date(payout.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        <p className="mt-0.5 text-[10px] text-white/60">{payout.status}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[var(--creator-success)]">
                      +{money(Number(payout.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CreatorGlassCard>
        </div>
      </div>
    </CreatorPageShell>
  );
}
