import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "./supabase";
import { getViewsProvider } from "./views-provider";
import { evaluateClipFraud } from "./fraud";
import { getFraudConfig, getViewSyncBatchSize } from "./env";
import { log } from "./logger";
import type { ClipRow, ViewSyncOutcome } from "./types";

/**
 * Transport-agnostic worker logic. These functions take an optional Supabase
 * client (defaulting to the service-role client) and do NOT import BullMQ, so
 * they can be driven by the queue workers (worker/index.ts) OR run directly
 * (worker/run-once.ts) and unit-tested without Redis.
 */

const CLIP_COLUMNS =
  "id, campaign_id, participation_id, creator_id, platform, post_url, external_post_id, status, counted_views, current_views, last_synced_at";

/** Ids of 'tracking' clips due for a refresh (oldest sync first). */
export async function fetchTrackingClipIds(
  limit = getViewSyncBatchSize(),
  client?: SupabaseClient
): Promise<string[]> {
  const supabase = client ?? getServiceClient();
  const { data, error } = await supabase
    .from("clips")
    .select("id")
    .eq("status", "tracking")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    throw new Error(`[view-sync] failed to load tracking clips: ${error.message}`);
  }
  return (data ?? []).map((row) => (row as { id: string }).id);
}

/**
 * Sync a single clip: fetch current views, run the fraud/velocity check, append
 * a view_snapshot, and update the clip's latest view count. Returns the outcome
 * so the caller can decide whether to trigger earnings.
 */
export async function runViewSyncForClip(
  clipId: string,
  client?: SupabaseClient
): Promise<ViewSyncOutcome> {
  const supabase = client ?? getServiceClient();

  const { data: clipData, error: clipErr } = await supabase
    .from("clips")
    .select(CLIP_COLUMNS)
    .eq("id", clipId)
    .maybeSingle();

  if (clipErr) {
    throw new Error(`[view-sync] failed to load clip ${clipId}: ${clipErr.message}`);
  }
  const clip = clipData as ClipRow | null;
  if (!clip) {
    return { status: "skipped", clipId, reason: "clip not found" };
  }
  if (clip.status !== "tracking") {
    return { status: "skipped", clipId, reason: `status=${clip.status}` };
  }

  const metrics = await getViewsProvider().fetchViews(clip);

  // Fraud guard. Load the clip's recent snapshot history so we can run the
  // history-based checks (spike vs the clip's own trend, bot-like uniformity)
  // alongside the single-sync velocity caps. History is best-effort — if it
  // can't be loaded we fall back to velocity-only (priorViews stays empty).
  const config = getFraudConfig();
  const { data: snaps } = await supabase
    .from("view_snapshots")
    .select("views")
    .eq("clip_id", clipId)
    .order("captured_at", { ascending: false })
    .limit(config.historyWindow);
  const priorViews = (snaps ?? [])
    .map((s) => Number((s as { views: number }).views))
    .reverse(); // oldest → newest

  // A flagged clip is disqualified, which stops it accruing (record_clip_earning
  // only pays 'tracking' clips).
  const fraud = evaluateClipFraud({
    platform: clip.platform,
    previousViews: clip.current_views,
    newViews: metrics.views,
    priorViews,
    config,
  });
  if (fraud.suspicious) {
    await supabase
      .from("clips")
      .update({
        status: "disqualified",
        review_note: `auto-disqualified: ${fraud.reason}`,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", clipId);
    log.warn("viewsync.disqualified", {
      clipId,
      campaignId: clip.campaign_id,
      platform: clip.platform,
      reason: fraud.reason,
      prevViews: clip.current_views,
      newViews: metrics.views,
    });
    return { status: "disqualified", clipId, reason: fraud.reason ?? "fraud" };
  }

  // Never let a noisy provider read lower the stored count.
  const nextViews = Math.max(metrics.views, clip.current_views);

  const { error: snapErr } = await supabase.from("view_snapshots").insert({
    clip_id: clipId,
    views: nextViews,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    source: metrics.source,
  });
  if (snapErr) {
    throw new Error(`[view-sync] snapshot insert failed for ${clipId}: ${snapErr.message}`);
  }

  const { error: updErr } = await supabase
    .from("clips")
    .update({
      current_views: nextViews,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", clipId);
  if (updErr) {
    throw new Error(`[view-sync] clip update failed for ${clipId}: ${updErr.message}`);
  }

  log.info("viewsync.synced", {
    clipId,
    campaignId: clip.campaign_id,
    views: nextViews,
    delta: nextViews - clip.counted_views,
    source: metrics.source,
  });
  return { status: "synced", clipId, views: nextViews };
}

/**
 * Convert a clip's latest view count into earnings via the atomic SQL function
 * record_clip_earning (pool-aware, cap-aware, concurrency-safe). Returns the
 * amount accrued (0 when there's no new billable delta or the pool/cap is
 * exhausted).
 */
export async function runEarningsCalc(
  clipId: string,
  views: number,
  client?: SupabaseClient
): Promise<number> {
  const supabase = client ?? getServiceClient();
  const { data, error } = await supabase.rpc("record_clip_earning", {
    p_clip_id: clipId,
    p_new_views: views,
  });

  if (error) {
    throw new Error(
      `[earnings] record_clip_earning failed for ${clipId}: ${error.message}`
    );
  }

  const amount = typeof data === "number" ? data : Number(data ?? 0);
  if (amount > 0) {
    log.info("earnings.accrued", { clipId, views, amount: amount.toFixed(2) });
  } else {
    // Expected steady-state outcome (no new billable views, or pool/cap hit) — debug only.
    log.debug("earnings.no_accrual", { clipId, views });
  }
  return amount;
}
