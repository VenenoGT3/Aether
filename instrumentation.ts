/**
 * Runs once when the Next.js server starts (dev and production).
 *   1. Fails fast if production env vars are missing while mock mode is off.
 *   2. Initializes Sentry for the active runtime (Node or Edge).
 *
 * `onRequestError` forwards every server-side error (route handlers, server
 * actions, RSC rendering) to Sentry with Next's request/context attached.
 */

import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  const { validateEnv } = await import("./lib/env");
  validateEnv();

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures unhandled server errors with the request + router context. No-ops
// when Sentry isn't initialized (no DSN).
export const onRequestError = Sentry.captureRequestError;
