/**
 * Browser (client) Sentry initialization.
 *
 * NOTE: Next 16 + Sentry v10 use `instrumentation-client.ts` for client setup —
 * the older `sentry.client.config.ts` is deprecated and does NOT work under
 * Turbopack (Next 16's default bundler), so this is the correct convention.
 *
 * Uses NEXT_PUBLIC_SENTRY_DSN (must be public to reach the browser). No-ops when
 * unset. sendDefaultPii=false + scrubbing keep user data out of events.
 */

import * as Sentry from "@sentry/nextjs";
import {
  scrubSentryEvent,
  sentryEnvironment,
  sentryTracesSampleRate,
  SENTRY_IGNORE_ERRORS,
} from "@/lib/observability/sentry";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: sentryEnvironment(),
    tracesSampleRate: sentryTracesSampleRate(),
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    // Session Replay is privacy-sensitive — leave it off unless explicitly wanted.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

/**
 * Next 16 client navigation instrumentation hook. The symbol isn't in Sentry's
 * default `types` entry, so we read it through a typed guard (no `any`) — it is
 * present at runtime in the browser build, and is harmlessly `undefined` if not.
 */
export const onRouterTransitionStart = (
  Sentry as { captureRouterTransitionStart?: (...args: unknown[]) => void }
).captureRouterTransitionStart;
