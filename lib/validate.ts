/**
 * Reusable Zod validation helpers for SERVER ACTIONS and other non-route-handler
 * code paths (route handlers already validate via lib/api/guard + lib/api/schemas).
 *
 * Design goals:
 *   - Reject invalid input early, before it reaches the DB / Stripe / external calls.
 *   - Return CLEAR but SAFE messages: a single field-level constraint message,
 *     never the received value, a stack trace, or internal schema/runtime details.
 *
 * Two ergonomics:
 *   - `safeParse(schema, input)` → discriminated result, for `{ success, error }`
 *     server actions that early-return on failure.
 *   - `parseWithError(schema, input)` → returns data or throws `ValidationError`
 *     (carrying a safe message) for try/catch-style flows.
 */

import { z, type ZodType } from "zod";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Thrown by `parseWithError`. `message` is always safe to show a user. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Build a single, user-safe message from a ZodError: the first issue's path +
 * message, length-capped. Never includes the received value or internal details.
 */
export function safeErrorMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid input.";
  const path = issue.path.map((p) => String(p)).join(".");
  const message = issue.message || "Invalid value.";
  return (path ? `${path}: ${message}` : message).slice(0, 200);
}

/** Validate `input`; returns a discriminated result with a safe error message. */
export function safeParse<T>(schema: ZodType<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: safeErrorMessage(result.error) };
}

/** Validate `input`; returns parsed data or throws `ValidationError` (safe message). */
export function parseWithError<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(safeErrorMessage(result.error));
  return result.data;
}

// ---------------------------------------------------------------------------
// Reusable primitives (shared across server actions)
// ---------------------------------------------------------------------------

/** A UUID identifier (campaign id, participation id, etc.). */
export const uuidField = z.string().uuid("Invalid ID.");

/** A positive money amount with sane upper/lower bounds (rejects NaN/Infinity). */
export const moneyAmountField = z
  .number()
  .finite("Amount must be a number.")
  .positive("Amount must be greater than 0.")
  .max(10_000_000, "Amount is too large.");

/** An absolute origin URL (e.g. for OAuth/Stripe redirect callbacks). */
export const originUrlField = z
  .string()
  .url("Invalid origin URL.")
  .max(2048, "Origin URL is too long.");

/** Account role. */
export const roleField = z.enum(["business", "influencer"]);
