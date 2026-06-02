/**
 * Worker environment access.
 *
 * The worker is a standalone Node process — NOT the Next.js runtime — so it must
 * never import `@/lib/env.server` or `@/lib/supabase/admin` (both `import
 * "server-only"`, which throws outside a React Server context). It reads
 * process.env directly and legitimately uses the Supabase service role.
 */

import { defaultFraudConfig, type FraudConfig } from "./fraud";

export const isMockMode =
  (process.env.AETHER_MOCK_MODE ?? "").trim().toLowerCase() === "true";

/** Redis connection string for BullMQ (e.g. redis://localhost:6379). */
export function getRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || "redis://localhost:6379";
}

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (url) return url;
  if (isMockMode) return "https://placeholder-url.supabase.co";
  throw new Error("[worker] NEXT_PUBLIC_SUPABASE_URL is required.");
}

/** Service-role key — bypasses RLS. Valid here because this is not the Vercel runtime. */
export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (key) return key;
  if (isMockMode) return "placeholder-service-role-key";
  throw new Error(
    "[worker] SUPABASE_SERVICE_ROLE_KEY is required to run the view-sync worker."
  );
}

/** Ayrshare key for live view tracking. Absent => simulated views (mock provider). */
export function getAyrshareApiKey(): string | undefined {
  return process.env.AYRSHARE_API_KEY?.trim() || undefined;
}

/**
 * Use the real Ayrshare provider only when we have a key AND we're not in mock
 * mode. This is the single source of truth for provider selection — flip it on
 * simply by setting AYRSHARE_API_KEY (with AETHER_MOCK_MODE unset/false).
 */
export function isAyrshareEnabled(): boolean {
  return !isMockMode && !!getAyrshareApiKey();
}

/** Inverse of isAyrshareEnabled(): simulated views when mock mode or no key. */
export function shouldSimulateViews(): boolean {
  return !isAyrshareEnabled();
}

/**
 * Escape hatch (testing only): allow real-mode earnings/payouts even when views
 * are simulated — e.g. exercising real Stripe *test* transfers on staging
 * without Ayrshare. NEVER enable this in production. Defaults to false.
 */
export function allowSimulatedPayoutsInRealMode(): boolean {
  return (
    (process.env.ALLOW_SIMULATED_PAYOUTS_IN_REAL_MODE ?? "").trim().toLowerCase() ===
    "true"
  );
}

/**
 * The dangerous state: NOT mock mode, but views are simulated (no AYRSHARE_API_KEY).
 * Accruing/paying here would move real money for fake views.
 *
 * Note: mock mode is safe (simulated views are expected and Stripe transfers are
 * mocked), so this is deliberately false in mock mode.
 */
export function isRealModeSimulatingViews(): boolean {
  return !isMockMode && shouldSimulateViews();
}

/**
 * True when real earnings accrual / payouts must be BLOCKED: the dangerous state
 * above, and the testing override is not set. This is the single guard the
 * worker consults before any real money movement.
 */
export function simulatedEarningsBlocked(): boolean {
  return isRealModeSimulatingViews() && !allowSimulatedPayoutsInRealMode();
}

/** Minimum gap between Ayrshare API calls (ms) — basic client-side rate limiting. */
export function getAyrshareMinIntervalMs(): number {
  const raw = Number(process.env.AYRSHARE_MIN_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 350;
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

/** How often the payout-batch job runs (minutes). Default 6h. */
export function getPayoutBatchIntervalMinutes(): number {
  const raw = Number(process.env.PAYOUT_BATCH_INTERVAL);
  return Number.isFinite(raw) && raw > 0 ? raw : 360;
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
 * fire a [ALERT] (signals the provider — Ayrshare/simulated — is degraded).
 */
export function getProviderErrorAlertThreshold(): number {
  const raw = Number(process.env.WORKER_PROVIDER_ERROR_ALERT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
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
  };
}
