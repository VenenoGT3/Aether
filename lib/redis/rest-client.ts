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

import { apiLog } from "@/lib/api/trace-log";

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

// ---- Process-local circuit breaker ----
const CB_FAILURE_THRESHOLD = 5;
const CB_COOLDOWN_MS = 15_000;
let cbConsecutiveFailures = 0;
let cbOpenUntil = 0;

function circuitOpen(now: number): boolean {
  return now < cbOpenUntil;
}

function recordSuccess(): void {
  cbConsecutiveFailures = 0;
  cbOpenUntil = 0;
}

function recordFailure(): void {
  cbConsecutiveFailures += 1;
  if (cbConsecutiveFailures >= CB_FAILURE_THRESHOLD && cbOpenUntil === 0) {
    cbOpenUntil = Date.now() + CB_COOLDOWN_MS;
    apiLog("alert", "redis.circuit_open", {
      consecutiveFailures: cbConsecutiveFailures,
      cooldownMs: CB_COOLDOWN_MS,
    });
  }
}

/**
 * Execute a single Redis command. `args` is the command + arguments
 * (e.g. ["INCR", key] or ["EVAL", script, "1", key, arg]). Never throws.
 */
export async function redisCommand(args: (string | number)[]): Promise<RedisResult> {
  if (!CONFIG) return { ok: false, reason: "unconfigured" };

  const now = Date.now();
  if (circuitOpen(now)) return { ok: false, reason: "circuit_open" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
  try {
    const res = await fetch(CONFIG.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${CONFIG.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      recordFailure();
      return { ok: false, reason: "error", error: `http_${res.status}` };
    }
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (json.error) {
      // A command-level error (bad script, WRONGTYPE) is NOT an infra failure —
      // don't trip the breaker, but surface it.
      return { ok: false, reason: "error", error: json.error };
    }
    recordSuccess();
    return { ok: true, result: json.result };
  } catch (err) {
    const aborted = (err as { name?: string } | null)?.name === "AbortError";
    recordFailure();
    return {
      ok: false,
      reason: aborted ? "timeout" : "error",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
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
