/**
 * Worker environment access.
 *
 * The worker is a standalone Node process — NOT the Next.js runtime — so it must
 * never import `@/lib/env.server` or `@/lib/supabase/admin` (both `import
 * "server-only"`, which throws outside a React Server context). It reads
 * process.env directly and legitimately uses the Supabase service role.
 */

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
