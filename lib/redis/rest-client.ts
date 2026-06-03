/**
 * Connectionless Redis client over the Upstash/Vercel-KV REST API.
 *
 * WHY REST (not ioredis): the Next.js app runs on serverless/edge runtimes where
 * persistent TCP pools are an anti-pattern (one connection per invocation →
 * connection exhaustion under load). The REST API is stateless HTTP, so it scales
 * with the function fleet. The BullMQ WORKER keeps using ioredis (long-lived
 * process) — this client is ONLY for the request path (rate limiting + caching).
 *
 * Configured via UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or the Vercel
 * KV aliases KV_REST_API_URL / KV_REST_API_TOKEN). When UNCONFIGURED, every call
 * returns { ok: false, reason: "unconfigured" } so callers fall back to local
 * behavior — the layer is fully backward compatible / opt-in.
 *
 * SAFETY: a per-command AbortController timeout (backpressure — a slow Redis must
 * never stall a request) + a process-local circuit breaker (after N consecutive
 * failures, fail fast for a cooldown so we don't hammer a degraded Redis or pile
 * up latency). Both fail OPEN: on any Redis trouble, callers use their fallback.
 */

import * as Sentry from "@sentry/nextjs";
import { getCircuitBreaker } from "@/lib/circuit-breaker";
import { fetchWithTimeout, fetchWithRetry } from "@/lib/fetch-utils";

// Idempotent Redis read commands — safe to retry after a transient blip/timeout.
// Writes (EVAL/INCR/SET/SET NX/DEL) are NOT retried: a retry after a timeout
// could double-apply (e.g. double-INCR a rate-limit counter) or mis-signal a lock.
const REDIS_READ_COMMANDS = new Set([
  "GET",
  "MGET",
  "EXISTS",
  "TTL",
  "PTTL",
  "STRLEN",
  "HGET",
  "HGETALL",
  "SCARD",
  "ZCARD",
  "LLEN",
  "GETRANGE",
]);

type RedisOk = { ok: true; result: unknown };
type RedisErr = { ok: false; reason: "unconfigured" | "circuit_open" | "timeout" | "error"; error?: string };
export type RedisResult = RedisOk | RedisErr;

interface RedisConfig {
  url: string;
  token: string;
  timeoutMs: number;
}

function loadConfig(): RedisConfig | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() ||
    process.env.KV_REST_API_URL?.trim() ||
    "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() ||
    process.env.KV_REST_API_TOKEN?.trim() ||
    "";
  if (!url || !token) return null;
  const t = Number(process.env.REDIS_REST_TIMEOUT_MS);
  return { url, token, timeoutMs: Number.isFinite(t) && t > 0 ? t : 1000 };
}

// Resolved once per process (module load). Re-reading env per call is wasteful.
const CONFIG = loadConfig();

export function isRedisConfigured(): boolean {
  return CONFIG !== null;
}

// Process-local circuit breaker (shared implementation): after 5 consecutive
// infra failures the breaker OPENS for 30s, then a half-open trial probes Redis.
// We fail OPEN by returning { reason: "circuit_open" } (callers fall back), so we
// use allowRequest()/recordSuccess()/recordFailure() rather than exec() (no throw).
const redisBreaker = getCircuitBreaker("redis", { failureThreshold: 5, openDurationMs: 30_000 });

/**
 * Execute a single Redis command. `args` is the command + arguments
 * (e.g. ["INCR", key] or ["EVAL", script, "1", key, arg]). Never throws.
 */
export async function redisCommand(args: (string | number)[]): Promise<RedisResult> {
  if (!CONFIG) return { ok: false, reason: "unconfigured" };

  if (!redisBreaker.allowRequest()) return { ok: false, reason: "circuit_open" };

  // Performance span for the Redis round-trip (no-op without active tracing).
  const op = String(args[0] ?? "CMD").toUpperCase();
  return Sentry.startSpan(
    { name: `redis ${op}`, op: "db.redis", attributes: { "db.system": "redis", "db.operation": op } },
    () => execRedisCommand(args)
  );
}

async function execRedisCommand(args: (string | number)[]): Promise<RedisResult> {
  const cfg = CONFIG as RedisConfig;
  const op = String(args[0] ?? "").toUpperCase();
  const init: RequestInit = {
    method: "POST",
    headers: {
      authorization: `Bearer ${cfg.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  };
  // Reads retry transient blips (small backoff to stay fast on the request hot
  // path); writes time out without retry (non-idempotent — see REDIS_READ_COMMANDS).
  // Redis stays on a SHORT timeout (default 1s) on purpose: a slow Redis must
  // fail fast and fall back, not add latency to every request.
  try {
    const res = REDIS_READ_COMMANDS.has(op)
      ? await fetchWithRetry(cfg.url, init, {
          attempts: 2,
          timeoutMs: cfg.timeoutMs,
          baseDelayMs: 50,
          maxDelayMs: 300,
        })
      : await fetchWithTimeout(cfg.url, init, cfg.timeoutMs);
    if (!res.ok) {
      redisBreaker.recordFailure(new Error(`redis http_${res.status}`));
      return { ok: false, reason: "error", error: `http_${res.status}` };
    }
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (json.error) {
      // A command-level error (bad script, WRONGTYPE) is NOT an infra failure —
      // don't trip the breaker, but surface it.
      return { ok: false, reason: "error", error: json.error };
    }
    redisBreaker.recordSuccess();
    return { ok: true, result: json.result };
  } catch (err) {
    const aborted = (err as { name?: string } | null)?.name === "AbortError";
    redisBreaker.recordFailure(err);
    return {
      ok: false,
      reason: aborted ? "timeout" : "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** EVAL a Lua script (numKeys keys). Returns the raw decoded result. */
export async function redisEval(
  script: string,
  keys: string[],
  argv: (string | number)[]
): Promise<RedisResult> {
  return redisCommand(["EVAL", script, String(keys.length), ...keys, ...argv]);
}

export async function redisGet(key: string): Promise<RedisResult> {
  return redisCommand(["GET", key]);
}

/** SET with optional NX (only-if-absent) and PX (ms TTL). */
export async function redisSet(
  key: string,
  value: string,
  opts?: { nx?: boolean; pxMs?: number }
): Promise<RedisResult> {
  const args: (string | number)[] = ["SET", key, value];
  if (opts?.pxMs && opts.pxMs > 0) args.push("PX", Math.floor(opts.pxMs));
  if (opts?.nx) args.push("NX");
  return redisCommand(args);
}
