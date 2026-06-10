import { useCallback, useEffect, useState } from "react";
import { supabase } from "./client";
import { apiPost } from "@/lib/api/client";
import { payoutForViews } from "@/lib/earnings";
import { requestWithdrawalAction } from "@/lib/stripe/actions";
import type { CampaignCategory } from "@/lib/campaign-category";

export interface WithdrawResult {
  ok: boolean;
  gross?: number;
  net?: number;
  fee?: number;
  error?: string;
}

/**
 * Data layer for the performance-clipping UI.
 *
 * Real mode only: reads clips/earnings/payouts via Supabase (RLS-scoped) and
 * mutates through the API routes (/api/clips, /api/clips/[id]/approve|reject|…).
 *
 * Status mapping (DB -> creator-facing meaning):
 *   pending      -> awaiting brand review
 *   tracking     -> approved & accruing views/earnings
 *   rejected     -> declined by brand
 *   disqualified -> blocked (fraud / rule violation)
 */

export type ClipStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "tracking"
  | "disqualified";

/** Brand quality-review decision (sits on top of the operational status). */
export type QualityStatus =
  | "pending_review"
  | "approved"
  | "changes_requested"
  | "rejected";

export interface CreatorClip {
  id: string;
  campaign_id: string;
  campaignTitle: string;
  campaignCategory?: CampaignCategory | null;
  platform: string;
  post_url: string;
  status: ClipStatus;
  current_views: number;
  estimated_earnings: number;
  creator_cpm?: number;
  submitted_at: string;
  approval_deadline?: string | null;
  auto_approved?: boolean;
  quality_status?: QualityStatus;
  quality_notes?: string | null;
  quality_score?: number | null;
  /** When the platform last verified this clip's views (view-sync worker). */
  last_synced_at?: string | null;
}

export interface EarningsBreakdown {
  inHoldback: number; // db 'accrued'
  readyForPayout: number; // db 'approved'
  paid: number; // db 'paid'
}

export interface PayoutRecord {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  stripe_transfer_id?: string | null;
}

export interface ModerationClip {
  id: string;
  campaign_id: string;
  campaignTitle: string;
  campaignCategory?: "ugc" | "clipping" | null;
  creatorName: string;
  platform: string;
  post_url: string;
  status: ClipStatus;
  current_views: number;
  creatorCpm?: number;
  submitted_at: string;
  approval_deadline?: string | null;
  fraud_score?: number;
  fraud_reasons?: string[];
}

/** Fallback CPM used only if a campaign row is missing its rate. */
const DEFAULT_CPM = 2.5;

export interface JoinResult {
  ok: boolean;
  alreadyJoined?: boolean;
  error?: string;
}

/**
 * Creator: which performance campaigns the creator has joined, plus a join()
 * action that calls POST /api/campaigns/[id]/join. Clip submission is gated on
 * membership of joinedIds.
 */
export function useJoinedCampaigns() {
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("participations")
      .select("campaign_id")
      .eq("influencer_id", user.id)
      .eq("status", "active");
    setJoinedIds(
      new Set(((data ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
    if (typeof window === "undefined") return;
    const handler = () => load();
    window.addEventListener("aether-clips-update", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("aether-clips-update", handler);
      window.removeEventListener("storage", handler);
    };
  }, [load]);

  const join = useCallback(
    async (campaignId: string): Promise<JoinResult> => {
      try {
        const res = await apiPost<{ alreadyJoined?: boolean }>(
          `/api/campaigns/${campaignId}/join`,
          {}
        );
        await load();
        return { ok: true, alreadyJoined: res.alreadyJoined };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not join campaign.",
        };
      }
    },
    [load]
  );

  return { joinedIds, loading, join, refresh: load };
}

/** Creator: list + submit performance posts, optionally scoped by category. */
export function useCreatorClips(options: { category?: CampaignCategory } = {}) {
  const { category } = options;
  const [clips, setClips] = useState<CreatorClip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    // !inner join so the category filter runs in the QUERY — filtering
    // client-side after the row limit would starve one category's page for
    // creators whose other-category posts fill the limit.
    let query = supabase
      .from("clips")
      .select(
        "id, campaign_id, platform, post_url, status, current_views, created_at, submitted_at, approval_deadline, auto_approved, quality_status, quality_notes, quality_score, last_synced_at, campaign:campaign_id!inner(title, cpm_rate, campaign_category)"
      )
      .eq("creator_id", user.id);
    if (category) {
      query = query.eq("campaign.campaign_category", category);
    }
    const { data } = await query.order("created_at", { ascending: false }).limit(200);

    type Row = {
      id: string;
      campaign_id: string;
      platform: string;
      post_url: string;
      status: ClipStatus;
      current_views: number | null;
      created_at: string;
      submitted_at: string | null;
      approval_deadline: string | null;
      auto_approved: boolean | null;
      quality_status: QualityStatus | null;
      quality_notes: string | null;
      quality_score: number | null;
      last_synced_at: string | null;
      campaign: {
        title?: string;
        cpm_rate?: number | null;
        campaign_category?: "ugc" | "clipping" | null;
      } | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    setClips(
      rows.map((r) => {
        const views = Number(r.current_views ?? 0);
        const cpm = Number(r.campaign?.cpm_rate ?? DEFAULT_CPM);
        return {
          id: r.id,
          campaign_id: r.campaign_id,
          campaignTitle: r.campaign?.title ?? "Campaign",
          campaignCategory: r.campaign?.campaign_category ?? null,
          platform: r.platform,
          post_url: r.post_url,
          status: r.status,
          current_views: views,
          estimated_earnings: payoutForViews(views, cpm),
          creator_cpm: cpm,
          submitted_at: r.submitted_at ?? r.created_at,
          approval_deadline: r.approval_deadline,
          auto_approved: r.auto_approved ?? false,
          quality_status: r.quality_status ?? "pending_review",
          quality_notes: r.quality_notes,
          quality_score: r.quality_score,
          last_synced_at: r.last_synced_at,
        };
      })
    );
    setLoading(false);
  }, [category]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
    if (typeof window === "undefined") return;
    const handler = () => load();
    window.addEventListener("aether-clips-update", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("aether-clips-update", handler);
      window.removeEventListener("storage", handler);
    };
  }, [load]);

  const submitClip = useCallback(
    async (campaignId: string, postUrl: string) => {
      try {
        await apiPost(category === "ugc" ? "/api/ugc-submissions" : "/api/clips", {
          campaign_id: campaignId,
          post_url: postUrl,
        });
        await load();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not submit clip.",
        };
      }
    },
    [category, load]
  );

  return { clips, loading, refresh: load, submitClip };
}

/** Creator: earnings breakdown + payout history. */
export function useCreatorEarnings() {
  const [breakdown, setBreakdown] = useState<EarningsBreakdown>({
    inHoldback: 0,
    readyForPayout: 0,
    paid: 0,
  });
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const [{ data: earnings }, { data: payoutRows }] = await Promise.all([
      supabase.from("earnings").select("amount, status").eq("creator_id", user.id),
      supabase
        .from("payouts")
        .select("id, amount, status, created_at, stripe_transfer_id")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    const next: EarningsBreakdown = { inHoldback: 0, readyForPayout: 0, paid: 0 };
    ((earnings ?? []) as { amount: number | string; status: string }[]).forEach((e) => {
      const amt = Number(e.amount) || 0;
      if (e.status === "accrued") next.inHoldback += amt;
      else if (e.status === "approved") next.readyForPayout += amt;
      else if (e.status === "paid") next.paid += amt;
    });
    setBreakdown(next);
    setPayouts((payoutRows ?? []) as PayoutRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
    if (typeof window === "undefined") return;
    const handler = () => load();
    window.addEventListener("aether-clips-update", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("aether-clips-update", handler);
      window.removeEventListener("storage", handler);
    };
  }, [load]);

  /**
   * Withdraw the available (approved, cleared-holdback) balance via the atomic
   * claim → transfer → settle server action. Returns the gross/net/fee breakdown.
   */
  const withdraw = useCallback(async (): Promise<WithdrawResult> => {
    const res = await requestWithdrawalAction();
    if (res.success) {
      await load();
      const r = res as { gross?: number; net?: number; fee?: number };
      return { ok: true, gross: r.gross, net: r.net, fee: r.fee };
    }
    return {
      ok: false,
      error: (res as { error?: string }).error || "Withdrawal failed.",
    };
  }, [load]);

  return { breakdown, payouts, loading, refresh: load, withdraw };
}

/** Brand: pending clips to moderate + fraud-flagged tracking clips to review. */
export function useBrandModeration(campaignId?: string) {
  const [clips, setClips] = useState<ModerationClip[]>([]);
  const [flagged, setFlagged] = useState<ModerationClip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    type Row = {
      id: string;
      campaign_id: string;
      creator_id: string;
      platform: string;
      post_url: string;
      status: ClipStatus;
      current_views: number | null;
      created_at: string;
      submitted_at: string | null;
      approval_deadline?: string | null;
      fraud_score?: number | null;
      fraud_reasons?: string[] | null;
      campaign: {
        title?: string;
        cpm_rate?: number | null;
        campaign_category?: "ugc" | "clipping" | null;
      } | null;
      creator: { email?: string } | null;
    };

    // Pending review queue + fraud-flagged tracking clips, in parallel.
    let pendingQuery = supabase
      .from("clips")
      .select(
        "id, campaign_id, creator_id, platform, post_url, status, current_views, created_at, submitted_at, approval_deadline, campaign:campaign_id(title, cpm_rate, campaign_category), creator:creator_id(email)"
      )
      .eq("status", "pending")
      .eq("quality_status", "pending_review")
      .order("created_at", { ascending: false });
    let flaggedQuery = supabase
      .from("clips")
      .select(
        "id, campaign_id, creator_id, platform, post_url, status, current_views, created_at, submitted_at, fraud_score, fraud_reasons, campaign:campaign_id(title, cpm_rate, campaign_category), creator:creator_id(email)"
      )
      .eq("status", "tracking")
      .eq("fraud_flagged", true)
      .order("fraud_score", { ascending: false });
    if (campaignId) {
      pendingQuery = pendingQuery.eq("campaign_id", campaignId);
      flaggedQuery = flaggedQuery.eq("campaign_id", campaignId);
    }

    const [{ data: pendingData }, { data: flaggedData }] = await Promise.all([
      pendingQuery,
      flaggedQuery,
    ]);
    const pendingRows = (pendingData ?? []) as unknown as Row[];
    const flaggedRows = (flaggedData ?? []) as unknown as Row[];

    // Resolve creator display names for both sets in ONE batched query (no N+1).
    const creatorIds = [
      ...new Set([...pendingRows, ...flaggedRows].map((r) => r.creator_id).filter(Boolean)),
    ];
    const nameById = new Map<string, string>();
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", creatorIds);
      ((profiles ?? []) as { user_id: string; full_name: string | null }[]).forEach(
        (p) => {
          if (p.full_name?.trim()) nameById.set(p.user_id, p.full_name);
        }
      );
    }

    const toClip = (r: Row): ModerationClip => ({
      id: r.id,
      campaign_id: r.campaign_id,
      campaignTitle: r.campaign?.title ?? "Campaign",
      campaignCategory: r.campaign?.campaign_category ?? null,
      creatorName: nameById.get(r.creator_id) || r.creator?.email || "Unknown creator",
      platform: r.platform,
      post_url: r.post_url,
      status: r.status,
      current_views: Number(r.current_views ?? 0),
      creatorCpm: Number(r.campaign?.cpm_rate ?? DEFAULT_CPM),
      submitted_at: r.submitted_at ?? r.created_at,
      approval_deadline: r.approval_deadline ?? null,
      fraud_score: r.fraud_score ?? undefined,
      fraud_reasons: r.fraud_reasons ?? undefined,
    });

    setClips(pendingRows.map(toClip));
    setFlagged(flaggedRows.map(toClip));
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
    if (typeof window === "undefined") return;
    const handler = () => load();
    window.addEventListener("aether-clips-update", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("aether-clips-update", handler);
      window.removeEventListener("storage", handler);
    };
  }, [load]);

  const moderate = useCallback(
    async (
      clipId: string,
      action: "approve" | "reject" | "request_changes" | "disqualify",
      opts?: { reason?: string; score?: number }
    ) => {
      try {
        const route = action === "request_changes" ? "request-changes" : action;
        const body: Record<string, unknown> = {};
        if (opts?.reason) body.reason = opts.reason;
        if (opts?.score) body.quality_score = opts.score;
        await apiPost(`/api/clips/${clipId}/${route}`, body);
        await load();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Moderation failed.",
        };
      }
    },
    [load]
  );

  // Brand override of a fraud flag: clears the flag and keeps the clip earning.
  const override = useCallback(
    async (clipId: string) => {
      try {
        await apiPost(`/api/clips/${clipId}/fraud-override`, {});
        await load();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Override failed.",
        };
      }
    },
    [load]
  );

  return { clips, flagged, loading, refresh: load, moderate, override };
}
