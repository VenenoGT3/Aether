import { NextResponse } from "next/server";
import type { ZodError } from "zod";

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
  return jsonError("Validation failed", 400, error.flatten());
}

export function unauthorizedError(message = "Unauthorized"): NextResponse {
  return jsonError(message, 401);
}

export function forbiddenError(message = "Forbidden"): NextResponse {
  return jsonError(message, 403);
}

export function rateLimitError(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: "Too many requests",
      retryAfter: retryAfterSec,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    }
  );
}