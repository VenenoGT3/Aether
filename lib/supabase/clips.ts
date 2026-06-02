import { useCallback, useEffect, useState } from "react";
import { supabase, isMockMode, getMockUser } from "./client";
import { apiPost } from "@/lib/api/client";

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
  creatorName: string;
  platform: string;
  post_url: string;
  status: ClipStatus;
  current_views: number;
  /** The creator's chosen CPM (falls back to the campaign rate). */
  creatorCpm?: number;
  submitted_at: string;
}

const CLIPS_LS_KEY = "aether-mock-clips";
const EARNINGS_LS_KEY = "aether-mock-clip-earnings";
const PAYOUTS_LS_KEY = "aether-mock-clip-payouts";
const JOINED_LS_KEY = "aether-mock-joined-campaigns";
// Mock only: creator's chosen CPM per campaign id ({ [campaignId]: number }).
const CREATOR_CPM_LS_KEY = "aether-mock-creator-cpm";
const DEFAULT_CPM = 2.5;

/** Mock helper: the creator's chosen CPM for a campaign, or the default. */
function mockCpmFor(campaignId: string): number {
  if (typeof window === "undefined") return DEFAULT_CPM;
  try {
    const map = JSON.parse(localStorage.getItem(CREATOR_CPM_LS_KEY) || "{}");
    const v = Number(map?.[campaignId]);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_CPM;
  } catch {
    return DEFAULT_CPM;
  }
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

  const join = useCallback(
    async (campaignId: string, creatorCpmRate?: number | null): Promise<JoinResult> => {
      if (isMockMode) {
        // Persist the creator's chosen CPM for this campaign (mock only).
        if (creatorCpmRate != null && creatorCpmRate > 0 && typeof window !== "undefined") {
          try {
            const map = JSON.parse(localStorage.getItem(CREATOR_CPM_LS_KEY) || "{}");
            map[campaignId] = creatorCpmRate;
            localStorage.setItem(CREATOR_CPM_LS_KEY, JSON.stringify(map));
          } catch {
            /* ignore */
          }
        }
        const list = readLs<string[]>(JOINED_LS_KEY, SEED_JOINED);
        if (list.includes(campaignId)) return { ok: true, alreadyJoined: true };
        list.push(campaignId);
        writeLs(JOINED_LS_KEY, list);
        return { ok: true, alreadyJoined: false };
      }
      try {
        const res = await apiPost<{ alreadyJoined?: boolean }>(
          `/api/campaigns/${campaignId}/join`,
          creatorCpmRate != null ? { creator_cpm_rate: creatorCpmRate } : {}
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
      // Recompute the estimate from the creator's chosen CPM (falls back to the
      // default). For the seeds this reproduces their hand-set values exactly.
      setClips(
        readLs<CreatorClip[]>(CLIPS_LS_KEY, SEED_CLIPS).map((c) => {
          const cpm = mockCpmFor(c.campaign_id);
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
        "id, campaign_id, platform, post_url, status, current_views, created_at, campaign:campaign_id(title, cpm_rate), participation:participation_id(creator_cpm_rate)"
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
      campaign: { title?: string; cpm_rate?: number | null } | null;
      participation: { creator_cpm_rate?: number | null } | null;
    };
    const rows = (data ?? []) as unknown as Row[];
    setClips(
      rows.map((r) => {
        const views = Number(r.current_views ?? 0);
        // Creator's chosen CPM wins; fall back to the campaign base, then default.
        const cpm = Number(
          r.participation?.creator_cpm_rate ?? r.campaign?.cpm_rate ?? DEFAULT_CPM
        );
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
          submitted_at: r.created_at,
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
        const list = readLs<CreatorClip[]>(CLIPS_LS_KEY, SEED_CLIPS);
        if (list.some((c) => c.post_url === postUrl)) {
          return { ok: false, error: "This clip has already been submitted." };
        }
        list.unshift({
          id: "clip_" + Math.random().toString(36).substring(2, 9),
          campaign_id: campaignId,
          campaignTitle: campaignTitle || "Performance Campaign",
          platform,
          post_url: postUrl,
          status: "pending",
          current_views: 0,
          estimated_earnings: 0,
          submitted_at: new Date().toISOString(),
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

  return { breakdown, payouts, loading, refresh: load };
}

/** Brand: pending clips to moderate + approve/reject. */
export function useBrandModeration(campaignId?: string) {
  const [clips, setClips] = useState<ModerationClip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (isMockMode) {
      const list = readLs<CreatorClip[]>(CLIPS_LS_KEY, SEED_CLIPS);
      const mockUser = getMockUser();
      setClips(
        list
          .filter((c) => c.status === "pending")
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
            creatorCpm: mockCpmFor(c.campaign_id),
            submitted_at: c.submitted_at,
          }))
      );
      setLoading(false);
      return;
    }
    let query = supabase
      .from("clips")
      .select(
        "id, campaign_id, creator_id, platform, post_url, status, current_views, created_at, campaign:campaign_id(title, cpm_rate), creator:creator_id(email), participation:participation_id(creator_cpm_rate)"
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (campaignId) query = query.eq("campaign_id", campaignId);

    const { data } = await query;
    type Row = {
      id: string;
      campaign_id: string;
      creator_id: string;
      platform: string;
      post_url: string;
      status: ClipStatus;
      current_views: number | null;
      created_at: string;
      campaign: { title?: string; cpm_rate?: number | null } | null;
      creator: { email?: string } | null;
      participation: { creator_cpm_rate?: number | null } | null;
    };
    const rows = (data ?? []) as unknown as Row[];

    // Resolve creator display names in ONE batched query (no N+1).
    // profiles.user_id is the FK to users.id, which equals clips.creator_id.
    const creatorIds = [...new Set(rows.map((r) => r.creator_id).filter(Boolean))];
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

    setClips(
      rows.map((r) => ({
        id: r.id,
        campaign_id: r.campaign_id,
        campaignTitle: r.campaign?.title ?? "Campaign",
        // Prefer display name; gracefully fall back to email, then "Unknown creator".
        creatorName:
          nameById.get(r.creator_id) || r.creator?.email || "Unknown creator",
        platform: r.platform,
        post_url: r.post_url,
        status: r.status,
        current_views: Number(r.current_views ?? 0),
        creatorCpm: Number(
          r.participation?.creator_cpm_rate ?? r.campaign?.cpm_rate ?? DEFAULT_CPM
        ),
        submitted_at: r.created_at,
      }))
    );
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
    async (clipId: string, action: "approve" | "reject", reason?: string) => {
      if (isMockMode) {
        const list = readLs<CreatorClip[]>(CLIPS_LS_KEY, SEED_CLIPS);
        const idx = list.findIndex((c) => c.id === clipId);
        if (idx !== -1) {
          list[idx] = {
            ...list[idx],
            status: action === "approve" ? "tracking" : "rejected",
          };
          writeLs(CLIPS_LS_KEY, list);
        }
        return { ok: true };
      }
      try {
        await apiPost(`/api/clips/${clipId}/${action}`, reason ? { reason } : {});
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

  return { clips, loading, refresh: load, moderate };
}
