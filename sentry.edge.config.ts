/**
 * Sentry initialization for the Edge runtime. Loaded by instrumentation.ts
 * `register()` when NEXT_RUNTIME === "edge". (Our proxy.ts runs on the Node
 * runtime, but Edge config is required for any Edge route segments and keeps the
 * setup complete.) No-ops when SENTRY_DSN is unset.
 */

import * as Sentry from "@sentry/nextjs";
import {
  scrubSentryEvent,
  sentryEnvironment,
  sentryTracesSampleRate,
  SENTRY_IGNORE_ERRORS,
} from "@/lib/observability/sentry";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: sentryEnvironment(),
    tracesSampleRate: sentryTracesSampleRate(),
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
  });
}
