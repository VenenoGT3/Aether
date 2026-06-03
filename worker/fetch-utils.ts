/**
 * Worker-local copy of lib/fetch-utils.ts. The worker ships as a self-contained
 * image (the Dockerfile copies only worker/, not lib/), so it mirrors the helper
 * rather than importing it — same pattern as worker/circuit-breaker.ts,
 * worker/logger.ts, worker/stripe.ts. Kept dependency-free.
 *
 * Retry safety is the caller's responsibility: only use fetchWithRetry for
 * IDEMPOTENT requests (a retry after a timeout can double-apply a write).
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** AbortController-based timeout. Rejects with an AbortError when timeoutMs elapses. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 1));

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
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnResponse?: (res: Response) => boolean;
}

function defaultRetryOnResponse(res: Response): boolean {
  return res.status >= 500 || res.status === 429;
}

function backoffDelay(attempt: number, base: number, max: number): number {
  const ceiling = Math.min(max, base * 2 ** (attempt - 1));
  return Math.floor(Math.random() * ceiling);
}

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
 * transient failures (network/timeout, 5xx, 429 — honoring Retry-After), not on
 * other 4xx. ONLY use for idempotent requests.
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
        await sleep(Math.max(backoffDelay(attempt, base, max), retryAfterMs(res)));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        await sleep(backoffDelay(attempt, base, max));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("fetchWithRetry: no attempts made");
}
