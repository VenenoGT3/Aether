/**
 * In-memory concurrency limiter (backpressure / load shedding). SERVER-ONLY.
 *
 * Each named limiter caps how many heavy operations run CONCURRENTLY per process.
 * At capacity we SHED (reject immediately with a 503) rather than queue — queuing
 * under sustained overload just turns a fast failure into a slow one and grows
 * memory/latency unboundedly. Clients get a clean 503 + Retry-After to back off.
 *
 * Process-local (per instance), like the circuit breaker. With N instances the
 * effective ceiling is N × max — the intended per-instance protection.
 */

import { logger } from "@/lib/logger";
import { jsonError } from "@/lib/api/response";

export interface Slot {
  /** Release the slot. Idempotent (safe to call once, in a finally block). */
  release(): void;
}

export class ConcurrencyLimiter {
  private active = 0;
  constructor(
    readonly name: string,
    readonly max: number
  ) {}

  /** Acquire a slot, or null when at capacity (caller should shed → 503). */
  tryAcquire(): Slot | null {
    if (this.active >= this.max) {
      logger.warn(
        { limiter: this.name, active: this.active, max: this.max },
        "backpressure.shed"
      );
      return null;
    }
    this.active += 1;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.active -= 1;
      },
    };
  }

  get inFlight(): number {
    return this.active;
  }
}

const registry = new Map<string, ConcurrencyLimiter>();

/**
 * Get (or lazily create) a named limiter. The FIRST call's `max` wins, so use a
 * consistent `max` for a given name across call sites.
 */
export function getLimiter(name: string, max: number): ConcurrencyLimiter {
  let limiter = registry.get(name);
  if (!limiter) {
    limiter = new ConcurrencyLimiter(name, max);
    registry.set(name, limiter);
  }
  return limiter;
}

/** In-flight counts for every active limiter (for the health endpoint). */
export function limiterStats(): Record<string, { inFlight: number; max: number }> {
  const out: Record<string, { inFlight: number; max: number }> = {};
  for (const [name, limiter] of registry) {
    out[name] = { inFlight: limiter.inFlight, max: limiter.max };
  }
  return out;
}

/** Standard safe 503 shed response (existing error system + Retry-After hint). */
export function busyResponse(): Response {
  const res = jsonError("The service is busy right now. Please try again in a moment.", 503);
  res.headers.set("Retry-After", "2");
  return res;
}
