/**
 * Simple process-local circuit breaker. SERVER-ONLY (imports the logger + Sentry
 * via lib/errors). Protects a degraded external dependency from being hammered.
 *
 * State machine:
 *   CLOSED ──5 consecutive failures──▶ OPEN
 *   OPEN ──after 30s──▶ HALF_OPEN (one trial request allowed)
 *   HALF_OPEN ──success──▶ CLOSED   |   HALF_OPEN ──failure──▶ OPEN (reset 30s)
 *
 * "Process-local" = per Node instance (no shared Redis state). That is the right
 * tradeoff for a fast, dependency-free guard; each instance learns independently.
 *
 * Two usage styles:
 *   - `exec(fn)`     — throws a safe (expected) error when OPEN; for callers that
 *                      want to surface "service temporarily unavailable".
 *   - `allowRequest()` + `recordSuccess()` / `recordFailure()` — for callers that
 *      fail OPEN by returning a sentinel/fallback instead of throwing (e.g. Redis).
 */

import { AppError, reportError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the breaker. Default 5. */
  failureThreshold?: number;
  /** How long the breaker stays OPEN before a half-open trial. Default 30s. */
  openDurationMs?: number;
}

export class CircuitBreaker {
  readonly name: string;
  private readonly failureThreshold: number;
  private readonly openDurationMs: number;
  private state: CircuitState = "closed";
  private failures = 0;
  private openUntil = 0;

  constructor(name: string, opts: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.openDurationMs = opts.openDurationMs ?? 30_000;
  }

  /** Current state, lazily transitioning OPEN → HALF_OPEN once the cooldown elapses. */
  getState(): CircuitState {
    if (this.state === "open" && Date.now() >= this.openUntil) {
      this.state = "half_open";
      logger.info({ breaker: this.name }, "circuit.half_open");
    }
    return this.state;
  }

  /** True when a request may proceed (CLOSED, or a HALF_OPEN trial). */
  allowRequest(): boolean {
    return this.getState() !== "open";
  }

  recordSuccess(): void {
    if (this.state !== "closed" || this.failures > 0) {
      logger.info({ breaker: this.name, recoveredFrom: this.state }, "circuit.closed");
    }
    this.failures = 0;
    this.openUntil = 0;
    this.state = "closed";
  }

  recordFailure(cause?: unknown): void {
    // A failed half-open trial re-opens immediately; otherwise count toward the trip.
    if (this.state === "half_open") {
      this.trip(cause);
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.trip(cause);
  }

  private trip(cause?: unknown): void {
    const alreadyOpen = this.state === "open";
    this.state = "open";
    this.openUntil = Date.now() + this.openDurationMs;
    if (!alreadyOpen) {
      // Report the OPEN transition ONCE (Sentry + logs) — not on every short-circuit.
      reportError(
        new AppError(`Circuit "${this.name}" opened after ${this.failures} failure(s)`, {
          code: "external_service",
          expected: false,
          cause,
        }),
        { breaker: this.name, openForMs: this.openDurationMs }
      );
    }
  }

  /**
   * Run `fn` through the breaker. When OPEN, throws a SAFE expected error (maps to
   * a 503 "temporarily unavailable" user message, and is NOT re-reported per call —
   * the open transition already reported). Otherwise records the outcome and, on
   * failure, rethrows the ORIGINAL error so the caller's handler captures it.
   */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.allowRequest()) {
      throw new AppError(
        "This service is temporarily unavailable. Please try again shortly.",
        { code: "external_service", statusCode: 503, expected: true }
      );
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure(err);
      throw err;
    }
  }
}

const registry = new Map<string, CircuitBreaker>();

/** Get (or lazily create) a named, process-local circuit breaker. */
export function getCircuitBreaker(name: string, opts?: CircuitBreakerOptions): CircuitBreaker {
  let breaker = registry.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, opts);
    registry.set(name, breaker);
  }
  return breaker;
}

/**
 * Current state of every breaker that has been used (for the health endpoint).
 * Breakers are created lazily, so a name appears only after its first call.
 */
export function circuitBreakerStates(): Record<string, CircuitState> {
  const out: Record<string, CircuitState> = {};
  for (const [name, breaker] of registry) {
    out[name] = breaker.getState();
  }
  return out;
}
