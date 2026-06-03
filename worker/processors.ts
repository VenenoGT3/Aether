import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "./supabase";
import { getViewsProvider } from "./views-provider";
import { scoreClipFraud } from "./fraud";
import { getFraudConfig, getViewSyncBatchSize, simulatedEarningsBlocked } from "./env";
import { log } from "./logger";
import type { ClipRow, ViewSyncOutcome } from "./types";

/**
 * Transport-agnostic worker logic. These functions take an optional Supabase
 * client (defaulting to the service-role client) and do NOT import BullMQ, so
 * they can be driven by the queue workers (worker/index.ts) OR run directly
 * (worker/run-once.ts) and unit-tested without Redis.
 */

const CLIP_COLUMNS =
  "id, campaign_id, participation_id, creator_id, platform, post_url, external_post_id, status, counted_views, current_views, last_synced_at, submitted_at, fraud_score, fraud_score_updated_at, fraud_overridden";

/**
 * Promote 'pending' clips past their 5-working-day approval deadline to
 * 'tracking' (auto-approve on brand inaction). Idempotent — only flips clips
 * whose deadline has lapsed on still-open performance campaigns. Returns count.
 */
export async function autoApproveOverdueClips(
  client?: SupabaseClient
): Promise<number> {
  const supabase = client ?? getServiceClient();
  const { data, error } = await supabase.rpc("auto_approve_overdue_clips");
  if (error) {
    throw new Error(`[approval] auto_approve_overdue_clips failed: ${error.message}`);
  }
  const count = typeof data === "number" ? data : Number(data ?? 0);
  if (count > 0) log.info("approval.auto_approved", { clips: count });
  return count;
}

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
 * Notify the campaign's brand that a clip was auto-disqualified for fraud.
 * Best-effort: a failed insert must never break the sync.
 */
async function notifyBrandOfFraud(
  supabase: SupabaseClient,
  clip: ClipRow,
  score: number,
  reasons: string[]
): Promise<void> {
  try {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("business_id, title")
      .eq("id", clip.campaign_id)
      .maybeSingle();
    const businessId = (campaign as { business_id?: string } | null)?.business_id;
    if (!businessId) return;
    const title = (campaign as { title?: string } | null)?.title ?? "your campaign";
    await supabase.from("notifications").insert({
      user_id: businessId,
      title: "Clip auto-disqualified for fraud",
      content: `A clip on "${title}" scored ${score}/100 and was auto-disqualified. Signals: ${
        reasons.slice(0, 3).join("; ") || "multiple fraud signals"
      }.`,
      type: "fraud",
      is_read: false,
    });
  } catch (err) {
    log.warn("viewsync.notify_failed", {
      clipId: clip.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
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

  // ---- Advanced fraud scoring ----
  // Load the clip's recent snapshot history for the trend/uniformity checks
  // (best-effort: empty history just means those checks are skipped).
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

  // Duplicate content: same post URL OR external id active in another campaign
  // (best-effort). Either match is treated as a cross-campaign duplicate.
  let duplicateContent = false;
  try {
    const { data: dupUrl } = await supabase
      .from("clips")
      .select("id")
      .eq("post_url", clip.post_url)
      .neq("campaign_id", clip.campaign_id)
      .in("status", ["pending", "approved", "tracking"])
      .limit(1)
      .maybeSingle();
    duplicateContent = !!dupUrl;
    if (!duplicateContent && clip.external_post_id) {
      const { data: dupId } = await supabase
        .from("clips")
        .select("id")
        .eq("external_post_id", clip.external_post_id)
        .neq("campaign_id", clip.campaign_id)
        .in("status", ["pending", "approved", "tracking"])
        .limit(1)
        .maybeSingle();
      duplicateContent = !!dupId;
    }
  } catch {
    /* best-effort */
  }

  // Suspicious creator behavior: clips this creator submitted in the burst window.
  let creatorBurstCount = 0;
  try {
    const windowStart = new Date(
      Date.now() - config.creatorBurstWindowMinutes * 60_000
    ).toISOString();
    const { count } = await supabase
      .from("clips")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", clip.creator_id)
      .gte("submitted_at", windowStart);
    creatorBurstCount = count ?? 0;
  } catch {
    /* best-effort */
  }

  const ageMinutes = clip.submitted_at
    ? (Date.now() - new Date(clip.submitted_at).getTime()) / 60_000
    : null;
  const minutesSincePriorScore = clip.fraud_score_updated_at
    ? (Date.now() - new Date(clip.fraud_score_updated_at).getTime()) / 60_000
    : undefined;

  const fraud = scoreClipFraud({
    platform: clip.platform,
    previousViews: clip.current_views,
    newViews: metrics.views,
    priorViews,
    likes: metrics.likes,
    comments: metrics.comments,
    shares: metrics.shares,
    ageMinutes,
    crossCampaignDuplicate: duplicateContent,
    creatorBurstCount,
    priorScore: clip.fraud_score,
    minutesSincePriorScore,
    config,
  });

  const nowIso = new Date().toISOString();
  // A hard velocity-cap breach (near-certain) ALWAYS disqualifies. A score-based
  // disqualification respects a brand override (the brand vouched for the clip).
  const shouldDisqualify =
    fraud.velocityBreach || (fraud.disqualify && !clip.fraud_overridden);

  if (shouldDisqualify) {
    await supabase
      .from("clips")
      .update({
        status: "disqualified",
        review_note: `auto-disqualified (fraud ${fraud.score}): ${fraud.reasons.join("; ")}`,
        fraud_score: fraud.score,
        fraud_flagged: false,
        fraud_reasons: fraud.reasons,
        fraud_score_updated_at: nowIso,
        last_synced_at: nowIso,
      })
      .eq("id", clipId);
    await notifyBrandOfFraud(supabase, clip, fraud.score, fraud.reasons);
    log.warn("viewsync.disqualified", {
      clipId,
      campaignId: clip.campaign_id,
      platform: clip.platform,
      score: fraud.score,
      signalScore: fraud.signalScore,
      reasons: fraud.reasons,
      velocityBreach: fraud.velocityBreach,
      overridden: clip.fraud_overridden,
      prevViews: clip.current_views,
      newViews: metrics.views,
    });
    return { status: "disqualified", clipId, reason: fraud.reasons[0] ?? "fraud" };
  }

  // Flag for manual review (unless the brand has overridden this clip).
  const flag = fraud.flag && !clip.fraud_overridden;
  if ((fraud.flag || fraud.disqualify) && clip.fraud_overridden) {
    log.warn("viewsync.override_suppressed", {
      clipId,
      campaignId: clip.campaign_id,
      score: fraud.score,
      reasons: fraud.reasons,
    });
  } else if (flag) {
    log.warn("viewsync.flagged", {
      clipId,
      campaignId: clip.campaign_id,
      score: fraud.score,
      reasons: fraud.reasons,
    });
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

  // Persist the latest (time-decayed) fraud assessment. The flag self-clears if
  // the score drops below the band on a later sync.
  const { error: updErr } = await supabase
    .from("clips")
    .update({
      current_views: nextViews,
      fraud_score: fraud.score,
      fraud_flagged: flag,
      fraud_reasons: fraud.reasons,
      fraud_score_updated_at: nowIso,
      last_synced_at: nowIso,
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
    fraudScore: fraud.score,
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
  // SAFETY GUARD: never accrue real earnings on simulated views in real mode.
  // View-sync still runs (snapshots / current_views update for visibility), but
  // no earnings row is created — so nothing can ever be promoted or paid.
  if (simulatedEarningsBlocked()) {
    log.warn("earnings.blocked.simulated_views", {
      clipId,
      views,
      reason: "real mode but views are simulated — refusing to accrue real earnings",
      hint: "set AYRSHARE_API_KEY for real views, or ALLOW_SIMULATED_PAYOUTS_IN_REAL_MODE=true to override (testing only)",
    });
    return 0;
  }

  // Trace id correlates the worker log with the DB-side RAISE LOG lines (which
  // carry clip/campaign ids) for a single accrual attempt.
  const traceId = randomUUID();
  const supabase = client ?? getServiceClient();
  const { data, error } = await supabase.rpc("record_clip_earning", {
    p_clip_id: clipId,
    p_new_views: views,
    p_trace_id: traceId,
  });

  if (error) {
    // The atomic function rolled back (no partial ledger/pool writes). Surface it
    // as a critical condition; BullMQ will retry per the configured backoff.
    log.alert("earnings.rpc_failed", {
      traceId,
      clipId,
      views,
      code: (error as { code?: string }).code,
      error: error.message,
    });
    throw new Error(
      `[earnings] record_clip_earning failed for ${clipId} (trace ${traceId}): ${error.message}`
    );
  }

  const amount = typeof data === "number" ? data : Number(data ?? 0);
  if (amount > 0) {
    log.info("earnings.accrued", { traceId, clipId, views, amount: amount.toFixed(2) });
  } else {
    log.debug("earnings.no_accrual", { traceId, clipId, views });
  }
  return amount;
}
