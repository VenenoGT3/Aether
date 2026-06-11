"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Eye,
  FileText,
  Link2,
  Loader2,
  Plus,
  Scissors,
  ShieldCheck,
  TrendingUp,
  Wallet,
  Zap,
  type LucideIcon,
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
import { approvalCountdownLabel } from "@/lib/approval";
import type { CampaignCategory } from "@/lib/campaign-category";
import { formatMoney, formatMoneyCompact } from "@/lib/currency";
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
  category_meta?: Record<string, unknown> | null;
  budget_pool?: number | null;
  available_pool?: number | null;
  budget_reserved?: number | null;
  budget_paid?: number | null;
}

type FlowCopy = {
  category: CampaignCategory;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  trustedDescription: string;
  metricDetail: string;
  listEyebrow: string;
  listTitle: string;
  emptyTitle: string;
  emptyDescription: string;
  submitEyebrow: string;
  submitTitle: string;
  campaignLabel: string;
  pickCampaignError: string;
  joinRequiredError: string;
  pasteUrlError: string;
  submitSuccess: string;
  submitSuccessDescription: string;
  submitError: string;
  joinSuccess: string;
  joinDescription: string;
  urlLabel: string;
  urlPlaceholder: string;
  submitButton: string;
  multipleNote: string;
  baselineNote: string;
  complianceNote: string;
  itemPlural: string;
  briefTitle: string;
  briefEmpty: string;
};

const FLOW_COPY: Record<CampaignCategory, FlowCopy> = {
  clipping: {
    category: "clipping",
    icon: Scissors,
    eyebrow: "Performance clipping",
    title: "Clips & Earnings",
    description:
      "Use brand source footage, publish approved short clips, and earn from verified view growth.",
    trustedDescription:
      "Your clips are approved instantly and start tracking right away, without the review wait.",
    metricDetail: "Across performance clips",
    listEyebrow: "Creator clips",
    listTitle: "Your Clips",
    emptyTitle: "No clips yet",
    emptyDescription: "Submit your first clip to start earning per verified view.",
    submitEyebrow: "Submit clipping work",
    submitTitle: "Submit an edited clip",
    campaignLabel: "Clipping campaign",
    pickCampaignError: "Pick a clipping campaign.",
    joinRequiredError: "Join this campaign before submitting clips.",
    pasteUrlError: "Paste your published clip URL.",
    submitSuccess: "Clip submitted!",
    submitSuccessDescription: "It will start earning once the brand approves it.",
    submitError: "Could not submit clip.",
    joinSuccess: "Joined! You can now submit clips.",
    joinDescription: "Join this campaign to access the source footage and submit edited clips.",
    urlLabel: "Published clip URL",
    urlPlaceholder: "https://youtube.com/shorts/...",
    submitButton: "Submit clip",
    multipleNote: "You can submit multiple clips. Each is reviewed, then tracked for verified views.",
    baselineNote:
      "Views your video earned before submission are recorded as a non-billable baseline - only growth from submission onward is paid. Submit soon after posting.",
    complianceNote:
      "EU advertising rules: clearly disclose the paid partnership in the video or caption (e.g. #ad / #sponsorizzato) before any 'more' fold.",
    itemPlural: "clips",
    briefTitle: "Source asset kit",
    briefEmpty: "Select a clipping campaign to view the source footage and edit rules.",
  },
  ugc: {
    category: "ugc",
    icon: FileText,
    eyebrow: "UGC campaigns",
    title: "UGC Posts & Earnings",
    description:
      "Create original sponsored content from brand briefs, publish it, and earn from verified view growth.",
    trustedDescription:
      "Your UGC posts are approved instantly and start tracking right away, without the review wait.",
    metricDetail: "Across UGC posts",
    listEyebrow: "Creator UGC",
    listTitle: "Your UGC Posts",
    emptyTitle: "No UGC posts yet",
    emptyDescription: "Submit your first original post after joining a UGC campaign.",
    submitEyebrow: "Submit original content",
    submitTitle: "Submit a UGC post",
    campaignLabel: "UGC campaign",
    pickCampaignError: "Pick a UGC campaign.",
    joinRequiredError: "Join this campaign before submitting UGC posts.",
    pasteUrlError: "Paste your published UGC post URL.",
    submitSuccess: "UGC post submitted!",
    submitSuccessDescription: "It will start earning once the brand approves it.",
    submitError: "Could not submit UGC post.",
    joinSuccess: "Joined! You can now submit UGC posts.",
    joinDescription: "Join this campaign to access the creative brief and submit original posts.",
    urlLabel: "Published UGC URL",
    urlPlaceholder: "https://youtube.com/shorts/...",
    submitButton: "Submit UGC post",
    multipleNote: "You can submit multiple original posts if the brand brief allows it.",
    baselineNote:
      "Views your post earned before submission are recorded as a non-billable baseline - only growth from submission onward is paid. Submit soon after posting.",
    complianceNote:
      "EU advertising rules: clearly disclose the paid partnership in the video or caption (e.g. #ad / #sponsorizzato) before any 'more' fold.",
    itemPlural: "posts",
    briefTitle: "UGC brief",
    briefEmpty: "Select a UGC campaign to view the creative direction and content rules.",
  },
};

const STATUS_STYLES: Record<ClipStatus, { label: string; tone: CreatorTone }> = {
  pending: { label: "Pending review", tone: "warning" },
  approved: { label: "Approved", tone: "accent" },
  tracking: { label: "Tracking live", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
  disqualified: { label: "Disqualified", tone: "danger" },
};

function money(value: number) {
  return formatMoneyCompact(value);
}

function metaText(meta: Record<string, unknown> | null | undefined, key: string): string {
  const value = meta?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function metaNumber(meta: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = meta?.[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Coarse relative label for view-verification freshness. */
function verifiedAgoLabel(iso: string | null | undefined, t: (s: string) => string): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return t("Views verified just now");
  if (minutes < 60) return `${t("Views verified")} ${minutes} min ${t("ago")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${t("Views verified")} ${hours} h ${t("ago")}`;
  return `${t("Views verified")} ${Math.floor(hours / 24)} d ${t("ago")}`;
}

function PoolProgress({ campaign }: { campaign: PerfCampaign }) {
  const { t } = useTranslation();
  const pool = Number(campaign.available_pool ?? campaign.budget_pool ?? 0);
  if (!Number.isFinite(pool) || pool <= 0) return null;
  const used = Number(campaign.budget_reserved ?? 0) + Number(campaign.budget_paid ?? 0);
  const usedPct = Math.min(Math.max(used / pool, 0), 1);
  const remaining = Math.max(pool - used, 0);

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="creator-label text-white/35">{t("Pool remaining")}</p>
        <p className="text-sm font-bold text-white">{formatMoneyCompact(remaining)}</p>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-[var(--creator-primary)]"
          style={{ width: `${Math.round(usedPct * 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-[10px] text-white/45">
        {Math.round(usedPct * 100)}% {t("of pool used")}
      </p>
    </div>
  );
}

function SourceFootageCard({ sourceUrl }: { sourceUrl: string }) {
  const { t } = useTranslation();

  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center justify-between gap-3 rounded-xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.08)] p-3 text-left transition-colors hover:bg-[rgba(77,142,255,0.13)]"
    >
      <span className="min-w-0">
        <span className="creator-label block text-[var(--creator-primary)]">
          {t("Original full video")}
        </span>
        <span className="mt-1 block truncate text-xs text-white/60">{sourceUrl}</span>
        <span className="mt-1 block text-[10px] font-semibold text-white/35">
          {t("The brand's source material to clip from.")}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgba(77,142,255,0.18)] bg-[rgba(77,142,255,0.10)] px-2.5 py-2 text-[10px] font-bold text-[var(--creator-primary)] group-hover:underline">
        {t("Open source footage")}
        <ExternalLink size={12} />
      </span>
    </a>
  );
}

function CampaignBriefPanel({
  campaign,
  copy,
}: {
  campaign?: PerfCampaign;
  copy: FlowCopy;
}) {
  const { t } = useTranslation();
  const Icon = copy.icon;
  const meta = campaign?.category_meta ?? null;

  if (!campaign) {
    return (
      <CreatorGlassCard>
        <CreatorEmptyState icon={Icon} title={t(copy.briefTitle)} description={t(copy.briefEmpty)} />
      </CreatorGlassCard>
    );
  }

  if (copy.category === "clipping") {
    const sourceUrl = metaText(meta, "source_url");
    const minSec = metaNumber(meta, "min_duration_sec");
    const maxSec = metaNumber(meta, "max_duration_sec");
    const requirements = metaText(meta, "requirements");

    return (
      <CreatorGlassCard>
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.10)] text-[var(--creator-primary)]">
            <Scissors size={17} />
          </span>
          <div>
            <p className="creator-label text-white/35">{t("Clipping spec")}</p>
            <h2 className="mt-1 text-lg font-semibold text-white">{t(copy.briefTitle)}</h2>
          </div>
        </div>
        <div className="space-y-3 text-xs leading-5 text-white/60">
          <PoolProgress campaign={campaign} />
          {sourceUrl ? <SourceFootageCard sourceUrl={sourceUrl} /> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <p className="creator-label text-white/35">{t("Min length")}</p>
              <p className="mt-1 font-semibold text-white">{minSec ?? "-"}s</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <p className="creator-label text-white/35">{t("Max length")}</p>
              <p className="mt-1 font-semibold text-white">{maxSec ?? "-"}s</p>
            </div>
          </div>
          {requirements ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <p className="creator-label mb-2 text-white/35">{t("Clip requirements")}</p>
              <p>{requirements}</p>
            </div>
          ) : null}
        </div>
      </CreatorGlassCard>
    );
  }

  const creativeDirection = metaText(meta, "creative_direction");
  const references = metaText(meta, "references");
  const dos = metaText(meta, "dos");
  const donts = metaText(meta, "donts");

  return (
    <CreatorGlassCard>
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl border border-[rgba(245,158,11,0.22)] bg-[rgba(245,158,11,0.10)] text-[var(--creator-warning)]">
          <FileText size={17} />
        </span>
        <div>
          <p className="creator-label text-white/35">{t("Original content brief")}</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{t(copy.briefTitle)}</h2>
        </div>
      </div>
      <div className="space-y-3 text-xs leading-5 text-white/60">
        <PoolProgress campaign={campaign} />
        {creativeDirection ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <p className="creator-label mb-2 text-white/35">{t("Creative direction")}</p>
            <p>{creativeDirection}</p>
          </div>
        ) : null}
        {references ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <p className="creator-label mb-2 text-white/35">{t("References")}</p>
            <p>{references}</p>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {dos ? (
            <div className="rounded-xl border border-[rgba(52,211,153,0.16)] bg-[rgba(52,211,153,0.05)] p-3">
              <p className="creator-label mb-2 text-[var(--creator-success)]">{t("Do's")}</p>
              <p>{dos}</p>
            </div>
          ) : null}
          {donts ? (
            <div className="rounded-xl border border-[rgba(248,113,113,0.16)] bg-[rgba(248,113,113,0.05)] p-3">
              <p className="creator-label mb-2 text-[var(--creator-danger)]">{t("Don'ts")}</p>
              <p>{donts}</p>
            </div>
          ) : null}
        </div>
      </div>
    </CreatorGlassCard>
  );
}

export function PerformanceSubmissionFlow({ category }: { category: CampaignCategory }) {
  const { t } = useTranslation();
  const copy = FLOW_COPY[category];
  const Icon = copy.icon;
  const { clips, loading, submitClip } = useCreatorClips({ category });
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
  const selected = campaigns.find((c) => c.id === selectedCampaign);
  const selectedOfferedCpm = selected?.cpm_rate ?? null;
  const selectedSourceUrl =
    category === "clipping" ? metaText(selected?.category_meta ?? null, "source_url") : "";

  const loadCampaigns = useCallback(async () => {
    const { data } = await supabase
      .from("campaigns")
      .select(
        "id, title, cpm_rate, platforms, category_meta, budget_pool, available_pool, budget_reserved, budget_paid"
      )
      .eq("campaign_type", "performance")
      .eq("campaign_category", category)
      .in("status", ["open", "in_progress"])
      .contains("platforms", ["youtube"])
      .order("created_at", { ascending: false })
      .limit(100);
    const list = ((data ?? []) as PerfCampaign[]).filter((campaign) =>
      (campaign.platforms ?? []).includes("youtube")
    );
    const campaignFromUrl =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("campaign")
        : null;
    setCampaigns(list);
    setSelectedCampaign((current) => {
      if (current && list.some((campaign) => campaign.id === current)) return current;
      if (campaignFromUrl && list.some((campaign) => campaign.id === campaignFromUrl)) {
        return campaignFromUrl;
      }
      return list[0]?.id ?? "";
    });
  }, [category]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadCampaigns();
    getClientProfile()
      .then((profile) => setTrusted(profile?.trusted_creator === true))
      .catch(() => {});
  }, [loadCampaigns]);

  const handleJoin = async () => {
    if (!selectedCampaign) {
      toast.error(t(copy.pickCampaignError));
      return;
    }
    setJoining(true);
    const res = await join(selectedCampaign);
    setJoining(false);
    if (res.ok) {
      toast.success(res.alreadyJoined ? t("You're already in this campaign.") : t(copy.joinSuccess));
    } else {
      toast.error(res.error || t("Could not join campaign."));
    }
  };

  const handleSubmit = async () => {
    if (!selectedCampaign) {
      toast.error(t(copy.pickCampaignError));
      return;
    }
    if (!isJoined) {
      toast.error(t(copy.joinRequiredError));
      return;
    }
    if (!postUrl.trim()) {
      toast.error(t(copy.pasteUrlError));
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
      toast.success(t(copy.submitSuccess), {
        description: t(copy.submitSuccessDescription),
      });
      setPostUrl("");
    } else {
      toast.error(res.error || t(copy.submitError));
    }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    toast.loading(t("Preparing withdrawal..."), { id: "creator-withdrawal" });
    const res = await withdraw();
    setWithdrawing(false);
    if (res.ok) {
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

  const rateExample = useMemo(() => {
    if (!selectedOfferedCpm) return null;
    return formatMoney(Number(selectedOfferedCpm) * 100, { maximumFractionDigits: 0 });
  }, [selectedOfferedCpm]);

  return (
    <CreatorPageShell>
      <CreatorSectionHeader
        eyebrow={t(copy.eyebrow)}
        title={t(copy.title)}
        description={t(copy.description)}
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
              <p className="mt-1 text-xs leading-5 text-white/55">{t(copy.trustedDescription)}</p>
            </div>
          </div>
        </CreatorGlassCard>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CreatorMetricCard
          label={t("Gross earnings")}
          value={money(grossEarnings)}
          icon={TrendingUp}
          detail={t("All performance campaigns")}
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
          detail={t(category === "ugc" ? "Across tracking posts" : "Across tracking clips")}
          tone="violet"
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(330px,0.85fr)]">
        <div className="space-y-4">
          <CreatorGlassCard>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="creator-label text-white/35">{t(copy.listEyebrow)}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{t(copy.listTitle)}</h2>
              </div>
              <CreatorStatusPill tone="neutral">
                {clips.length} {t(copy.itemPlural)}
              </CreatorStatusPill>
            </div>

            {loading ? (
              <div className="flex h-44 items-center justify-center text-white/45">
                <Loader2 className="animate-spin" />
              </div>
            ) : clips.length === 0 ? (
              <CreatorEmptyState
                icon={Link2}
                title={t(copy.emptyTitle)}
                description={t(copy.emptyDescription)}
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
                            <span className="text-[10px] capitalize text-white/40">{clip.platform}</span>
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
                            <span className="flex items-center justify-end gap-1 text-[10px] font-semibold uppercase text-white/35">
                              <Eye size={11} /> {t("Views")}
                            </span>
                            <p className="mt-1 text-sm font-bold text-white">{clip.current_views.toLocaleString()}</p>
                            {clip.status === "tracking" ? (
                              <span className="mt-0.5 block text-[9px] text-white/35">
                                {verifiedAgoLabel(clip.last_synced_at, t) ?? t("Awaiting first verification")}
                              </span>
                            ) : null}
                          </div>
                          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3 text-right">
                            <span className="flex items-center justify-end gap-1 text-[10px] font-semibold uppercase text-white/35">
                              <DollarSign size={11} /> {t("Earned")}
                            </span>
                            <p className="mt-1 text-sm font-bold text-[var(--creator-success)]">
                              {money(clip.estimated_earnings)}
                            </p>
                            {clip.creator_cpm != null ? (
                              <span className="mt-0.5 block text-[9px] text-white/35">
                                @ {formatMoney(Number(clip.creator_cpm))} {t("CPM")}
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
                <p className="creator-label text-white/35">{t(copy.submitEyebrow)}</p>
                <h2 className="mt-1 text-lg font-semibold text-white">{t(copy.submitTitle)}</h2>
              </div>
              <Icon size={20} className="text-[var(--creator-primary)]" />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="creator-label block text-white/40">{t(copy.campaignLabel)}</label>
                <select
                  value={selectedCampaign}
                  onChange={(event) => setSelectedCampaign(event.target.value)}
                  className="creator-input w-full rounded-xl px-3 py-3 text-sm"
                >
                  {campaigns.length === 0 ? <option value="">{t("No open campaigns")}</option> : null}
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id} className="bg-slate-950">
                      {campaign.title}
                    </option>
                  ))}
                </select>
              </div>

              {!isJoined ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <p className="creator-label text-white/35">{t("Brand rate")}</p>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white">
                        {formatMoney(Number(selectedOfferedCpm ?? 0), {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-xs text-white/45">{t("CPM per 1,000 views")}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/45">
                      {rateExample
                        ? t("Earn {per100k} per 100k views at the brand's rate.").replace(
                            "{per100k}",
                            rateExample
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
                  <p className="text-xs leading-5 text-white/45">{t(copy.joinDescription)}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedSourceUrl ? <SourceFootageCard sourceUrl={selectedSourceUrl} /> : null}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="creator-label block text-white/40">{t(copy.urlLabel)}</label>
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--creator-success)]">
                        <CheckCircle2 size={10} /> {t("Joined")}
                      </span>
                    </div>
                    <input
                      type="url"
                      placeholder={copy.urlPlaceholder}
                      value={postUrl}
                      onChange={(event) => setPostUrl(event.target.value)}
                      className="creator-input w-full rounded-xl px-3 py-3 text-sm placeholder:text-white/30"
                    />
                  </div>
                  <Button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="creator-gradient-accent h-11 w-full rounded-xl border-0 text-xs font-semibold text-white hover:brightness-105"
                  >
                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    {t(copy.submitButton)}
                  </Button>
                  <p className="text-xs leading-5 text-white/45">{t(copy.multipleNote)}</p>
                  <p className="text-xs leading-5 text-white/45">{t(copy.baselineNote)}</p>
                  <p className="text-xs leading-5 text-white/45">{t(copy.complianceNote)}</p>
                </div>
              )}
            </div>
          </CreatorGlassCard>

          <CampaignBriefPanel campaign={selected} copy={copy} />

          <CreatorGlassCard>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="creator-label text-white/35">{t("Available balance")}</p>
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
            <p className="mt-3 text-xs leading-5 text-white/45">
              {t("Only cleared earnings can be withdrawn. Holdback earnings become available automatically.")}
            </p>
          </CreatorGlassCard>

          <CreatorGlassCard>
            <p className="creator-label mb-3 text-white/35">{t("Recent performance payouts")}</p>
            {payouts.length === 0 ? (
              <p className="text-xs text-white/45">{t("No payouts yet.")}</p>
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
                        <p className="mt-0.5 text-[10px] text-white/35">{payout.status}</p>
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
