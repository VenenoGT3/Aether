/**
 * Shared Sentry helpers — safe to import from server, edge, AND client configs
 * (no Node-only APIs). Centralizes environment/sample-rate resolution and the
 * PII/secret scrubbing applied before any event leaves the process, mirroring
 * the redaction philosophy of lib/logger.ts.
 */

import type { ErrorEvent } from "@sentry/nextjs";

/** Header names that must never be shipped to Sentry. */
const SENSITIVE_HEADER = /^(authorization|cookie|set-cookie|x-api-key|x-csrf-token|proxy-authorization)$/i;

/**
 * Strip request body, cookies, and sensitive headers before an event is sent.
 * Defense in depth: we run Sentry with sendDefaultPii=false (so headers/cookies/
 * IP aren't attached by default), but this guarantees it even if an integration
 * or manual scope attaches request data.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  const req = event.request;
  if (req) {
    delete req.cookies;
    delete req.data; // request body may contain credentials / tokens
    if (req.headers) {
      for (const key of Object.keys(req.headers)) {
        if (SENSITIVE_HEADER.test(key)) delete req.headers[key];
      }
    }
  }
  return event;
}

export function sentryEnvironment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
}

/**
 * Traces sample rate: explicit SENTRY_TRACES_SAMPLE_RATE (0..1) wins; otherwise
 * 10% in production (cost control under load) and 100% in dev.
 */
export function sentryTracesSampleRate(): number {
  const raw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
  return process.env.NODE_ENV === "production" ? 0.1 : 1.0;
}

/** Next.js control-flow "errors" that must not be reported as real errors. */
export const SENTRY_IGNORE_ERRORS = [
  "NEXT_NOT_FOUND",
  "NEXT_REDIRECT",
  "NEXT_HTTP_ERROR_FALLBACK",
];
