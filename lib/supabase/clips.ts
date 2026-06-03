import { useCallback, useEffect, useState } from "react";
import { supabase, isMockMode, getMockUser } from "./client";
import { apiPost } from "@/lib/api/client";
import { addBusinessDays, APPROVAL_WINDOW_BUSINESS_DAYS } from "@/lib/approval";
import { budgetUsage, isNearlyFull, isPoolExhausted } from "@/lib/campaign-budget";
import { WITHDRAWAL_MIN, withdrawalBreakdown } from "@/lib/withdrawal";
import { getCampaignsAction } from "./campaigns";
import { requestWithdrawalAction } from "@/lib/stripe/actions";

export interface WithdrawResult {
  ok: boolean;
  gross?: number;
  net?: number;
  fee?: number;
  error?: string;
}

/**
 * Data layer for the performance-clipping UI (Phase 6).
 *
 * Mock mode persists everything in localStorage (matching lib/supabase/metrics.ts);
 * real mode reads clips/earnings/payouts via Supabase (RLS-scoped) and mutates
 * through the Phase 2/3 API routes (/api/clips, /api/clips/[id]/approve|reject).
 *
 * Status mapping (DB -> creator-facing meaning):
 *   pending      -> awaiting brand review
 *   tracking     -> approved & accruing views/earnings
 *   rejected     -> declined by brand
 *   disqualified -> blocked (fraud / rule violation)
 * Earnings status (DB -> UI bucket):
 *   accrued  -> "In holdback" (pending settle window)
 *   approved -> "Ready for payout"
 *   paid     -> "Paid"
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
  platform: string;
  post_url: string;
  status: ClipStatus;
  current_views: number;
  estimated_earnings: number;
  /** The creator's chosen CPM for this campaign (falls back to the campaign rate). Set in load(). */
  creator_cpm?: number;
  submitted_at: string;
  /** When the brand's 5-working-day review window closes (pending clips). */
  approval_deadline?: string | null;
  /** Reached tracking without an explicit brand review (trust or deadline lapse). */
  auto_approved?: boolean;
  /** Brand quality-review decision + feedback. */
  quality_status?: QualityStatus;
  quality_notes?: string | null;
  quality_score?: number | null;
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
  /** The creator's chosen CPM (falls back to the campaign rate). */
  creatorCpm?: number;
  submitted_at: string;
  /** When the brand's 5-working-day review window closes. */
  approval_deadline?: string | null;
  /** Fraud risk (for the flagged-review list). */
  fraud_score?: number;
  fraud_reasons?: string[];
}

const CLIPS_LS_KEY = "aether-mock-clips";
const EARNINGS_LS_KEY = "aether-mock-clip-earnings";
const PAYOUTS_LS_KEY = "aether-mock-clip-payouts";
const JOINED_LS_KEY = "aether-mock-joined-campaigns";
const DEFAULT_CPM = 2.5;

/**
 * Mock helper: the brand CPM for a campaign. Brand-set model — payouts use the
 * campaign's brand rate (the seeded performance campaign uses DEFAULT_CPM).
 */
function mockCpmFor(): number {
  return DEFAULT_CPM;
}

/**
 * Mock: read clips, ensure each has an approval_deadline, and SWEEP overdue
 * pending clips to 'tracking' (simulating the worker's auto-approve, since the
 * worker only runs against real Supabase). Persists changes without dispatching
 * an update event (avoids a reload loop).
 */
function mockClipsWithApproval(): CreatorClip[] {
  const list = readLs<CreatorClip[]>(CLIPS_LS_KEY, SEED_CLIPS);
  const now = Date.now();
  let changed = false;
  const next = list.map((c) => {
    const deadline =
      c.approval_deadline ??
      addBusinessDays(new Date(c.submitted_at), APPROVAL_WINDOW_BUSINESS_DAYS).toISOString();
    let status = c.status;
    let auto = c.auto_approved ?? false;
    let quality: QualityStatus =
      c.quality_status ??
      (status === "tracking" ? "approved" : status === "rejected" ? "rejected" : "pending_review");
    // Only never-reviewed clips auto-approve on deadline (not changes_requested).
    if (status === "pending" && quality === "pending_review" && new Date(deadline).getTime() <= now) {
      status = "tracking";
      auto = true;
      quality = "approved";
    }
    if (
      c.approval_deadline !== deadline ||
      status !== c.status ||
      auto !== c.auto_approved ||
      quality !== c.quality_status
    ) {
      changed = true;
    }
    return { ...c, approval_deadline: deadline, status, auto_approved: auto, quality_status: quality };
  });
  if (changed && typeof window !== "undefined") {
    localStorage.setItem(CLIPS_LS_KEY, JSON.stringify(next));
  }
  return next;
}
// Start un-joined so the Join flow is visible/testable; joining is recorded here.
const SEED_JOINED: string[] = [];

const SEED_CLIPS: CreatorClip[] = [
  {
    id: "clip_seed_1",
    campaign_id: "camp_perf_1",
    campaignTitle: "Aether Clip Challenge — Earn Per View",
    platform: "tiktok",
    post_url: "https://tiktok.com/@marcusv.tiktok/video/seed1",
    status: "tracking",
    current_views: 184000,
    estimated_earnings: 460,
    submitted_at: new Date(Date.now() - 86400000 * 4).toISOString(),
  },
  {
    id: "clip_seed_2",
    campaign_id: "camp_perf_1",
    campaignTitle: "Aether Clip Challenge — Earn Per View",
    platform: "instagram",
    post_url: "https://instagram.com/reel/seed2",
    status: "tracking",
    current_views: 52000,
    estimated_earnings: 130,
    submitted_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "clip_seed_3",
    campaign_id: "camp_perf_1",
    campaignTitle: "Aether Clip Challenge — Earn Per View",
    platform: "youtube",
    post_url: "https://youtube.com/shorts/seed3",
    status: "pending",
    current_views: 0,
    estimated_earnings: 0,
    submitted_at: new Date(Date.now() - 86400000 * 0.3).toISOString(),
  },
];

const SEED_EARNINGS: EarningsBreakdown = {
  inHoldback: 280,
  readyForPayout: 310,
  paid: 920,
};

const SEED_PAYOUTS: PayoutRecord[] = [
  {
    id: "payout_seed_1",
    amount: 540,
    status: "paid",
    created_at: new Date(Date.now() - 86400000 * 9).toISOString(),
    stripe_transfer_id: "tr_mock_seed1",
  },
  {
    id: "payout_seed_2",
    amount: 380,
    status: "paid",
    created_at: new Date(Date.now() - 86400000 * 23).toISOString(),
    stripe_transfer_id: "tr_mock_seed2",
  },
];

function readLs<T>(key: string, seed: T): T {
  if (typeof window === "undefined") return seed;
  const stored = localStorage.getItem(key);
  if (!stored) {
    localStorage.setItem(key, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(stored) as T;
  } catch {
    return seed;
  }
}

function writeLs<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("aether-clips-update"));
}

function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  return "instagram";
}

export interface JoinResult {
  ok: boolean;
  alreadyJoined?: boolean;
  error?: string;
}

/**
 * Creator: which performance campaigns the creator has actively joined, plus a
 * join() action that calls POST /api/campaigns/[id]/join (real) or records the
 * join locally (mock). Clip submission is gated on membership of joinedIds.
 */
export function useJoinedCampaigns() {
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (isMockMode) {
      setJoinedIds(new Set(readLs<string[]>(JOINED_LS_KEY, SEED_JOINED)));
      setLoading(false);
      return;
    }
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

  // Brand-set CPM model: joining takes no creator rate (payout = brand rate).
  const join = useCallback(
    async (campaignId: string): Promise<JoinResult> => {
      if (isMockMode) {
        const list = readLs<string[]>(JOINED_LS_KEY, SEED_JOINED);
        if (list.includes(campaignId)) return { ok: true, alreadyJoined: true };
        list.push(campaignId);
        writeLs(JOINED_LS_KEY, list);
        return { ok: true, alreadyJoined: false };
      }
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

/** Creator: list + submit clips. */
export function useCreatorClips() {
  const [clips, setClips] = useState<CreatorClip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (isMockMode) {
      // Sweep overdue approvals, then recompute the estimate from the creator's
      // chosen CPM (for the seeds this reproduces their hand-set values exactly).
      setClips(
        mockClipsWithApproval().map((c) => {
          const cpm = mockCpmFor();
          return {
            ...c,
            creator_cpm: cpm,
            estimated_earnings: Math.round(((c.current_views * cpm) / 1000) * 100) / 100,
          };
        })
      );
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("clips")
      .select(
        "id, campaign_id, platform, post_url, status, current_views, created_at, submitted_at, approval_deadline, auto_approved, quality_status, quality_notes, quality_score, campaign:campaign_id(title, cpm_rate)"
      )
      .eq("creator_id", user.id)
      .order("created_at", { ascending: false });

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
        // Brand-set CPM: pay the campaign rate (kept in sync with brand_cpm_rate).
        const cpm = Number(r.campaign?.cpm_rate ?? DEFAULT_CPM);
        return {
          id: r.id,
          campaign_id: r.campaign_id,
          campaignTitle: r.campaign?.title ?? "Campaign",
          platform: r.platform,
          post_url: r.post_url,
          status: r.status,
          current_views: views,
          estimated_earnings: Math.round(((views * cpm) / 1000) * 100) / 100,
          creator_cpm: cpm,
          submitted_at: r.submitted_at ?? r.created_at,
          approval_deadline: r.approval_deadline,
          auto_approved: r.auto_approved ?? false,
          quality_status: r.quality_status ?? "pending_review",
          quality_notes: r.quality_notes,
          quality_score: r.quality_score,
        };
      })
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

  const submitClip = useCallback(
    async (campaignId: string, postUrl: string, campaignTitle?: string) => {
      const platform = detectPlatform(postUrl);
      if (isMockMode) {
        // Budget gate (mirrors the API): closed or >= 90% used → block.
        try {
          const { campaigns } = await getCampaignsAction();
          const camp = (campaigns || []).find(
            (c: { id?: string }) => c.id === campaignId
          ) as
            | {
                status?: string;
                campaign_type?: string;
                budget_pool?: number;
                budget_reserved?: number;
                budget_paid?: number;
              }
            | undefined;
          if (camp) {
            if (camp.status && camp.status !== "open" && camp.status !== "in_progress") {
              return { ok: false, error: "This campaign is closed and is not accepting new clips." };
            }
            if (camp.campaign_type === "performance") {
              const usage = budgetUsage(camp);
              if (isPoolExhausted(usage)) {
                return {
                  ok: false,
                  error: "This campaign has used its full budget and is closed to new clips.",
                };
              }
              if (isNearlyFull(usage)) {
                return {
                  ok: false,
                  error: "This campaign has used most of its budget and is no longer accepting new clips.",
                };
              }
            }
          }
        } catch {
          /* best-effort budget gate */
        }
        const list = readLs<CreatorClip[]>(CLIPS_LS_KEY, SEED_CLIPS);
        if (list.some((c) => c.post_url === postUrl)) {
          return { ok: false, error: "This clip has already been submitted." };
        }
        // Trusted creators auto-approve on submit; everyone else starts pending
        // with a 5-working-day approval deadline (mirrors the DB insert trigger).
        const trusted =
          (getMockUser() as { trusted_creator?: boolean }).trusted_creator === true;
        const submittedAt = new Date().toISOString();
        list.unshift({
          id: "clip_" + Math.random().toString(36).substring(2, 9),
          campaign_id: campaignId,
          campaignTitle: campaignTitle || "Performance Campaign",
          platform,
          post_url: postUrl,
          status: trusted ? "tracking" : "pending",
          current_views: 0,
          estimated_earnings: 0,
          submitted_at: submittedAt,
          approval_deadline: addBusinessDays(
            new Date(submittedAt),
            APPROVAL_WINDOW_BUSINESS_DAYS
          ).toISOString(),
          auto_approved: trusted,
          quality_status: trusted ? "approved" : "pending_review",
          quality_notes: null,
        });
        writeLs(CLIPS_LS_KEY, list);
        return { ok: true };
      }
      try {
        await apiPost("/api/clips", { campaign_id: campaignId, post_url: postUrl });
        await load();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not submit clip.",
        };
      }
    },
    [load]
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
    if (isMockMode) {
      setBreakdown(readLs<EarningsBreakdown>(EARNINGS_LS_KEY, SEED_EARNINGS));
      setPayouts(readLs<PayoutRecord[]>(PAYOUTS_LS_KEY, SEED_PAYOUTS));
      setLoading(false);
      return;
    }
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
   * Withdraw the available (approved, cleared-holdback) balance. Mock moves it
   * to 'paid' minus the fee locally; real mode runs the atomic claim → transfer
   * → settle server action. Returns the gross/net/fee breakdown.
   */
  const withdraw = useCallback(async (): Promise<WithdrawResult> => {
    if (isMockMode) {
      const b = readLs<EarningsBreakdown>(EARNINGS_LS_KEY, SEED_EARNINGS);
      const available = b.readyForPayout;
      if (available < WITHDRAWAL_MIN) {
        return { ok: false, error: `You need at least $${WITHDRAWAL_MIN} available to withdraw.` };
      }
      const split = withdrawalBreakdown(available);
      const nextBreakdown: EarningsBreakdown = {
        ...b,
        readyForPayout: 0,
        paid: Math.round((b.paid + split.net) * 100) / 100,
      };
      writeLs(EARNINGS_LS_KEY, nextBreakdown);
      const list = readLs<PayoutRecord[]>(PAYOUTS_LS_KEY, SEED_PAYOUTS);
      list.unshift({
        id: "payout_" + Math.random().toString(36).substring(2, 9),
        amount: split.net,
        status: "paid",
        created_at: new Date().toISOString(),
        stripe_transfer_id: "tr_mock_" + Math.random().toString(36).substring(2, 9),
      });
      writeLs(PAYOUTS_LS_KEY, list);
      setBreakdown(nextBreakdown);
      setPayouts(list);
      return { ok: true, gross: split.gross, net: split.net, fee: split.fee };
    }

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
    if (isMockMode) {
      // Sweep first so overdue clips leave the queue (auto-approved).
      const list = mockClipsWithApproval();
      const mockUser = getMockUser();
      setClips(
        list
          // Awaiting first review only — changes_requested clips wait on the creator.
          .filter((c) => c.status === "pending" && (c.quality_status ?? "pending_review") === "pending_review")
          .filter((c) => !campaignId || c.campaign_id === campaignId)
          .map((c) => ({
            id: c.id,
            campaign_id: c.campaign_id,
            campaignTitle: c.campaignTitle,
            creatorName: mockUser.full_name || "Creator",
            platform: c.platform,
            post_url: c.post_url,
            status: c.status,
            current_views: c.current_views,
            creatorCpm: mockCpmFor(),
            submitted_at: c.submitted_at,
            approval_deadline: c.approval_deadline,
          }))
      );
      // Fraud-flagged tracking clips (worker sets these in real mode; usually
      // empty in mock).
      setFlagged(
        list
          .filter(
            (c) =>
              c.status === "tracking" &&
              (c as { fraud_flagged?: boolean }).fraud_flagged === true
          )
          .filter((c) => !campaignId || c.campaign_id === campaignId)
          .map((c) => ({
            id: c.id,
            campaign_id: c.campaign_id,
            campaignTitle: c.campaignTitle,
            creatorName: mockUser.full_name || "Creator",
            platform: c.platform,
            post_url: c.post_url,
            status: c.status,
            current_views: c.current_views,
            creatorCpm: mockCpmFor(),
            submitted_at: c.submitted_at,
            fraud_score: (c as { fraud_score?: number }).fraud_score,
            fraud_reasons: (c as { fraud_reasons?: string[] }).fraud_reasons,
          }))
      );
      setLoading(false);
      return;
    }

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
      // Brand-set CPM: the campaign rate (kept in sync with brand_cpm_rate).
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
      if (isMockMode) {
        const list = readLs<CreatorClip[]>(CLIPS_LS_KEY, SEED_CLIPS);
        const idx = list.findIndex((c) => c.id === clipId);
        if (idx !== -1) {
          if (action === "approve") {
            list[idx] = { ...list[idx], status: "tracking", quality_status: "approved", quality_notes: null, quality_score: opts?.score ?? null };
          } else if (action === "reject") {
            list[idx] = { ...list[idx], status: "rejected", quality_status: "rejected", quality_notes: opts?.reason ?? null };
          } else if (action === "disqualify") {
            list[idx] = { ...list[idx], status: "disqualified", quality_status: "rejected", quality_notes: opts?.reason ?? null };
          } else {
            // request_changes: stays pending, flagged back to the creator.
            list[idx] = { ...list[idx], status: "pending", quality_status: "changes_requested", quality_notes: opts?.reason ?? null, quality_score: opts?.score ?? null };
          }
          writeLs(CLIPS_LS_KEY, list);
        }
        return { ok: true };
      }
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
      if (isMockMode) {
        const list = readLs<CreatorClip[]>(CLIPS_LS_KEY, SEED_CLIPS);
        const idx = list.findIndex((c) => c.id === clipId);
        if (idx !== -1) {
          list[idx] = {
            ...list[idx],
            ...({ fraud_flagged: false, fraud_overridden: true } as Partial<CreatorClip>),
          };
          writeLs(CLIPS_LS_KEY, list);
        }
        await load();
        return { ok: true };
      }
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
