/** Shared worker types. */

/** A clip row as the worker needs it for syncing. */
export interface ClipRow {
  id: string;
  campaign_id: string;
  participation_id: string;
  creator_id: string;
  platform: string;
  post_url: string;
  external_post_id: string | null;
  status: string;
  counted_views: number;
  current_views: number;
  last_synced_at: string | null;
}

/** View metrics returned by a provider for a single post. */
export interface ViewData {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  source: "ayrshare" | "simulated";
}

/** Result of syncing one clip. */
export type ViewSyncOutcome =
  | { status: "synced"; clipId: string; views: number }
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
}
