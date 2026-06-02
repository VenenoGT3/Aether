/**
 * Tiny in-process metric counters for the worker. No external deps — just plain
 * counters the heartbeat reads (and resets per window) so we get basic
 * observability and can fire [ALERT] logs on sustained problems without a
 * metrics backend.
 *
 * Scope: single worker process; counts reset on restart. This is deliberately
 * lightweight — for fleet-wide metrics, ship the structured logs to a backend.
 */

interface Counters {
  jobsCompleted: number;
  jobsFailed: number; // counts every failed attempt (includes retries)
  jobsExhausted: number; // jobs that failed after exhausting all retries
  payoutFailures: number;
  providerErrors: number; // views-provider fetches that fell back to last-known
}

function zero(): Counters {
  return {
    jobsCompleted: 0,
    jobsFailed: 0,
    jobsExhausted: 0,
    payoutFailures: 0,
    providerErrors: 0,
  };
}

const startedAt = Date.now();
const total: Counters = zero();
let windowCounters: Counters = zero();

export function recordCompleted(): void {
  total.jobsCompleted++;
  windowCounters.jobsCompleted++;
}

export function recordFailed(): void {
  total.jobsFailed++;
  windowCounters.jobsFailed++;
}

export function recordExhausted(): void {
  total.jobsExhausted++;
  windowCounters.jobsExhausted++;
}

export function recordPayoutFailures(n: number): void {
  total.payoutFailures += n;
  windowCounters.payoutFailures += n;
}

export function recordProviderError(): void {
  total.providerErrors++;
  windowCounters.providerErrors++;
}

/** Returns the counters accumulated since the last call and resets the window. */
export function takeWindow(): Counters {
  const w = windowCounters;
  windowCounters = zero();
  return w;
}

/** Cumulative counters since process start, plus uptime in seconds. */
export function totals(): Counters & { uptimeSec: number } {
  return { ...total, uptimeSec: Math.round((Date.now() - startedAt) / 1000) };
}
