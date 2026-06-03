/**
 * Rate limiter — distributed (Redis) when configured, in-memory otherwise.
 *
 * The in-memory limiter below is PER-PROCESS: on a multi-instance serverless
 * fleet (Vercel) the effective limit is `limit × instances` and resets on cold
 * start — i.e. it does not actually bound abuse globally. When Upstash/Vercel-KV
 * REST is configured, `applyRateLimitAsync` enforces a SHARED, atomic fixed
 * window across the whole fleet via a single EVAL (INCR + PEXPIRE). On any Redis
 * trouble it FAILS OPEN to the in-memory limiter (a Redis outage must never lock
 * every user out). Keys combine route + IP (+ authenticated user when available).
 */

import { redisEval, isRedisConfigured } from "@/lib/redis/rest-client";
import { apiLog } from "@/lib/api/trace-log";

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

/** Per-user / per-session presets */
export const RATE_LIMITS = {
  ai: { limit: 20, windowMs: 60_000 },
  discover: { limit: 15, windowMs: 60_000 },
  search: { limit: 60, windowMs: 60_000 },
  apply: { limit: 5, windowMs: 60_000 },
  submit: { limit: 8, windowMs: 60_000 },
  metrics: { limit: 25, windowMs: 60_000 },
  webhook: { limit: 200, windowMs: 60_000 },
  cron: { limit: 10, windowMs: 60_000 },
} as const;

/**
 * Per-IP ceilings for abuse-prone routes (multi-account spam, scraping).
 * Applied in addition to per-user limits when preset is in DUAL_IP_PRESETS.
 */
export const RATE_LIMITS_IP: Partial<
  Record<keyof typeof RATE_LIMITS, { limit: number; windowMs: number }>
> = {
  apply: { limit: 12, windowMs: 60_000 },
  submit: { limit: 20, windowMs: 60_000 },
  search: { limit: 100, windowMs: 60_000 },
  discover: { limit: 30, windowMs: 60_000 },
  ai: { limit: 45, windowMs: 60_000 },
  metrics: { limit: 60, windowMs: 60_000 },
};

export const DUAL_IP_PRESETS = new Set<keyof typeof RATE_LIMITS>([
  "apply",
  "submit",
  "search",
  "discover",
  "ai",
  "metrics",
]);

export type RateLimitPreset = keyof typeof RATE_LIMITS;

export function applyRateLimit(
  request: Request,
  routeKey: string,
  preset: RateLimitPreset,
  userId?: string | null
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const rl = RATE_LIMITS[preset];
  const ip = getClientIp(request);
  const userKey = buildRateLimitKey(routeKey, ip, userId);
  const userResult = checkRateLimit(userKey, rl.limit, rl.windowMs);
  if (!userResult.allowed) {
    return { allowed: false, retryAfterSec: userResult.retryAfterSec ?? 60 };
  }

  if (DUAL_IP_PRESETS.has(preset)) {
    const ipRl = RATE_LIMITS_IP[preset] ?? {
      limit: rl.limit * 3,
      windowMs: rl.windowMs,
    };
    const ipKey = buildRateLimitKey(`${routeKey}:ip`, ip, null);
    const ipResult = checkRateLimit(ipKey, ipRl.limit, ipRl.windowMs);
    if (!ipResult.allowed) {
      return { allowed: false, retryAfterSec: ipResult.retryAfterSec ?? 60 };
    }
  }

  return { allowed: true };
}

// ---------------------------------------------------------------------------
// Distributed (Redis) fixed-window limiter.
// ---------------------------------------------------------------------------

/**
 * Atomic INCR + first-write PEXPIRE in ONE round-trip. Returns [count, pttlMs].
 * Atomicity matters: a non-atomic INCR-then-EXPIRE can lose the EXPIRE on a
 * crash/partition between the two calls → the key never expires (memory leak +
 * a user permanently throttled). A single EVAL eliminates that window.
 */
const RL_LUA = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1])) end
return {c, redis.call('PTTL', KEYS[1])}`;

const RL_PREFIX = `aether:${(process.env.VERCEL_ENV || process.env.NODE_ENV || "dev").trim()}:rl:`;

type WindowCheck = { allowed: boolean; retryAfterSec: number } | null;

/** One distributed window. Returns null on ANY Redis trouble (caller falls back). */
async function checkDistributedWindow(
  key: string,
  limit: number,
  windowMs: number
): Promise<WindowCheck> {
  const res = await redisEval(RL_LUA, [RL_PREFIX + key], [windowMs]);
  if (!res.ok || !Array.isArray(res.result)) return null;
  const count = Number((res.result as unknown[])[0] ?? 0);
  const pttl = Number((res.result as unknown[])[1] ?? windowMs);
  if (!Number.isFinite(count)) return null;
  if (count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((pttl > 0 ? pttl : windowMs) / 1000));
    return { allowed: false, retryAfterSec };
  }
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Distributed rate limit (fleet-wide) with in-memory fallback. Same dual
 * user+IP semantics as applyRateLimit. Emits an [ALERT] on a breach so abuse
 * spikes are visible; logs are trace-correlated.
 */
export async function applyRateLimitAsync(
  request: Request,
  routeKey: string,
  preset: RateLimitPreset,
  userId?: string | null
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  if (!isRedisConfigured()) {
    return applyRateLimit(request, routeKey, preset, userId);
  }

  const rl = RATE_LIMITS[preset];
  const ip = getClientIp(request);
  const userKey = buildRateLimitKey(routeKey, ip, userId);

  const userCheck = await checkDistributedWindow(userKey, rl.limit, rl.windowMs);
  if (userCheck === null) {
    // Redis unavailable mid-flight → fail open to the local limiter.
    return applyRateLimit(request, routeKey, preset, userId);
  }
  if (!userCheck.allowed) {
    apiLog("alert", "ratelimit.breach", {
      scope: "user",
      routeKey,
      preset,
      subject: userId ?? ip,
      retryAfterSec: userCheck.retryAfterSec,
    });
    return { allowed: false, retryAfterSec: userCheck.retryAfterSec };
  }

  if (DUAL_IP_PRESETS.has(preset)) {
    const ipRl = RATE_LIMITS_IP[preset] ?? { limit: rl.limit * 3, windowMs: rl.windowMs };
    const ipCheck = await checkDistributedWindow(`${routeKey}:ip:${ip}`, ipRl.limit, ipRl.windowMs);
    if (ipCheck && !ipCheck.allowed) {
      apiLog("alert", "ratelimit.breach", {
        scope: "ip",
        routeKey,
        preset,
        subject: ip,
        retryAfterSec: ipCheck.retryAfterSec,
      });
      return { allowed: false, retryAfterSec: ipCheck.retryAfterSec };
    }
  }

  return { allowed: true };
}