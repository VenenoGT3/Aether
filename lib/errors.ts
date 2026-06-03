/**
 * Centralized error handling.
 *
 * SERVER-ONLY: imports the Pino logger and Sentry, so never import this from a
 * Client Component or a client-side module (e.g. lib/supabase/campaigns.ts).
 *
 * Model:
 *   - `AppError` (+ subclasses) = a KNOWN, user-facing condition with a SAFE
 *     message and an HTTP status. These are expected control flow — they are NOT
 *     reported to Sentry by default.
 *   - Any other thrown value = UNEXPECTED. Its full detail is captured to Sentry
 *     + logs, and the user sees only a generic message — never the raw
 *     Stripe/Supabase/Redis message or a stack trace.
 *
 * Helpers map errors to the shapes each surface uses:
 *   - routes/guard → `toErrorResponse(err)` (NextResponse via jsonError)
 *   - server actions → `toActionError(err)` ({ success:false, error })
 *   - non-critical paths → `safeAsync(fn, fallback)` (graceful degradation)
 */

import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { ValidationError } from "@/lib/validate";
import { jsonError } from "@/lib/api/response";

export type ErrorCode =
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "external_service"
  | "internal";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  external_service: 502,
  internal: 500,
};

/** Shown to users when an error has no safe, specific message. */
export const GENERIC_USER_MESSAGE = "Something went wrong. Please try again.";

export interface AppErrorOptions {
  code?: ErrorCode;
  statusCode?: number;
  cause?: unknown;
  /** true = known/handled (not a bug, not Sentry-reported); false = unexpected. */
  expected?: boolean;
}

/** A known, user-facing error: `message` is always safe to display. */
export class AppError extends Error {
  readonly userMessage: string;
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly expected: boolean;

  constructor(userMessage: string, opts: AppErrorOptions = {}) {
    super(userMessage, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = new.target.name;
    this.userMessage = userMessage;
    this.code = opts.code ?? "internal";
    this.statusCode = opts.statusCode ?? STATUS_BY_CODE[this.code];
    this.expected = opts.expected ?? true;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Please sign in to continue.", cause?: unknown) {
    super(message, { code: "unauthorized", cause });
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.", cause?: unknown) {
    super(message, { code: "forbidden", cause });
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Not found.", cause?: unknown) {
    super(message, { code: "not_found", cause });
  }
}
export class ConflictError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, { code: "conflict", cause });
  }
}
/** A downstream dependency (Stripe / Supabase / Redis) failed unexpectedly. */
export class ExternalServiceError extends AppError {
  constructor(
    message = "A required service is temporarily unavailable. Please try again.",
    cause?: unknown
  ) {
    // expected=false → captured to Sentry (a dependency failure is worth a look).
    super(message, { code: "external_service", cause, expected: false });
  }
}

export interface SafeError {
  userMessage: string;
  statusCode: number;
  code: ErrorCode;
}

/**
 * Report the FULL error to Sentry + structured logs. Never shown to a user and
 * never throws (observability must not break the request).
 */
export function reportError(err: unknown, context?: Record<string, unknown>): void {
  try {
    Sentry.captureException(err, context ? { extra: context } : undefined);
  } catch {
    /* Sentry unavailable — ignore */
  }
  try {
    logger.error(
      {
        ...context,
        err:
          err instanceof Error
            ? { name: err.name, message: err.message }
            : String(err),
      },
      "error.captured"
    );
  } catch {
    /* logger unavailable — ignore */
  }
}

/**
 * Map ANY thrown value to a safe { userMessage, statusCode, code }. Expected
 * AppErrors keep their message; everything else is captured internally and
 * surfaces only the generic message.
 */
export function toSafeError(err: unknown, context?: Record<string, unknown>): SafeError {
  if (err instanceof AppError) {
    if (!err.expected) reportError(err, context);
    return { userMessage: err.userMessage, statusCode: err.statusCode, code: err.code };
  }
  if (err instanceof ValidationError) {
    return { userMessage: err.message, statusCode: 400, code: "validation" };
  }
  // Unknown/unexpected → capture full detail, return a generic message.
  reportError(err, context);
  return { userMessage: GENERIC_USER_MESSAGE, statusCode: 500, code: "internal" };
}

/** Server-action helper: any error → { success:false, error: safeMessage }. */
export function toActionError(
  err: unknown,
  context?: Record<string, unknown>
): { success: false; error: string } {
  return { success: false, error: toSafeError(err, context).userMessage };
}

/** Route/guard helper: any error → a safe JSON error Response. */
export function toErrorResponse(err: unknown, context?: Record<string, unknown>): Response {
  const safe = toSafeError(err, context);
  return jsonError(safe.userMessage, safe.statusCode);
}

/**
 * Graceful degradation for NON-critical paths: run `fn`; on failure, report the
 * error and return `fallback` instead of throwing. Use for best-effort work
 * (cache reads, enrichment, notifications) — never for money-moving operations.
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
  context?: Record<string, unknown>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    reportError(err, { ...context, degraded: true });
    return fallback;
  }
}
