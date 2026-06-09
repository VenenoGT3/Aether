import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "./supabase";
import { getViewsProvider } from "./views-provider";
import { scoreClipFraud } from "./fraud";
import { getFraudConfig, getViewSyncBatchSize, payoutSafetyBlocked } from "./env";
import { log, errMessage } from "./logger";
import type { ClipRow, ViewSyncOutcome } from "./types";

/**
 * Transport-agnostic worker logic. These functions take an optional Supabase
 * client (defaulting to the service-role client) and do NOT import BullMQ, so
 * they can be driven by the queue workers (worker/index.ts) OR run directly
 * (worker/run-once.ts) and unit-tested without Redis.
 */

const CLIP_COLUMNS =
  "id, campaign_id, participation_id, creator_id, platform, post_url, external_post_id, creator_social_account_id, view_provider, status, quality_status, counted_views, current_views, last_synced_at, submitted_at, fraud_score, fraud_flagged, fraud_score_updated_at, fraud_overridden";

/**
 * Promote 'pending' clips past their 5-working-day approval deadline to
 * 'tracking' (auto-approve on brand inaction). Idempotent — only flips clips
 * whose deadline has lapsed on still-open performance campaigns. Returns count.
 */
export async function autoApproveOverdueClips(
  client?: SupabaseClient
): Promise<number> {
  const traceId = randomUUID();
  const supabase = client ?? getServiceClient();
  const { data, error } = await supabase.rpc("auto_approve_overdue_clips", {
    p_trace_id: traceId,
  });
  if (error) {
    log.alert("approval.auto_approve_failed", {
      traceId,
      code: (error as { code?: string }).code,
      error: error.message,
    });
    throw new Error(
      `[approval] auto_approve_overdue_clips failed (trace ${traceId}): ${error.message}`
    );
  }
  const count = typeof data === "number" ? data : Number(data ?? 0);
  if (count > 0) {
    log.info("approval.auto_approved", { traceId, clips: count });
  }
  return count;
}

/** Ids of tracking/syncable clips due for a refresh (oldest sync first). */
export async function fetchTrackingClipIds(
  limit = getViewSyncBatchSize(),
  client?: SupabaseClient
): Promise<string[]> {
  const supabase = client ?? getServiceClient();
  // Legacy 'approved' clips only qualify once quality review has passed —
  // runViewSyncForClip skips the rest WITHOUT touching last_synced_at, so a
  // broader filter would let them squat the head of every batch (their null
  // last_synced_at sorts first) and starve genuine tracking clips.
  const { data, error } = await supabase
    .from("clips")
    .select("id")
    .or("status.eq.tracking,and(status.eq.approved,quality_status.eq.approved)")
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
 * Append a fraud detection to the immutable clip_fraud_events ledger. Best-effort:
 * the audit trail must never break a sync (the clip's fraud_* columns already hold
 * the latest state). Service-role insert (RLS-on, no policies).
 */
async function recordFraudEvent(
  supabase: SupabaseClient,
  clip: ClipRow,
  fraud: { score: number; signalScore: number; reasons: string[]; velocityBreach: boolean },
  action: "flagged" | "disqualified",
  traceId: string
): Promise<void> {
  try {
    await supabase.from("clip_fraud_events").insert({
      clip_id: clip.id,
      campaign_id: clip.campaign_id,
      creator_id: clip.creator_id,
      action,
      score: fraud.score,
      signal_score: fraud.signalScore,
      velocity_breach: fraud.velocityBreach,
      reasons: fraud.reasons,
      trace_id: traceId,
    });
  } catch (err) {
    log.warn("fraud.event_record_failed", {
      traceId,
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
  // Correlates every log line + the fraud ledger row for this single sync attempt.
  const traceId = randomUUID();

  const { data: clipData, error: clipErr } = await supabase
    .from("clips")
    .select(CLIP_COLUMNS)
    .eq("id", clipId)
    .maybeSingle();

  if (clipErr) {
    throw new Error(`[view-sync] failed to load clip ${clipId}: ${clipErr.message}`);
  }
  let clip = clipData as ClipRow | null;
  if (!clip) {
    return { status: "skipped", clipId, reason: "clip not found" };
  }
  if (clip.status === "approved" && clip.quality_status === "approved") {
    const nowIso = new Date().toISOString();
    const { error: promoteErr } = await supabase
      .from("clips")
      .update({ status: "tracking", updated_at: nowIso })
      .eq("id", clipId)
      .eq("status", "approved")
      .eq("quality_status", "approved");
    if (promoteErr) {
      throw new Error(
        `[view-sync] failed to normalize approved clip ${clipId}: ${promoteErr.message}`
      );
    }
    clip = { ...clip, status: "tracking" };
    log.warn("viewsync.normalized_approved_clip", {
      traceId,
      clipId,
      campaignId: clip.campaign_id,
      reason: "legacy approved status promoted to tracking before sync",
    });
  }
  if (clip.status !== "tracking") {
    return { status: "skipped", clipId, reason: `status=${clip.status}` };
  }

  if (clip.quality_status && clip.quality_status !== "approved") {
    log.alert("earnings.skipped_not_quality_approved", {
      clipId,
      campaignId: clip.campaign_id,
      qualityStatus: clip.quality_status,
    });
    return { status: "skipped", clipId, reason: `quality=${clip.quality_status}` };
  }

  const metrics = await getViewsProvider().fetchViews(clip);

  if (!metrics.trusted) {
    const nowIso = new Date().toISOString();
    const { error: snapErr } = await supabase.from("view_snapshots").insert({
      clip_id: clipId,
      views: clip.current_views,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      source: metrics.source,
    });
    if (snapErr) {
      throw new Error(
        `[view-sync] untrusted snapshot insert failed for ${clipId}: ${snapErr.message}`
      );
    }
    const { error: updErr } = await supabase
      .from("clips")
      .update({ last_synced_at: nowIso })
      .eq("id", clipId);
    if (updErr) {
      throw new Error(
        `[view-sync] untrusted clip update failed for ${clipId}: ${updErr.message}`
      );
    }
    log.warn("viewsync.skipped_untrusted", {
      traceId,
      clipId,
      campaignId: clip.campaign_id,
      platform: clip.platform,
      source: metrics.source,
      reason: "provider returned no fresh trusted metrics",
    });
    return { status: "skipped", clipId, reason: `untrusted_source=${metrics.source}` };
  }

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

  if (
    priorViews.length === 0 &&
    clip.current_views === 0 &&
    clip.counted_views === 0
  ) {
    const nowIso = new Date().toISOString();
    const baselineViews = Math.max(metrics.views, 0);
    const { error: snapErr } = await supabase.from("view_snapshots").insert({
      clip_id: clipId,
      views: baselineViews,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      source: metrics.source,
    });
    if (snapErr) {
      throw new Error(
        `[view-sync] baseline snapshot insert failed for ${clipId}: ${snapErr.message}`
      );
    }

    const { error: updErr } = await supabase
      .from("clips")
      .update({
        current_views: baselineViews,
        counted_views: baselineViews,
        fraud_score: 0,
        fraud_flagged: false,
        fraud_reasons: [],
        fraud_score_updated_at: nowIso,
        last_synced_at: nowIso,
      })
      .eq("id", clipId);
    if (updErr) {
      throw new Error(
        `[view-sync] baseline clip update failed for ${clipId}: ${updErr.message}`
      );
    }

    log.info("viewsync.baselined", {
      traceId,
      clipId,
      campaignId: clip.campaign_id,
      views: baselineViews,
      source: metrics.source,
      reason: "first trusted snapshot sets non-billable starting point",
    });
    return { status: "synced", clipId, views: baselineViews, source: metrics.source };
  }

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
    await recordFraudEvent(supabase, clip, fraud, "disqualified", traceId);
    await notifyBrandOfFraud(supabase, clip, fraud.score, fraud.reasons);
    // High-risk, money-reversing event (the reverse_earnings_on_clip_block trigger
    // reverses accrued earnings) → ALERT, not warn.
    log.alert("viewsync.disqualified", {
      traceId,
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
      traceId,
      clipId,
      campaignId: clip.campaign_id,
      score: fraud.score,
      reasons: fraud.reasons,
    });
  } else if (flag) {
    // Only record a ledger event on the transition into the flagged band, not on
    // every steady-state sync, to keep the audit trail signal-dense.
    if (!clip.fraud_flagged) {
      await recordFraudEvent(supabase, clip, fraud, "flagged", traceId);
    }
    log.warn("viewsync.flagged", {
      traceId,
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
    traceId,
    clipId,
    campaignId: clip.campaign_id,
    views: nextViews,
    delta: nextViews - clip.counted_views,
    fraudScore: fraud.score,
    source: metrics.source,
  });
  return { status: "synced", clipId, views: nextViews, source: metrics.source };
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
  source?: string,
  client?: SupabaseClient
): Promise<number> {
  // SAFETY GUARD: never accrue real earnings without a live view source.
  // View-sync still runs (snapshots / current_views update for visibility), but
  // no earnings row is created — so nothing can ever be promoted or paid.
  if (payoutSafetyBlocked()) {
    log.warn("earnings.blocked.no_view_source", {
      clipId,
      views,
      source,
      reason: "no trusted view provider configured — refusing to accrue earnings on unverified views",
      hint: "configure YOUTUBE_DATA_API_KEY to restore YouTube-only live view tracking",
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

/** Sweep open performance campaigns and idempotently close any at 100% pool. */
export async function reconcileExhaustedCampaigns(
  client?: SupabaseClient
): Promise<number> {
  const traceId = randomUUID();
  const supabase = client ?? getServiceClient();
  const { data, error } = await supabase.rpc("reconcile_exhausted_performance_campaigns", {
    p_trace_id: traceId,
  });
  if (error) {
    log.alert("budget.reconcile_failed", { traceId, error: error.message });
    throw new Error(
      `[budget] reconcile_exhausted_performance_campaigns failed (trace ${traceId}): ${error.message}`
    );
  }
  const count = typeof data === "number" ? data : Number(data ?? 0);
  if (count > 0) {
    log.info("budget.reconcile_closed", { traceId, campaigns: count });
  }
  return count;
}

/**
 * Audit the denormalized campaign budget rollups against the earnings ledger.
 * Any returned row is a real financial-integrity drift (the DB also raises an
 * [ALERT] per drifted campaign). Best-effort: failures are logged, never thrown,
 * so this can be called from the heartbeat without risking the loop.
 */
export async function auditCampaignBudgetDrift(
  client?: SupabaseClient
): Promise<number> {
  const traceId = randomUUID();
  const supabase = client ?? getServiceClient();
  const { data, error } = await supabase.rpc("audit_campaign_budget_drift", {
    p_trace_id: traceId,
  });
  if (error) {
    log.alert("budget.drift_audit_failed", { traceId, error: error.message });
    return 0;
  }
  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 0) {
    log.alert("budget.drift_detected", {
      traceId,
      count: rows.length,
      campaigns: rows
        .map((r) => (r as { campaign_id?: string }).campaign_id)
        .filter(Boolean)
        .slice(0, 20),
    });
  }
  return rows.length;
}

/**
 * Audit settled, fee-bearing payouts against the immutable platform_revenue
 * ledger. Any returned row is a fee-accounting integrity breach (missing revenue
 * row or fee mismatch); the DB also raises an [ALERT] per row. Best-effort.
 */
export async function auditPayoutRevenueDrift(
  client?: SupabaseClient
): Promise<number> {
  const traceId = randomUUID();
  const supabase = client ?? getServiceClient();
  const { data, error } = await supabase.rpc("audit_payout_revenue_drift", {
    p_trace_id: traceId,
  });
  if (error) {
    log.alert("payout.revenue_audit_failed", { traceId, error: error.message });
    return 0;
  }
  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 0) {
    log.alert("payout.revenue_drift_detected", {
      traceId,
      count: rows.length,
      payouts: rows
        .map((r) => (r as { payout_id?: string }).payout_id)
        .filter(Boolean)
        .slice(0, 20),
    });
  }
  return rows.length;
}

/**
 * Audit the clip quality invariant: status='tracking' <=> quality_status='approved'.
 * A returned row is a real breach (a tracking clip earning without quality approval,
 * or an approved clip not tracking); the DB raises [ALERT] per clip. Best-effort.
 */
export async function auditClipQualityInvariants(
  client?: SupabaseClient
): Promise<number> {
  const traceId = randomUUID();
  const supabase = client ?? getServiceClient();
  const { data, error } = await supabase.rpc("audit_clip_quality_invariants", {
    p_trace_id: traceId,
  });
  if (error) {
    log.alert("clip.quality_audit_failed", { traceId, error: error.message });
    return 0;
  }
  const rows = Array.isArray(data) ? data : [];
  if (rows.length > 0) {
    log.alert("clip.quality_invariant_detected", {
      traceId,
      count: rows.length,
      clips: rows
        .map((r) => (r as { clip_id?: string }).clip_id)
        .filter(Boolean)
        .slice(0, 20),
    });
  }
  return rows.length;
}

/**
 * Fraud forensics sweep (heartbeat): (a) reversal-integrity audit — terminal
 * clips that still carry accrued earnings; (b) cross-campaign repeat offenders;
 * (c) disqualification-rate anomaly within the lookback window. Each DB RPC
 * raises its own [ALERT]; this surfaces worker-side alerts + counts. Best-effort.
 */
export async function runFraudForensics(
  opts: { repeatOffenderMinEvents: number; disqualifyRateThreshold: number; windowMinutes: number },
  client?: SupabaseClient
): Promise<{ reversalFailures: number; repeatOffenders: number; disqualified: number }> {
  const traceId = randomUUID();
  const supabase = client ?? getServiceClient();
  const result = { reversalFailures: 0, repeatOffenders: 0, disqualified: 0 };

  // (a) Reversal integrity — disqualified/rejected clips with accrued earnings.
  try {
    const { data, error } = await supabase.rpc("audit_disqualified_clip_earnings", {
      p_trace_id: traceId,
    });
    if (error) {
      log.alert("fraud.reversal_audit_failed", { traceId, error: error.message });
    } else {
      const rows = Array.isArray(data) ? data : [];
      result.reversalFailures = rows.length;
      if (rows.length > 0) {
        log.alert("fraud.reversal_failure_detected", {
          traceId,
          count: rows.length,
          clips: rows
            .map((r) => (r as { clip_id?: string }).clip_id)
            .filter(Boolean)
            .slice(0, 20),
        });
      }
    }
  } catch (err) {
    log.warn("fraud.reversal_audit_error", { traceId, error: errMessage(err) });
  }

  // (b) Cross-campaign repeat offenders (7-day lookback in the RPC default).
  try {
    const { data, error } = await supabase.rpc("fraud_repeat_offenders", {
      p_min_events: opts.repeatOffenderMinEvents,
    });
    if (error) {
      log.warn("fraud.repeat_offenders_failed", { traceId, error: error.message });
    } else {
      const rows = Array.isArray(data) ? data : [];
      result.repeatOffenders = rows.length;
      if (rows.length > 0) {
        log.alert("fraud.repeat_offenders", {
          traceId,
          count: rows.length,
          offenders: rows
            .slice(0, 20)
            .map((r) => {
              const o = r as {
                creator_id?: string;
                event_count?: number;
                campaign_count?: number;
                disqualified?: number;
              };
              return {
                creatorId: o.creator_id,
                events: o.event_count,
                campaigns: o.campaign_count,
                disqualified: o.disqualified,
              };
            }),
        });
      }
    }
  } catch (err) {
    log.warn("fraud.repeat_offenders_error", { traceId, error: errMessage(err) });
  }

  // (c) Disqualification-rate anomaly within the heartbeat window.
  try {
    const sinceInterval = `${Math.max(opts.windowMinutes, 1)} minutes`;
    const { data, error } = await supabase.rpc("fraud_event_stats", {
      p_since: sinceInterval,
    });
    if (error) {
      log.warn("fraud.event_stats_failed", { traceId, error: error.message });
    } else {
      const row = (Array.isArray(data) ? data[0] : data) as
        | { disqualified?: number; flagged?: number; total_events?: number }
        | undefined;
      const disqualified = Number(row?.disqualified ?? 0);
      result.disqualified = disqualified;
      if (disqualified >= opts.disqualifyRateThreshold) {
        log.alert("fraud.disqualify_rate_spike", {
          traceId,
          disqualified,
          threshold: opts.disqualifyRateThreshold,
          windowMin: opts.windowMinutes,
          flagged: Number(row?.flagged ?? 0),
        });
      }
    }
  } catch (err) {
    log.warn("fraud.event_stats_error", { traceId, error: errMessage(err) });
  }

  return result;
}
