import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { validateEnv } from "./lib/env";

// Fail the build early when required production env vars are missing.
validateEnv();

const nextConfig: NextConfig = {
  typescript: {
    // Enforce type safety in production builds
    ignoreBuildErrors: false,
  },
  // Pino (and its pretty transport) use Node worker threads / dynamic requires
  // that must NOT be bundled by the compiler — keep them as native node_modules
  // requires so logging works in route handlers and the Node-runtime proxy.
  serverExternalPackages: ["pino", "pino-pretty", "thread-stream"],
};

// Wrap with Sentry. Error capture + tracing are driven at RUNTIME by the DSN
// (see sentry.*.config.ts), so this wrapper is safe when Sentry is unconfigured;
// the org/project/authToken below only gate build-time source-map upload, which
// is skipped automatically when the auth token is absent.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Quiet locally; CI/build logs still show upload status.
  silent: !process.env.CI,
  // Upload source maps for the full client bundle for readable stack traces.
  widenClientFileUpload: true,
  // Tree-shake Sentry's internal logger from client bundles.
  disableLogger: true,
  // Don't fail the build when source-map upload isn't configured.
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});