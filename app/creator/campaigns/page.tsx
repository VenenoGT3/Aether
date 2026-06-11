"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  Check,
  DollarSign,
  FileText,
  FolderLock,
  Layers,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  CreatorActionButton,
  CreatorEmptyState,
  CreatorGlassCard,
  CreatorPageShell,
  CreatorProgressBar,
  CreatorSectionHeader,
  CreatorStatusPill,
  type CreatorTone,
} from "@/components/creator/creator-ui";
import { getClientProfile, supabase } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/translations";

interface CampaignParticipation {
  participationId: string;
  campaignId: string;
  title: string;
  brandName: string;
  proposedPayout: number;
  status:
    | "applied"
    | "offered"
    | "accepted"
    | "declined"
    | "escrowed"
    | "submitted"
    | "released"
    | "completed"
    | "cancelled"
    | "in_progress";
  appliedAt: string;
  deliverableType: string;
}

interface RawParticipationRow {
  id: string;
  campaign_id: string;
  proposed_payout: number;
  status: CampaignParticipation["status"];
  applied_at?: string;
  campaign?: {
    title?: string;
    deliverables?: Array<{ type?: string }>;
  } | null;
}

function statusTone(status: CampaignParticipation["status"]): CreatorTone {
  if (status === "released" || status === "completed") return "success";
  if (status === "declined" || status === "cancelled") return "danger";
  if (status === "offered" || status === "submitted") return "warning";
  if (status === "accepted" || status === "escrowed" || status === "in_progress") return "accent";
  return "violet";
}

function milestoneStep(status: CampaignParticipation["status"]) {
  switch (status) {
    case "applied":
    case "offered":
      return 1;
    case "accepted":
    case "escrowed":
    case "in_progress":
      return 2;
    case "submitted":
      return 3;
    case "released":
    case "completed":
      return 4;
    default:
      return 1;
  }
}

export default function InfluencerCampaignsPage() {
  const { t } = useTranslation();
  const [participations, setParticipations] = useState<CampaignParticipation[]>([]);
  const [activeTab, setActiveTab] = useState<"applied" | "active" | "completed">("active");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const profile = await getClientProfile();
      const influencerId = profile?.user_id;
      if (!influencerId) {
        setParticipations([]);
        return;
      }

      const { data, error } = await supabase
        .from("participations")
        .select(`
          *,
          campaign:campaign_id (*)
        `)
        .eq("influencer_id", influencerId);

      if (error) throw error;

      setParticipations(
        ((data || []) as RawParticipationRow[]).map((participation) => ({
          participationId: participation.id,
          campaignId: participation.campaign_id,
          title: participation.campaign?.title || "Campaign",
          brandName: "Brand",
          proposedPayout: Number(participation.proposed_payout),
          status: participation.status,
          appliedAt: participation.applied_at || new Date().toISOString(),
          deliverableType: participation.campaign?.deliverables?.[0]?.type || "deliverable",
        }))
      );
    } catch (error) {
      console.error("Error loading creator campaigns:", error);
      toast.error(t("Failed to load campaign contracts."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadData();
    const handleSync = () => {
      loadData();
    };
    window.addEventListener("aether-campaigns-update", handleSync);
    window.addEventListener("role-change", handleSync);
    return () => {
      window.removeEventListener("aether-campaigns-update", handleSync);
      window.removeEventListener("role-change", handleSync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- page-level bootstrap
  }, []);

  const appliedList = participations.filter(
    (p) => p.status === "applied" || p.status === "offered" || p.status === "declined"
  );
  const activeList = participations.filter(
    (p) => p.status === "accepted" || p.status === "in_progress" || p.status === "escrowed" || p.status === "submitted"
  );
  const completedList = participations.filter(
    (p) => p.status === "completed" || p.status === "released" || p.status === "cancelled"
  );
  const currentList =
    activeTab === "applied" ? appliedList : activeTab === "active" ? activeList : completedList;

  const tabs = [
    { id: "applied" as const, label: t("Applied"), count: appliedList.length },
    { id: "active" as const, label: t("Active"), count: activeList.length },
    { id: "completed" as const, label: t("Completed"), count: completedList.length },
  ];

  return (
    <CreatorPageShell maxWidth="content">
      <CreatorSectionHeader
        eyebrow={t("Contract stage view")}
        title={t("Contracts")}
        description={t("Manage submitted pitches, active escrow work, deliverables, and completed payout releases.")}
        action={
          <CreatorActionButton href="/creator/discover">
            <Sparkles size={15} />
            {t("Discover Campaigns")}
          </CreatorActionButton>
        }
      />

      <CreatorGlassCard className="mt-8 p-1">
        <div className="grid grid-cols-3 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors ${
                activeTab === tab.id ? "text-white" : "text-white/45 hover:text-white"
              }`}
            >
              {activeTab === tab.id ? (
                <motion.span
                  layoutId="creatorContractTab"
                  className="absolute inset-0 rounded-xl bg-[var(--creator-primary)]"
                  transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.8 }}
                />
              ) : null}
              <span className="relative z-10">{tab.label}</span>
              <span className="relative z-10 ml-1 text-white/60">({tab.count})</span>
            </button>
          ))}
        </div>
      </CreatorGlassCard>

      {loading ? (
        <div className="mt-6 space-y-4">
          {[1, 2].map((item) => (
            <CreatorGlassCard key={item} className="h-48 animate-pulse" />
          ))}
        </div>
      ) : currentList.length === 0 ? (
        <div className="mt-6">
          <CreatorEmptyState
            icon={Layers}
            title={t("No campaigns found")}
            description={
              activeTab === "applied"
                ? t("You haven't submitted any campaign pitches yet.")
                : activeTab === "active"
                  ? t("No active contracts. Express interest in live briefs to get hired.")
                  : t("Completed collaborations will show up here after payout release.")
            }
          />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 space-y-4">
          <AnimatePresence mode="popLayout">
            {currentList.map((item) => {
              const step = milestoneStep(item.status);
              const progress = ((step - 1) / 3) * 100;
              const disabled = item.status === "declined" || item.status === "cancelled";

              return (
                <motion.article
                  key={item.participationId}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 330, damping: 26 }}
                  className="creator-glass rounded-2xl transition-all hover:-translate-y-0.5 hover:border-white/15"
                >
                  <Link href={`/campaigns/${item.campaignId}`} className="block p-5">
                    <div className="flex flex-col gap-5">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <CreatorStatusPill tone={statusTone(item.status)}>
                              {item.status === "applied" ? t("Pitch Submitted") : t(item.status.replace("_", " "))}
                            </CreatorStatusPill>
                            {item.status === "offered" ? (
                              <CreatorStatusPill tone="warning">
                                <Sparkles size={10} />
                                {t("Offer Received")}
                              </CreatorStatusPill>
                            ) : null}
                          </div>
                          <h3 className="text-lg font-semibold leading-snug text-white">{item.title}</h3>
                          <p className="mt-1 text-xs text-white/50">
                            {t("Brand:")} <span className="font-semibold text-white/80">{item.brandName}</span>
                          </p>
                        </div>

                        <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-left sm:text-right">
                          <p className="creator-label text-white/35">{t("Proposed payout")}</p>
                          <p className="mt-1 flex items-center text-xl font-bold text-white sm:justify-end">
                            <DollarSign size={16} />
                            {item.proposedPayout.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {!disabled ? (
                        <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="creator-label text-white/35">{t("Contract timeline progress")}</p>
                            <span className="text-xs font-semibold text-white/70">
                              {item.status === "applied" && t("Awaiting brand review")}
                              {item.status === "offered" && t("Review brand offer")}
                              {(item.status === "accepted" || item.status === "escrowed" || item.status === "in_progress") &&
                                t("Content creation stage")}
                              {item.status === "submitted" && t("Deliverable under review")}
                              {(item.status === "released" || item.status === "completed") && t("Collaboration completed")}
                            </span>
                          </div>
                          <CreatorProgressBar value={progress} />
                          <div className="grid grid-cols-4 text-[9px] font-semibold text-white/35">
                            <span className={step >= 1 ? "text-[var(--creator-primary)]" : ""}>{t("Applied")}</span>
                            <span className={step >= 2 ? "text-[var(--creator-primary)]" : ""}>{t("Escrow")}</span>
                            <span className={step >= 3 ? "text-[var(--creator-primary)]" : ""}>{t("Draft")}</span>
                            <span className={`text-right ${step >= 4 ? "text-[var(--creator-success)]" : ""}`}>{t("Paid")}</span>
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-col gap-3 border-t border-white/5 pt-4 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-4">
                          <span className="flex items-center gap-1.5">
                            <Calendar size={13} />
                            {t("Applied:")}{" "}
                            {new Date(item.appliedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                          <span className="flex items-center gap-1.5 capitalize">
                            <FolderLock size={13} />
                            {t("Deliverable:")} {t(item.deliverableType.replace("_", " "))}
                          </span>
                        </div>
                        <span className="inline-flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/50">
                          <ArrowRight size={15} />
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CreatorGlassCard className="p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[var(--creator-primary)]">
              <FileText size={18} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">{t("Deliverable workflow")}</h2>
              <p className="mt-1 text-xs leading-5 text-white/50">
                {t("Contracts link into campaign detail pages where creators can review scope, status, and submission requirements.")}
              </p>
            </div>
          </div>
        </CreatorGlassCard>
        <CreatorGlassCard className="p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-[var(--creator-success)]">
              <Check size={18} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-white">{t("Payout safety")}</h2>
              <p className="mt-1 text-xs leading-5 text-white/50">
                {t("Performance clips and fixed-fee contracts stay tied to approval states before earnings are released.")}
              </p>
            </div>
          </div>
        </CreatorGlassCard>
      </div>
    </CreatorPageShell>
  );
}
