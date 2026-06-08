/**
 * Worker environment access.
 *
 * The worker is a standalone Node process — NOT the Next.js runtime — so it must
 * never import `@/lib/env.server` or `@/lib/supabase/admin` (both `import
 * "server-only"`, which throws outside a React Server context). It reads
 * process.env directly and legitimately uses the Supabase service role.
 */

import { defaultFraudConfig, type FraudConfig } from "./fraud";
import type { ViewProviderName } from "./types";

/** Redis connection string for BullMQ (e.g. redis://localhost:6379). */
export function getRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || "redis://localhost:6379";
}

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (url) return url;
  throw new Error("[worker] NEXT_PUBLIC_SUPABASE_URL is required.");
}

/** Service-role key — bypasses RLS. Valid here because this is not the Vercel runtime. */
export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (key) return key;
  throw new Error(
    "[worker] SUPABASE_SERVICE_ROLE_KEY is required to run the view-sync worker."
  );
}

/**
 * Optional Ayrshare key for aggregator-backed live view tracking.
 */
export function getAyrshareApiKey(): string | undefined {
  return process.env.AYRSHARE_API_KEY?.trim() || undefined;
}

/** True when live view tracking (Ayrshare) is configured. */
export function isAyrshareConfigured(): boolean {
  return !!getAyrshareApiKey();
}

/** Server-side YouTube Data API key for official video statistics. */
export function getYoutubeDataApiKey(): string | undefined {
  return process.env.YOUTUBE_DATA_API_KEY?.trim() || undefined;
}

export function isYoutubeConfigured(): boolean {
  return !!getYoutubeDataApiKey();
}

/** TikTok Login Kit app credentials; creator OAuth tokens live in Supabase. */
export function getTiktokClientKey(): string | undefined {
  return process.env.TIKTOK_CLIENT_KEY?.trim() || undefined;
}

export function getTiktokClientSecret(): string | undefined {
  return process.env.TIKTOK_CLIENT_SECRET?.trim() || undefined;
}

export function isTiktokConfigured(): boolean {
  return !!getTiktokClientKey() && !!getTiktokClientSecret();
}

export function getConfiguredViewProviderNames(): ViewProviderName[] {
  const providers: ViewProviderName[] = [];
  if (isYoutubeConfigured()) providers.push("youtube_official");
  return providers;
}

export function isTrustedViewSourceConfigured(): boolean {
  return getConfiguredViewProviderNames().length > 0;
}

/**
 * Payout/earnings safety guard (defense-in-depth). Real money must NEVER move
 * without at least one trusted live view source. validateWorkerEnv() already
 * hard-fails at startup when none are configured; this additionally halts the
 * earnings-accrual and payout paths if all providers are removed at runtime.
 */
export function payoutSafetyBlocked(): boolean {
  return !isTrustedViewSourceConfigured();
}

export interface EnvValidation {
  /** Hard failures — the worker cannot run safely; startup must abort. */
  errors: string[];
  /** Non-fatal notices worth surfacing (defaults applied, degraded modes). */
  warnings: string[];
}

/**
 * Validate the worker's environment at startup (fail fast with clear messages
 * instead of a deep stack trace mid-job). The worker requires Supabase URL +
 * service-role key and at least one live view source, and surfaces warnings for
 * missing Redis / Stripe so misconfiguration is obvious in the logs.
 */
export function validateWorkerEnv(): EnvValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    errors.push("NEXT_PUBLIC_SUPABASE_URL is required (your Supabase project URL).");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY is required (service-role key; bypasses RLS).");
  }

  if (!isTrustedViewSourceConfigured()) {
    errors.push(
      "YouTube-only beta requires YOUTUBE_DATA_API_KEY. The worker refuses to accrue earnings or pay creators on unverified views."
    );
  }
  if (!process.env.REDIS_URL?.trim()) {
    warnings.push(
      "REDIS_URL not set — defaulting to redis://localhost:6379. Set a managed Redis URL in production."
    );
  }
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    warnings.push(
      "STRIPE_SECRET_KEY not set — creator payouts and withdrawal reconciliation will fail until it is configured."
    );
  }

  return { errors, warnings };
}

/** Minimum gap between Ayrshare API calls (ms) — basic client-side rate limiting. */
export function getAyrshareMinIntervalMs(): number {
  const raw = Number(process.env.AYRSHARE_MIN_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 350;
}

/** Minimum gap between YouTube Data API calls (ms). */
export function getYoutubeMinIntervalMs(): number {
  const raw = Number(process.env.YOUTUBE_MIN_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 100;
}

/** Minimum gap between TikTok Display API calls (ms). */
export function getTiktokMinIntervalMs(): number {
  const raw = Number(process.env.TIKTOK_MIN_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 350;
}

export function getViewProviderMinIntervalMs(provider: ViewProviderName): number {
  if (provider === "youtube_official") return getYoutubeMinIntervalMs();
  if (provider === "tiktok_official") return getTiktokMinIntervalMs();
  return getAyrshareMinIntervalMs();
}

/** How often the repeatable view-sync fan-out runs (minutes). */
export function getViewSyncIntervalMinutes(): number {
  const raw = Number(process.env.VIEW_SYNC_INTERVAL_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

/** Max clips fanned out per sync cycle (keeps provider rate limits sane). */
export function getViewSyncBatchSize(): number {
  const raw = Number(process.env.VIEW_SYNC_BATCH_SIZE);
  return Number.isFinite(raw) && raw > 0 ? raw : 200;
}

/**
 * Default settle delay before accrued earnings become payable. Used as a
 * fallback only — each campaign carries its own view_holdback_hours.
 */
export function getViewHoldbackHours(): number {
  const raw = Number(process.env.VIEW_HOLDBACK_HOURS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 48;
}

/** Minimum approved balance (per creator) before a payout is issued. */
export function getMinPayoutThreshold(): number {
  const raw = Number(process.env.MIN_PAYOUT_THRESHOLD);
  return Number.isFinite(raw) && raw >= 0 ? raw : 10;
}

/**
 * A withdrawal payout stuck in 'processing' longer than this (minutes) is
 * reconciled by the payout batch — the transfer is re-issued with its stable
 * idempotency key (Stripe returns the original; never double-pays) then settled.
 */
export function getWithdrawalReconcileStuckMinutes(): number {
  const raw = Number(process.env.WITHDRAWAL_RECONCILE_STUCK_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

/** How often the payout-batch job runs (minutes). Default 6h. */
export function getPayoutBatchIntervalMinutes(): number {
  const raw = Number(process.env.PAYOUT_BATCH_INTERVAL);
  return Number.isFinite(raw) && raw > 0 ? raw : 360;
}

/**
 * Whether the worker AUTO-PAYS approved earnings. Default false: payouts are
 * creator-initiated (manual withdrawals with a fee). The batch still PROMOTES
 * accrued→approved past holdback so balances become withdrawable. Set true to
 * restore fully-automated payouts.
 */
export function autoPayoutsEnabled(): boolean {
  return (process.env.WORKER_AUTO_PAYOUTS ?? "").trim().toLowerCase() === "true";
}

/**
 * How often the pool-funding reconciliation job runs (minutes) — the safety net
 * for performance campaigns stuck in 'draft' after a missed/delayed
 * payment_intent.succeeded webhook. Default 15m.
 */
export function getPoolReconciliationIntervalMinutes(): number {
  const raw = Number(process.env.POOL_FUNDING_RECONCILIATION_INTERVAL_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 15;
}

/**
 * A funded campaign still stuck in 'draft' (PaymentIntent not yet succeeded)
 * longer than this fires a [ALERT]. Default 120m — generous, so normal webhook
 * delays don't page.
 */
export function getFundingStuckAlertMinutes(): number {
  const raw = Number(process.env.POOL_FUNDING_STUCK_ALERT_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 120;
}

/** How often the worker emits a heartbeat (queue depths + counters), minutes. */
export function getHeartbeatIntervalMinutes(): number {
  const raw = Number(process.env.WORKER_HEARTBEAT_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

/**
 * Views-provider errors within a single heartbeat window at or above this count
 * fire a [ALERT] (signals the configured view provider is degraded).
 */
export function getProviderErrorAlertThreshold(): number {
  const raw = Number(process.env.WORKER_PROVIDER_ERROR_ALERT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

/**
 * Auto-disqualifications within a single heartbeat window at or above this count
 * fire a [ALERT] — a spike usually means a provider returning bad data or a
 * misconfigured threshold mass-disqualifying legitimate creators (scoring anomaly).
 */
export function getFraudDisqualifyRateAlertThreshold(): number {
  const raw = Number(process.env.WORKER_FRAUD_DISQUALIFY_RATE_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : 25;
}

/** Minimum cross-campaign fraud events in the lookback window to flag a repeat offender. */
export function getFraudRepeatOffenderMinEvents(): number {
  const raw = Number(process.env.WORKER_FRAUD_REPEAT_OFFENDER_MIN_EVENTS);
  return Number.isFinite(raw) && raw >= 2 ? raw : 3;
}

/**
 * Port for the worker health endpoint (Docker/k8s probes). Default 8080.
 * Set WORKER_HEALTH_PORT=0 to disable the server (e.g. platforms with no probes).
 */
export function getHealthPort(): number {
  const raw = process.env.WORKER_HEALTH_PORT;
  if (raw == null || raw.trim() === "") return 8080;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 8080;
}

/** Parse a numeric env var with a fallback and a minimum allowed value. */
function numEnv(name: string, fallback: number, min = 0): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= min ? raw : fallback;
}

/**
 * Anti-fraud thresholds for view-sync. Starts from the conservative defaults in
 * worker/fraud.ts and lets each be tuned via FRAUD_* env vars without code
 * changes. Platform-specific scaling (TikTok vs Instagram) is applied on top of
 * these by fraud.platformThresholds().
 */
export function getFraudConfig(): FraudConfig {
  const d = defaultFraudConfig();
  return {
    maxGrowthFactor: numEnv("FRAUD_MAX_GROWTH_FACTOR", d.maxGrowthFactor, 1),
    maxAbsoluteJump: numEnv("FRAUD_MAX_ABSOLUTE_JUMP", d.maxAbsoluteJump, 1),
    factorCheckMinBaseline: numEnv("FRAUD_FACTOR_MIN_BASELINE", d.factorCheckMinBaseline, 0),
    spikeMultiplier: numEnv("FRAUD_SPIKE_MULTIPLIER", d.spikeMultiplier, 1),
    spikeMinDelta: numEnv("FRAUD_SPIKE_MIN_DELTA", d.spikeMinDelta, 0),
    spikeMinHistory: numEnv("FRAUD_SPIKE_MIN_HISTORY", d.spikeMinHistory, 1),
    botMinSnapshots: numEnv("FRAUD_BOT_MIN_SNAPSHOTS", d.botMinSnapshots, 2),
    botCvThreshold: numEnv("FRAUD_BOT_CV_THRESHOLD", d.botCvThreshold, 0),
    botMinDelta: numEnv("FRAUD_BOT_MIN_DELTA", d.botMinDelta, 0),
    historyWindow: numEnv("FRAUD_HISTORY_SNAPSHOTS", d.historyWindow, 1),
    engagementMinViews: numEnv("FRAUD_ENGAGEMENT_MIN_VIEWS", d.engagementMinViews, 0),
    engagementMinRatio: numEnv("FRAUD_ENGAGEMENT_MIN_RATIO", d.engagementMinRatio, 0),
    anomalyWindowMinutes: numEnv("FRAUD_ANOMALY_WINDOW_MINUTES", d.anomalyWindowMinutes, 0),
    anomalyMinViews: numEnv("FRAUD_ANOMALY_MIN_VIEWS", d.anomalyMinViews, 0),
    viewDropMinViews: numEnv("FRAUD_VIEW_DROP_MIN_VIEWS", d.viewDropMinViews, 0),
    viewDropPct: numEnv("FRAUD_VIEW_DROP_PCT", d.viewDropPct, 0),
    creatorBurstWindowMinutes: numEnv("FRAUD_CREATOR_BURST_WINDOW_MINUTES", d.creatorBurstWindowMinutes, 1),
    creatorBurstMaxClips: numEnv("FRAUD_CREATOR_BURST_MAX_CLIPS", d.creatorBurstMaxClips, 1),
    decayHalfLifeMinutes: numEnv("FRAUD_DECAY_HALF_LIFE_MINUTES", d.decayHalfLifeMinutes, 1),
    velocityWeight: numEnv("FRAUD_WEIGHT_VELOCITY", d.velocityWeight, 0),
    spikeWeight: numEnv("FRAUD_WEIGHT_SPIKE", d.spikeWeight, 0),
    botWeight: numEnv("FRAUD_WEIGHT_BOT", d.botWeight, 0),
    engagementWeight: numEnv("FRAUD_WEIGHT_ENGAGEMENT", d.engagementWeight, 0),
    anomalyWeight: numEnv("FRAUD_WEIGHT_ANOMALY", d.anomalyWeight, 0),
    crossCampaignWeight: numEnv("FRAUD_WEIGHT_CROSS_CAMPAIGN", d.crossCampaignWeight, 0),
    viewDropWeight: numEnv("FRAUD_WEIGHT_VIEW_DROP", d.viewDropWeight, 0),
    creatorBurstWeight: numEnv("FRAUD_WEIGHT_CREATOR_BURST", d.creatorBurstWeight, 0),
    disqualifyScore: numEnv("FRAUD_DISQUALIFY_SCORE", d.disqualifyScore, 1),
    flagScore: numEnv("FRAUD_FLAG_SCORE", d.flagScore, 1),
  };
}
