/**
 * Timeout + retry helpers for outbound HTTP. Intentionally DEPENDENCY-FREE (no
 * Next / Sentry / logger imports) so both the Next app and the standalone worker
 * can import it. Observability is handled by the caller (circuit breaker reports
 * on open; Sentry captures unhandled errors in the request path).
 *
 * Retry safety is the CALLER's responsibility: only use `fetchWithRetry` for
 * IDEMPOTENT requests (GET, or POSTs that are read-only / carry an idempotency
 * key). Retrying a non-idempotent write after a timeout can double-apply it.
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** AbortController-based timeout. Rejects with an AbortError when `timeoutMs` elapses. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 1));

  // Respect an external signal too (cancel both).
  const external = init.signal;
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  /** Total attempts (clamped to 1..5). Default 3. */
  attempts?: number;
  /** Per-attempt timeout. Default 10s. */
  timeoutMs?: number;
  /** Base backoff (ms). Default 200. */
  baseDelayMs?: number;
  /** Backoff ceiling (ms). Default 4000. */
  maxDelayMs?: number;
  /** Decide whether a (non-OK) response is retryable. Default: 5xx or 429. */
  retryOnResponse?: (res: Response) => boolean;
}

function defaultRetryOnResponse(res: Response): boolean {
  return res.status >= 500 || res.status === 429;
}

/** Full-jitter exponential backoff: random(0, min(max, base * 2^n)). */
function backoffDelay(attempt: number, base: number, max: number): number {
  const ceiling = Math.min(max, base * 2 ** (attempt - 1));
  return Math.floor(Math.random() * ceiling);
}

/** Parse a `Retry-After` header (seconds or HTTP date) into ms, if present. */
function retryAfterMs(res: Response): number {
  const header = res.headers.get("retry-after");
  if (!header) return 0;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

/**
 * fetch with a per-attempt timeout and exponential backoff + jitter. Retries on
 * transient failures (network/timeout errors, 5xx, 429 — honoring Retry-After),
 * NOT on other 4xx. Returns the final Response (which may still be non-OK after
 * exhausting retries); rethrows the last error if every attempt threw.
 *
 * ONLY use for idempotent requests (see file header).
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {}
): Promise<Response> {
  const attempts = Math.min(Math.max(opts.attempts ?? 3, 1), 5);
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const base = opts.baseDelayMs ?? 200;
  const max = opts.maxDelayMs ?? 4_000;
  const isRetryable = opts.retryOnResponse ?? defaultRetryOnResponse;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (attempt < attempts && isRetryable(res)) {
        const wait = Math.max(backoffDelay(attempt, base, max), retryAfterMs(res));
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      // Network error / timeout (AbortError) — retry if attempts remain.
      lastError = err;
      if (attempt < attempts) {
        await sleep(backoffDelay(attempt, base, max));
        continue;
      }
      throw err;
    }
  }

  // Unreachable in practice (the loop returns/throws), but satisfies the compiler.
  throw lastError ?? new Error("fetchWithRetry: no attempts made");
}
