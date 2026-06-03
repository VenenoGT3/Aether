/**
 * Sentry initialization for the Node.js server runtime (route handlers, server
 * actions, RSC). Loaded by instrumentation.ts `register()` when
 * NEXT_RUNTIME === "nodejs". No-ops entirely when SENTRY_DSN is unset, so Sentry
 * is fully opt-in and the app behaves identically without it.
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
    // Performance tracing for API routes / DB / Redis / cache spans.
    tracesSampleRate: sentryTracesSampleRate(),
    // Never attach cookies, headers, IPs, or request bodies automatically.
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    // Tree-shaken in prod by withSentryConfig({ disableLogger: true }).
    debug: false,
  });
}
