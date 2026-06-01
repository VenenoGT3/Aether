/**
 * In-memory sliding-window rate limiter for API abuse protection.
 * Suitable for single-instance dev/small deploys. For multi-region production,
 * replace with Redis/Upstash (see docs/SECURITY.md).
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup(now: number, windowMs: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > windowMs) buckets.delete(key);
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  cleanup(now, windowMs);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    const retryAfterSec = Math.ceil(
      (windowMs - (now - bucket.windowStart)) / 1000
    );
    return { allowed: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  bucket.count += 1;
  return { allowed: true };
}

/** Preset limits for public-ish API surfaces */
export const RATE_LIMITS = {
  ai: { limit: 20, windowMs: 60_000 },
  metrics: { limit: 30, windowMs: 60_000 },
  apply: { limit: 10, windowMs: 60_000 },
  webhook: { limit: 200, windowMs: 60_000 },
} as const;