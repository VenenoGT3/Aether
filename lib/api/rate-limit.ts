/**
 * In-memory sliding-window rate limiter.
 * Keys combine route + IP (+ authenticated user when available).
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

export function buildRateLimitKey(
  routeKey: string,
  ip: string,
  userId?: string | null
): string {
  if (userId) return `${routeKey}:user:${userId}`;
  return `${routeKey}:ip:${ip}`;
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

/** Presets — tuned for abuse prevention while keeping UX usable */
export const RATE_LIMITS = {
  /** AI generation (pitch, predict, safety) */
  ai: { limit: 20, windowMs: 60_000 },
  /** Creator/campaign matchmaking */
  discover: { limit: 15, windowMs: 60_000 },
  /** Campaign search / browse API */
  search: { limit: 60, windowMs: 60_000 },
  /** Apply to campaign (per user) */
  apply: { limit: 5, windowMs: 60_000 },
  /** Post / deliverable submission */
  submit: { limit: 8, windowMs: 60_000 },
  /** Metrics scrape */
  metrics: { limit: 25, windowMs: 60_000 },
  /** Stripe webhooks */
  webhook: { limit: 200, windowMs: 60_000 },
  /** Cron invocations */
  cron: { limit: 10, windowMs: 60_000 },
} as const;

export type RateLimitPreset = keyof typeof RATE_LIMITS;

export function applyRateLimit(
  request: Request,
  routeKey: string,
  preset: RateLimitPreset,
  userId?: string | null
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const rl = RATE_LIMITS[preset];
  const ip = getClientIp(request);
  const key = buildRateLimitKey(routeKey, ip, userId);
  const result = checkRateLimit(key, rl.limit, rl.windowMs);
  if (!result.allowed) {
    return { allowed: false, retryAfterSec: result.retryAfterSec ?? 60 };
  }
  return { allowed: true };
}