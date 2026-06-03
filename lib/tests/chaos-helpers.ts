/**
 * Chaos-engineering helpers for the resilience test suite.
 *
 * These drive the REAL resilience primitives (circuit breaker, concurrency
 * limiter, Upstash REST client, fetch timeout/retry) under injected failure so
 * the tests assert the system degrades SAFELY — fail-open, shed, short-circuit —
 * rather than cascading. Test-only: imports `vitest` and is never bundled by the
 * app (nothing in app/ or lib/ imports it).
 */

import { vi, type Mock } from "vitest";
import type { CircuitBreaker } from "@/lib/circuit-breaker";
import type { ConcurrencyLimiter, Slot } from "@/lib/backpressure";

/** Handle to undo an injected fault. Always call `restore()` in a finally. */
export interface ChaosHandle {
  restore(): void;
}

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// fetch fault injection (the seam shared by Upstash REST, Stripe, Supabase REST)
// ---------------------------------------------------------------------------

export interface ChaosFetchOptions {
  /** Delay before the response resolves/rejects (ms). Models a slow downstream. */
  latencyMs?: number;
  /** Reject every call with a network error (models an outage). Default false. */
  networkError?: boolean;
  /** Reject the first N calls, then behave normally (models a flaky downstream). */
  failFirst?: number;
  /** Reject promptly if the request's AbortSignal fires (honor caller timeouts). */
  honorAbort?: boolean;
  /** Status for successful responses. Default 200. */
  status?: number;
  /** Body for successful responses. Default Upstash-shaped `{ result: "OK" }`. */
  body?: unknown;
}

export interface ChaosFetchHandle extends ChaosHandle {
  mock: Mock;
}

/**
 * Replace `globalThis.fetch` with a controllable fake. When `honorAbort` is set,
 * a pending request rejects with an AbortError as soon as the caller's timeout
 * fires — so latency far above the timeout still resolves the test quickly.
 */
export function installChaosFetch(opts: ChaosFetchOptions = {}): ChaosFetchHandle {
  const {
    latencyMs = 0,
    networkError = false,
    failFirst = 0,
    honorAbort = true,
    status = 200,
    body = { result: "OK" },
  } = opts;

  const realFetch = globalThis.fetch;
  let call = 0;

  const mock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const n = ++call;
    const shouldFail = networkError || n <= failFirst;

    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      const signal = init?.signal ?? undefined;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal && honorAbort) signal.removeEventListener("abort", onAbort);
        fn();
      };

      const onAbort = () =>
        finish(() => reject(new DOMException("The operation was aborted.", "AbortError")));

      if (signal && honorAbort) {
        if (signal.aborted) return onAbort();
        signal.addEventListener("abort", onAbort, { once: true });
      }

      const timer = setTimeout(
        () =>
          finish(() => {
            if (shouldFail) {
              reject(new TypeError("fetch failed (chaos: simulated network error)"));
            } else {
              resolve(
                new Response(typeof body === "string" ? body : JSON.stringify(body), {
                  status,
                  headers: { "content-type": "application/json" },
                })
              );
            }
          }),
        Math.max(latencyMs, 0)
      );
    });
  });

  globalThis.fetch = mock as unknown as typeof fetch;
  return {
    mock,
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

/** A downstream (Stripe/Supabase) that NEVER responds until the caller aborts. */
export function makeHangingFetch(): ChaosHandle {
  return installChaosFetch({ latencyMs: 60_000, honorAbort: true });
}

// ---------------------------------------------------------------------------
// Redis (Upstash REST) chaos — exercises the real rest-client + its breaker
// ---------------------------------------------------------------------------

export interface RedisChaosEnv {
  url?: string;
  token?: string;
  /** Per-command timeout the client uses (REDIS_REST_TIMEOUT_MS). Default 20ms. */
  timeoutMs?: number;
}

type RedisClientModule = typeof import("@/lib/redis/rest-client");

/**
 * Run `body` against a FRESH instance of the real Upstash REST client, configured
 * (so it actually attempts calls) and wrapped in an injected-fault fetch. The
 * client reads its config + creates its circuit breaker at module load, so we set
 * env, install the chaos fetch, then `vi.resetModules()` + dynamic-import to get a
 * clean client (and a clean "redis" breaker) per scenario. Everything is restored
 * afterwards.
 */
export async function withChaoticRedis<T>(
  fetchOpts: ChaosFetchOptions,
  body: (redis: RedisClientModule, fetchMock: Mock) => Promise<T>,
  env: RedisChaosEnv = {}
): Promise<T> {
  const prev = {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    timeout: process.env.REDIS_REST_TIMEOUT_MS,
  };

  process.env.UPSTASH_REDIS_REST_URL = env.url ?? "https://chaos.upstash.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = env.token ?? "chaos-token";
  process.env.REDIS_REST_TIMEOUT_MS = String(env.timeoutMs ?? 20);

  const fetchHandle = installChaosFetch(fetchOpts);
  vi.resetModules();

  try {
    const redis = (await import("@/lib/redis/rest-client")) as RedisClientModule;
    return await body(redis, fetchHandle.mock);
  } finally {
    fetchHandle.restore();
    restoreEnv("UPSTASH_REDIS_REST_URL", prev.url);
    restoreEnv("UPSTASH_REDIS_REST_TOKEN", prev.token);
    restoreEnv("REDIS_REST_TIMEOUT_MS", prev.timeout);
    vi.resetModules();
  }
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

// ---------------------------------------------------------------------------
// Circuit breaker chaos
// ---------------------------------------------------------------------------

/** Record failures until the breaker trips OPEN (works for any failureThreshold). */
export function forceBreakerOpen(breaker: CircuitBreaker): CircuitBreaker {
  let guard = 0;
  while (breaker.getState() !== "open" && guard++ < 10_000) {
    breaker.recordFailure(new Error("chaos: forced failure"));
  }
  return breaker;
}

// ---------------------------------------------------------------------------
// Backpressure chaos
// ---------------------------------------------------------------------------

export interface SaturatedLimiter {
  /** The slots held to fill the limiter to capacity. */
  slots: Slot[];
  /** Attempt one more acquire — returns null while saturated (would shed → 503). */
  shed(): Slot | null;
  /** Release every held slot, restoring capacity. */
  releaseAll(): void;
}

/** Fill a limiter to capacity so further `tryAcquire()` calls shed. */
export function saturateLimiter(limiter: ConcurrencyLimiter): SaturatedLimiter {
  const slots: Slot[] = [];
  let slot: Slot | null;
  let guard = 0;
  while ((slot = limiter.tryAcquire()) !== null && guard++ < 100_000) {
    slots.push(slot);
  }
  return {
    slots,
    shed: () => limiter.tryAcquire(),
    releaseAll: () => {
      for (const s of slots) s.release();
      slots.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Generic slow / flaky dependency callables (for CircuitBreaker.exec, etc.)
// ---------------------------------------------------------------------------

/** A dependency call that resolves to `value` after `ms` (a slow but healthy call). */
export function makeSlowFn<T>(ms: number, value: T): () => Promise<T> {
  return async () => {
    await delay(ms);
    return value;
  };
}

/** A dependency that throws `failTimes` times, then resolves (a flaky call that heals). */
export function makeFlakyFn<T>(
  failTimes: number,
  value: T,
  makeError: () => Error = () => new Error("chaos: transient failure")
): () => Promise<T> {
  let calls = 0;
  return async () => {
    if (calls++ < failTimes) throw makeError();
    return value;
  };
}
