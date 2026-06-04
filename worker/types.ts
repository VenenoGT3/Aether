/** Shared worker types. */

export type ViewProviderName =
  | "youtube_official"
  | "tiktok_official"
  | "ayrshare";

/** A clip row as the worker needs it for syncing. */
export interface ClipRow {
  id: string;
  campaign_id: string;
  participation_id: string;
  creator_id: string;
  platform: string;
  post_url: string;
  external_post_id: string | null;
  creator_social_account_id?: string | null;
  view_provider?: ViewProviderName | null;
  status: string;
  quality_status?: string | null;
  counted_views: number;
  current_views: number;
  last_synced_at: string | null;
  submitted_at: string | null;
  fraud_score: number;
  fraud_flagged?: boolean;
  fraud_score_updated_at: string | null;
  fraud_overridden: boolean;
}

/** View metrics returned by a provider for a single post. */
export interface ViewData {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  source: ViewProviderName;
  /** False means the provider degraded to last-known data; never accrue from it. */
  trusted: boolean;
}

/** Result of syncing one clip. */
export type ViewSyncOutcome =
  | { status: "synced"; clipId: string; views: number; source: ViewProviderName }
  | { status: "skipped"; clipId: string; reason: string }
  | { status: "disqualified"; clipId: string; reason: string };

// --- BullMQ job payloads ---

export const QUEUE_NAMES = {
  viewSync: "view-sync",
  earningsCalc: "earnings-calc",
  payoutBatch: "payout-batch",
  poolReconcile: "pool-reconcile",
} as const;

export const JOB_NAMES = {
  /** Repeatable scheduler job: queries tracking clips and fans out per-clip jobs. */
  fanOut: "fan-out",
  /** Per-clip view sync. */
  syncClip: "sync-clip",
  /** Earnings accrual for a clip after a fresh snapshot. */
  calcEarning: "calc-earning",
  /** Repeatable: promote due earnings + pay creators above the threshold. */
  runPayouts: "run-payouts",
  /** Repeatable: recover performance campaigns stuck in 'draft' after pool funding. */
  reconcileFunding: "reconcile-funding",
} as const;

export interface SyncClipJob {
  clipId: string;
}

export interface CalcEarningJob {
  clipId: string;
  views: number;
  source: ViewProviderName;
}
