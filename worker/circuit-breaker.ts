import { log } from "./logger";

/**
 * Worker-local circuit breaker. Mirrors lib/circuit-breaker.ts, but the worker is
 * a standalone Node process that must NOT import Next.js / `server-only` modules
 * (lib/circuit-breaker pulls next/server + @sentry/nextjs via lib/errors), so it
 * reports through the worker's structured `log` ([ALERT] paging) instead of Sentry.
 *
 * Semantics: 5 consecutive failures → OPEN 30s → HALF_OPEN (one trial) → CLOSED.
 * Process-local (per worker instance).
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  failureThreshold?: number;
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

  getState(): CircuitState {
    if (this.state === "open" && Date.now() >= this.openUntil) {
      this.state = "half_open";
      log.info("circuit.half_open", { breaker: this.name });
    }
    return this.state;
  }

  allowRequest(): boolean {
    return this.getState() !== "open";
  }

  recordSuccess(): void {
    if (this.state !== "closed" || this.failures > 0) {
      log.info("circuit.closed", { breaker: this.name, recoveredFrom: this.state });
    }
    this.failures = 0;
    this.openUntil = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    if (this.state === "half_open") {
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.trip();
  }

  private trip(): void {
    const alreadyOpen = this.state === "open";
    this.state = "open";
    this.openUntil = Date.now() + this.openDurationMs;
    if (!alreadyOpen) {
      // [ALERT] once on the OPEN transition (not on every short-circuit).
      log.alert("circuit.open", {
        breaker: this.name,
        failures: this.failures,
        openForMs: this.openDurationMs,
      });
    }
  }

  /**
   * Run `fn` through the breaker. Throws when OPEN (caller should treat as a
   * transient failure and retry later); otherwise records the outcome and
   * rethrows the original error on failure.
   */
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.allowRequest()) {
      throw new Error(`circuit "${this.name}" is open`);
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
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
