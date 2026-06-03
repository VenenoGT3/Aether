import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the leaf observability deps so the units under test are fast + assertable.
// (lib/errors → Sentry + Pino; we assert these are called without real I/O.)
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureRequestError: vi.fn(),
  captureMessage: vi.fn(),
  init: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
  getCurrentScope: () => ({ setTag: vi.fn(), setUser: vi.fn() }),
  startSpan: (_opts: unknown, fn: (span?: unknown) => unknown) =>
    fn({ setAttribute: vi.fn() }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })),
  },
  requestLogger: vi.fn(() => ({ info: vi.fn(), child: vi.fn() })),
  endRequest: vi.fn(),
  genRequestId: () => "test-request-id",
}));

import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { z } from "zod";

import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ExternalServiceError,
  toSafeError,
  toActionError,
  toErrorResponse,
  reportError,
  safeAsync,
  GENERIC_USER_MESSAGE,
} from "@/lib/errors";
import { CircuitBreaker } from "@/lib/circuit-breaker";
import { ConcurrencyLimiter, getLimiter, limiterStats, busyResponse } from "@/lib/backpressure";
import {
  safeParse,
  parseWithError,
  ValidationError,
  safeErrorMessage,
  uuidField,
  moneyAmountField,
  originUrlField,
  roleField,
} from "@/lib/validate";
import { validateCategoryMeta } from "@/lib/campaign-category-meta";
import { fetchWithTimeout, fetchWithRetry } from "@/lib/fetch-utils";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
describe("error handling: AppError + toSafeError", () => {
  it("subclasses map to the right status codes", () => {
    expect(new UnauthorizedError().statusCode).toBe(401);
    expect(new ForbiddenError().statusCode).toBe(403);
    expect(new NotFoundError().statusCode).toBe(404);
    expect(new ConflictError("x").statusCode).toBe(409);
    expect(new ExternalServiceError().statusCode).toBe(502);
  });

  it("an EXPECTED AppError surfaces its message and is NOT reported to Sentry", () => {
    const safe = toSafeError(new ConflictError("You have already joined this campaign."));
    expect(safe).toEqual({
      userMessage: "You have already joined this campaign.",
      statusCode: 409,
      code: "conflict",
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("an UNEXPECTED error returns a generic message and IS reported (no leak)", () => {
    const safe = toSafeError(new Error("Supabase: password=hunter2 leaked"));
    expect(safe.userMessage).toBe(GENERIC_USER_MESSAGE);
    expect(safe.userMessage).not.toContain("hunter2");
    expect(safe.statusCode).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("ExternalServiceError (expected:false) is reported even though it's an AppError", () => {
    toSafeError(new ExternalServiceError());
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("a ValidationError maps to a 400 with its (safe) message", () => {
    const safe = toSafeError(new ValidationError("title: Title is required."));
    expect(safe.statusCode).toBe(400);
    expect(safe.code).toBe("validation");
    expect(safe.userMessage).toBe("title: Title is required.");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("toActionError returns the { success:false, error } shape", () => {
    expect(toActionError(new ConflictError("nope"))).toEqual({ success: false, error: "nope" });
  });

  it("toErrorResponse returns a safe JSON error with the right status", async () => {
    const res = toErrorResponse(new NotFoundError("Clip not found."));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe("Clip not found.");
  });

  it("reportError captures to Sentry + logger and never throws", () => {
    expect(() => reportError(new Error("boom"), { ctx: 1 })).not.toThrow();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe("graceful degradation: safeAsync", () => {
  it("returns the value on success and does not report", async () => {
    const value = await safeAsync(async () => "ok", "fallback");
    expect(value).toBe("ok");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("returns the fallback and reports on failure", async () => {
    const value = await safeAsync(async () => {
      throw new Error("downstream down");
    }, "fallback");
    expect(value).toBe("fallback");
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker: closed → open → half-open → closed
// ---------------------------------------------------------------------------
describe("circuit breaker", () => {
  it("opens after the failure threshold and short-circuits", () => {
    const cb = new CircuitBreaker("cb-open", { failureThreshold: 3, openDurationMs: 1000 });
    expect(cb.allowRequest()).toBe(true);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("closed"); // 2 < 3
    cb.recordFailure(); // 3rd trips it
    expect(cb.getState()).toBe("open");
    expect(cb.allowRequest()).toBe(false);
    // The OPEN transition is reported exactly once.
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("transitions open → half-open after the cooldown, then closes on success", async () => {
    const cb = new CircuitBreaker("cb-cycle", { failureThreshold: 2, openDurationMs: 30 });
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.getState()).toBe("open");
    await sleep(45);
    expect(cb.getState()).toBe("half_open");
    expect(cb.allowRequest()).toBe(true);
    cb.recordSuccess();
    expect(cb.getState()).toBe("closed");
  });

  it("re-opens immediately on a failed half-open trial", async () => {
    const cb = new CircuitBreaker("cb-reopen", { failureThreshold: 2, openDurationMs: 20 });
    cb.recordFailure();
    cb.recordFailure();
    await sleep(30);
    expect(cb.getState()).toBe("half_open");
    cb.recordFailure(); // half-open trial fails
    expect(cb.getState()).toBe("open");
  });

  it("exec resolves and keeps the breaker closed on success", async () => {
    const cb = new CircuitBreaker("cb-exec-ok", {});
    const fn = vi.fn().mockResolvedValue("result");
    await expect(cb.exec(fn)).resolves.toBe("result");
    expect(cb.getState()).toBe("closed");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exec rethrows the ORIGINAL error and records a failure", async () => {
    const cb = new CircuitBreaker("cb-exec-fail", { failureThreshold: 1 });
    const original = new Error("stripe boom");
    await expect(cb.exec(() => Promise.reject(original))).rejects.toBe(original);
    expect(cb.getState()).toBe("open");
  });

  it("exec short-circuits with a safe 503 AppError when open, without calling fn", async () => {
    const cb = new CircuitBreaker("cb-exec-open", { failureThreshold: 1 });
    cb.recordFailure(); // open
    const fn = vi.fn();
    await expect(cb.exec(fn)).rejects.toBeInstanceOf(AppError);
    await expect(cb.exec(fn)).rejects.toMatchObject({ statusCode: 503, expected: true });
    expect(fn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Backpressure: shed (503) at capacity
// ---------------------------------------------------------------------------
describe("backpressure", () => {
  it("sheds once at capacity and frees a slot on release", () => {
    const lim = new ConcurrencyLimiter("bp-cap", 2);
    const a = lim.tryAcquire();
    const b = lim.tryAcquire();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(lim.tryAcquire()).toBeNull(); // at capacity → shed
    expect(lim.inFlight).toBe(2);
    a!.release();
    expect(lim.inFlight).toBe(1);
    expect(lim.tryAcquire()).not.toBeNull();
  });

  it("release is idempotent (no double-decrement)", () => {
    const lim = new ConcurrencyLimiter("bp-idem", 1);
    const a = lim.tryAcquire();
    a!.release();
    a!.release();
    expect(lim.inFlight).toBe(0);
  });

  it("logs a shed event when full", () => {
    const lim = new ConcurrencyLimiter("bp-log", 1);
    lim.tryAcquire();
    expect(lim.tryAcquire()).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("busyResponse is a safe 503 with Retry-After", async () => {
    const res = busyResponse();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("2");
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  it("limiterStats reports registry limiters", () => {
    const lim = getLimiter("bp-stats", 5);
    lim.tryAcquire();
    expect(limiterStats()["bp-stats"]).toEqual({ inFlight: 1, max: 5 });
  });
});

// ---------------------------------------------------------------------------
// Input validation (used by the hardened server actions)
// ---------------------------------------------------------------------------
describe("input validation", () => {
  it("safeParse returns parsed data on valid input", () => {
    const r = safeParse(z.object({ n: z.number() }), { n: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.n).toBe(5);
  });

  it("safeParse returns a safe field-level message on invalid input", () => {
    const r = safeParse(
      z.object({ title: z.string().min(1, "Title is required.") }),
      { title: "" }
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Title is required.");
  });

  it("uuidField rejects non-UUIDs and accepts UUIDs", () => {
    expect(safeParse(uuidField, "not-a-uuid").ok).toBe(false);
    expect(safeParse(uuidField, VALID_UUID).ok).toBe(true);
  });

  it("moneyAmountField rejects 0 / negative / NaN / Infinity / over-max", () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 10_000_001]) {
      expect(safeParse(moneyAmountField, bad).ok).toBe(false);
    }
    expect(safeParse(moneyAmountField, 50).ok).toBe(true);
  });

  it("originUrlField and roleField validate correctly", () => {
    expect(safeParse(originUrlField, "not a url").ok).toBe(false);
    expect(safeParse(originUrlField, "https://app.example.com").ok).toBe(true);
    expect(safeParse(roleField, "admin").ok).toBe(false);
    expect(safeParse(roleField, "business").ok).toBe(true);
  });

  it("parseWithError throws a ValidationError on invalid input", () => {
    expect(() => parseWithError(uuidField, "bad")).toThrow(ValidationError);
    expect(parseWithError(uuidField, VALID_UUID)).toBe(VALID_UUID);
  });

  it("safeErrorMessage is length-capped and never echoes the received value", () => {
    // Wrong type (number where a string is required) → a validation error whose
    // message must describe the constraint, not leak the received value.
    const r = z.object({ secret: z.string() }).safeParse({ secret: 999111 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = safeErrorMessage(r.error);
      expect(msg.length).toBeLessThanOrEqual(200);
      expect(msg).not.toContain("999111");
    }
  });
});

describe("campaign category_meta validation", () => {
  it("rejects a missing/unknown category", () => {
    expect(validateCategoryMeta(null, {}).ok).toBe(false);
    expect(validateCategoryMeta("bogus", {}).ok).toBe(false);
  });

  it("UGC requires a creative_direction (>= 3 chars)", () => {
    expect(validateCategoryMeta("ugc", { creative_direction: "hi" }).ok).toBe(false);
    expect(validateCategoryMeta("ugc", { creative_direction: "Make it punchy and vertical" }).ok).toBe(true);
  });

  it("clipping requires a valid https source_url and min <= max duration", () => {
    expect(
      validateCategoryMeta("clipping", { source_url: "not-a-url", min_duration_sec: 10, max_duration_sec: 60 }).ok
    ).toBe(false);
    expect(
      validateCategoryMeta("clipping", { source_url: "https://x.com/v", min_duration_sec: 60, max_duration_sec: 10 }).ok
    ).toBe(false);
    expect(
      validateCategoryMeta("clipping", { source_url: "https://x.com/v", min_duration_sec: 10, max_duration_sec: 60 }).ok
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Timeouts + retries
// ---------------------------------------------------------------------------
describe("fetch-utils: timeout + retry", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("fetchWithRetry retries a 503 then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(
      async () => new Response("x", { status: calls++ < 2 ? 503 : 200 })
    ) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://x", {}, { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 });
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it("fetchWithRetry does NOT retry a 400 (client error)", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response("bad", { status: 400 });
    }) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://x", {}, { attempts: 3, baseDelayMs: 1 });
    expect(res.status).toBe(400);
    expect(calls).toBe(1);
  });

  it("fetchWithRetry returns the last response after exhausting retries", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      return new Response("nope", { status: 503 });
    }) as unknown as typeof fetch;
    const res = await fetchWithRetry("https://x", {}, { attempts: 3, baseDelayMs: 1, maxDelayMs: 2 });
    expect(res.status).toBe(503);
    expect(calls).toBe(3);
  });

  it("fetchWithTimeout aborts a hung request", async () => {
    globalThis.fetch = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError"))
        );
      })) as unknown as typeof fetch;
    await expect(fetchWithTimeout("https://x", {}, 20)).rejects.toMatchObject({ name: "AbortError" });
  });
});
