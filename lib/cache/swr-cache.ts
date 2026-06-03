/**
 * Distributed cache with Stale-While-Revalidate (SWR), probabilistic early
 * expiration (XFetch), and single-flight stampede protection.
 *
 * THE STAMPEDE PROBLEM: a hot key (e.g. the discovery feed every authenticated
 * creator loads) expires → every concurrent request misses simultaneously and
 * all hammer the database at once (thundering herd). Three defenses, layered:
 *
 *   1. SINGLE-FLIGHT LOCK — on a miss/expiry, only ONE request acquires a Redis
 *      lock (SET NX PX) and recomputes; everyone else serves the stale value
 *      (SWR) or briefly waits on a cold start. So N concurrent misses cause 1
 *      recompute, not N.
 *   2. XFETCH (Vattani et al.) — readers probabilistically treat a still-fresh
 *      entry as expired slightly EARLY, weighted by how long the recompute took
 *      (`delta`). This spreads recomputes out BEFORE the hard expiry instead of
 *      synchronizing them at the expiry instant.
 *   3. STALE-WHILE-REVALIDATE — past expiry, the value is still served (within a
 *      grace window) while the single-flight holder refreshes it, so users never
 *      block on a cold recompute.
 *
 * Serverless note: there are no background tasks after a response returns, so
 * "revalidate" here means the lock holder recomputes SYNCHRONOUSLY while other
 * callers get the stale value immediately. When Redis is unconfigured or its
 * circuit is open, `cached()` degrades to a direct compute() — fully backward
 * compatible and never a hard dependency.
 */

import { randomUUID } from "node:crypto";
import { isRedisConfigured, redisGet, redisSet, redisCommand } from "@/lib/redis/rest-client";
import { apiLog } from "@/lib/api/trace-log";
import * as Sentry from "@sentry/nextjs";

const ENV = (process.env.VERCEL_ENV || process.env.NODE_ENV || "dev").trim();

interface Envelope<T> {
  /** Cached value. */
  v: T;
  /** Created-at epoch ms. */
  t: number;
  /** Soft TTL ms (fresh window). */
  ttl: number;
  /** Compute duration ms (drives XFetch early expiration). */
  d: number;
}

export interface CacheOptions<T> {
  /** Logical key within the namespace (e.g. a query signature). */
  key: string;
  /** Cache namespace (e.g. "discover", "wallet"). */
  namespace: string;
  /** Tenant scope for isolation (creatorId / businessId / "_global_"). */
  tenant?: string | null;
  /** Soft TTL — value is "fresh" for this long. */
  ttlMs: number;
  /** Extra window past the soft TTL during which a stale value may be served. */
  staleGraceMs?: number;
  /** XFetch aggressiveness (higher = earlier recompute). Default 1. */
  beta?: number;
  /** Single-flight lock lease. Default 5s. */
  lockTtlMs?: number;
  /** The expensive computation to cache. MUST be idempotent + side-effect-free. */
  compute: () => Promise<T>;
  /** Optional trace id to correlate logs. */
  traceId?: string;
}

function buildKey(namespace: string, tenant: string | null | undefined, key: string): string {
  // aether:{env}:cache:{namespace}:{tenant}:{key}
  return `aether:${ENV}:cache:${namespace}:${tenant ?? "_global_"}:${key}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * XFetch: should a reader recompute a still-fresh entry early?
 * recompute when:  now - delta * beta * ln(rand) >= createdAt + ttl
 * (Vattani, Cafarella, Ré — "Optimal Probabilistic Cache Stampede Prevention").
 */
function shouldEarlyRecompute(env: Envelope<unknown>, now: number, beta: number): boolean {
  const expiry = env.t + env.ttl;
  const rand = Math.random();
  // ln(rand) is negative; -delta*beta*ln(rand) is a positive jitter that grows
  // with compute cost — pricier recomputes start earlier (more headroom).
  const xfetch = env.d * beta * -Math.log(rand === 0 ? Number.MIN_VALUE : rand);
  return now - xfetch >= expiry;
}

/**
 * Get-or-compute with SWR + stampede protection. Returns the value (cached,
 * stale, or freshly computed). Never throws on cache-infra problems — it falls
 * back to compute().
 */
export async function cached<T>(opts: CacheOptions<T>): Promise<T> {
  return Sentry.startSpan(
    {
      name: `cache ${opts.namespace}`,
      op: "cache.get",
      attributes: { "cache.namespace": opts.namespace, "cache.key": opts.key },
    },
    (span) => cachedInner(opts, span)
  );
}

async function cachedInner<T>(
  opts: CacheOptions<T>,
  span: { setAttribute(key: string, value: boolean | string): void }
): Promise<T> {
  const beta = opts.beta ?? 1;
  const staleGraceMs = opts.staleGraceMs ?? Math.max(opts.ttlMs, 30_000);
  const lockTtlMs = opts.lockTtlMs ?? 5_000;
  const traceId = opts.traceId ?? randomUUID();

  // No Redis configured / available → behave exactly as before (direct compute).
  if (!isRedisConfigured()) {
    span.setAttribute("cache.hit", false);
    return opts.compute();
  }

  const cacheKey = buildKey(opts.namespace, opts.tenant, opts.key);
  const lockKey = `${cacheKey}:lock`;

  const computeAndStore = async (): Promise<T> => {
    const startedAt = Date.now();
    const value = await opts.compute();
    const env: Envelope<T> = {
      v: value,
      t: Date.now(),
      ttl: opts.ttlMs,
      d: Math.max(Date.now() - startedAt, 1),
    };
    // Hard key TTL = soft TTL + grace, so a stale entry survives long enough to
    // be served during revalidation, then self-evicts (no memory leak).
    await redisSet(cacheKey, JSON.stringify(env), { pxMs: opts.ttlMs + staleGraceMs });
    return value;
  };

  const tryLock = async (): Promise<boolean> => {
    const r = await redisSet(lockKey, traceId, { nx: true, pxMs: lockTtlMs });
    return r.ok && r.result === "OK";
  };

  const readEnvelope = async (): Promise<Envelope<T> | null> => {
    const r = await redisGet(cacheKey);
    if (!r.ok || r.result == null || typeof r.result !== "string") return null;
    try {
      return JSON.parse(r.result) as Envelope<T>;
    } catch {
      return null;
    }
  };

  const env = await readEnvelope();
  const now = Date.now();
  span.setAttribute("cache.hit", false); // overridden to true on a fresh hit below

  if (env) {
    const expiry = env.t + env.ttl;
    const fresh = now < expiry && !shouldEarlyRecompute(env, now, beta);
    if (fresh) {
      span.setAttribute("cache.hit", true);
      return env.v; // hot path: fresh hit
    }

    // Expired or early-expire selected → ONE caller refreshes, others serve stale.
    if (await tryLock()) {
      try {
        return await computeAndStore();
      } catch (err) {
        apiLog("warn", "cache.revalidate_failed", {
          traceId,
          key: cacheKey,
          error: err instanceof Error ? err.message : String(err),
        });
        // Refresh failed but we still hold a usable (stale) value within grace.
        if (now < expiry + staleGraceMs) return env.v;
        throw err;
      }
    }
    // Lock held by another request → SWR: serve stale immediately.
    return env.v;
  }

  // ---- Cold miss (no value): single-flight so N cold callers cause 1 compute. ----
  if (await tryLock()) {
    return computeAndStore();
  }

  // Another request is computing the cold value. Wait briefly for it, then read.
  const COLD_WAIT_TOTAL_MS = Math.min(lockTtlMs, 1_500);
  const STEP_MS = 75;
  for (let waited = 0; waited < COLD_WAIT_TOTAL_MS; waited += STEP_MS) {
    await sleep(STEP_MS);
    const hot = await readEnvelope();
    if (hot) return hot.v;
  }

  // Holder is slow/dead and the value is still cold. Fail open: compute directly
  // (do not store — let the holder win) so the request never hangs. Flag the
  // contention so a persistently-hot cold key is visible.
  apiLog("alert", "cache.stampede_contention", {
    traceId,
    key: cacheKey,
    note: "cold-miss lock contention; computing without cache",
  });
  return opts.compute();
}

/** Best-effort invalidation (delete the key). No-op when Redis is unconfigured. */
export async function invalidate(
  namespace: string,
  key: string,
  tenant?: string | null
): Promise<void> {
  if (!isRedisConfigured()) return;
  await redisCommand(["DEL", buildKey(namespace, tenant, key)]);
}
