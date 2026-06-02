import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { formatZodErrors } from "@/lib/api/zod-errors";

export function jsonSuccess<T extends Record<string, unknown>>(
  data: T,
  status = 200
): NextResponse {
  return NextResponse.json({ success: true, ...data }, { status });
}

export function jsonError(
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: message,
      ...(details !== undefined ? { details } : {}),
    },
    { status }
  );
}

export function validationError(error: ZodError): NextResponse {
  const formatted = formatZodErrors(error);
  return NextResponse.json(
    {
      success: false,
      error: formatted.message,
      fields: formatted.fields,
    },
    { status: 400 }
  );
}

export function unauthorizedError(
  message = "Please sign in to continue."
): NextResponse {
  return jsonError(message, 401);
}

export function forbiddenError(
  message = "You don't have permission to do that."
): NextResponse {
  return jsonError(message, 403);
}

export function rateLimitError(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: `Too many requests. Please wait ${retryAfterSec} seconds and try again.`,
      retryAfter: retryAfterSec,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    }
  );
}

export function conflictError(message: string): NextResponse {
  return jsonError(message, 409);
}

export function methodNotAllowed(allowed: string[]): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: `Method not allowed. Use ${allowed.join(" or ")}.`,
    },
    {
      status: 405,
      headers: { Allow: allowed.join(", ") },
    }
  );
}