/**
 * Structured application logger (Pino).
 *
 * SERVER-SIDE ONLY. Import from API routes, server actions, middleware, and
 * server components — never from a Client Component (Pino is a Node module).
 *
 * Behavior by environment:
 *   - production  → newline-delimited JSON on stdout (machine-parseable; ship to
 *                   a log drain / Datadog / Loki, etc.)
 *   - development → pretty, colorized, human-readable lines (via pino-pretty)
 *
 * Safety: a `redact` ruleset strips sensitive fields (passwords, tokens, auth
 * headers, cookies, secrets, wallet balances) wherever they appear, so they can
 * never reach the logs even if accidentally passed in a context object.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info({ event: "campaign.created", campaignId }, "campaign created");
 *
 *   // Per-request child with bound context + completion helper:
 *   import { requestLogger, endRequest } from "@/lib/logger";
 *   const log = requestLogger({ method: req.method, url: req.url, userId, tenant });
 *   // ... handle ...
 *   endRequest(log, { statusCode: 200, startTime });
 */

import { randomUUID } from "node:crypto";
import pino, { type Logger } from "pino";

const isProduction = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL?.trim() || (isProduction ? "info" : "debug");

/**
 * Fields scrubbed from every log object. Pino redaction matches a key at the
 * given depth; `*` matches exactly one level, so we list both the top-level key
 * and a one-level wildcard for the high-risk ones. Redacted values render as
 * "[redacted]" rather than being dropped, so the shape of the log is preserved.
 */
const REDACT_PATHS: string[] = [
  // Credentials
  "password",
  "*.password",
  "passwordConfirm",
  "currentPassword",
  "newPassword",
  // Tokens / sessions (never log full tokens)
  "token",
  "*.token",
  "accessToken",
  "refreshToken",
  "access_token",
  "refresh_token",
  "idToken",
  "sessionToken",
  "*.accessToken",
  "*.refreshToken",
  // Auth transport
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "*.authorization",
  "*.cookie",
  "headers.authorization",
  "headers.cookie",
  'headers["set-cookie"]',
  "req.headers.authorization",
  "req.headers.cookie",
  // Secrets / API keys
  "secret",
  "*.secret",
  "apiKey",
  "api_key",
  "*.apiKey",
  "clientSecret",
  "client_secret",
  "serviceRoleKey",
  "stripeSecretKey",
  "webhookSecret",
  // Money / wallet (don't leak balances in logs)
  "balance",
  "*.balance",
  "walletBalance",
  "wallet_balance",
  "availableBalance",
  "available_balance",
];

/**
 * Build the root logger. In dev we route through pino-pretty; if (for any reason)
 * pino-pretty is unavailable, fall back to plain JSON rather than crashing.
 */
function buildLogger(): Logger {
  const options: pino.LoggerOptions = {
    level,
    base: {
      service: "aether-app",
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    },
    // ISO timestamps are unambiguous across hosts/timezones.
    timestamp: pino.stdTimeFunctions.isoTime,
    // Emit `level: "info"` (string) instead of the numeric default.
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
  };

  if (isProduction) {
    return pino(options);
  }

  try {
    return pino({
      ...options,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname",
          messageKey: "msg",
        },
      },
    });
  } catch {
    // pino-pretty missing (e.g. prod deps only but NODE_ENV != production) → JSON.
    return pino(options);
  }
}

/** Root logger instance. Prefer a request child (see `requestLogger`) in handlers. */
export const logger: Logger = buildLogger();
export default logger;

/** Generate a request/correlation id (use when an upstream id isn't provided). */
export function genRequestId(): string {
  return randomUUID();
}

/**
 * Strip the query string from a URL before logging — query params can carry
 * tokens / PII. Keeps the path (and host, if absolute) only.
 */
function safeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export interface RequestLogContext {
  /** Correlation id; generated if omitted. */
  requestId?: string;
  /** Authenticated user id, when known. */
  userId?: string | null;
  /** Tenant / org scope (e.g. business or campaign owner), when known. */
  tenant?: string | null;
  method?: string;
  url?: string;
}

/**
 * Create a child logger with request context bound to every line it emits.
 * The returned `requestId` is also readable via `log.bindings().requestId` for
 * echoing back in a response header (`x-request-id`).
 */
export function requestLogger(ctx: RequestLogContext = {}): Logger {
  return logger.child({
    requestId: ctx.requestId || genRequestId(),
    ...(ctx.userId ? { userId: ctx.userId } : {}),
    ...(ctx.tenant ? { tenant: ctx.tenant } : {}),
    ...(ctx.method ? { method: ctx.method } : {}),
    ...(safeUrl(ctx.url) ? { url: safeUrl(ctx.url) } : {}),
  });
}

/**
 * Log request completion with status + latency. Pass either a `startTime`
 * (epoch ms / performance.now baseline) or a precomputed `latencyMs`.
 * Chooses the level by status class (5xx → error, 4xx → warn, else info).
 */
export function endRequest(
  log: Logger,
  opts: { statusCode: number; startTime?: number; latencyMs?: number; msg?: string }
): void {
  const latencyMs =
    opts.latencyMs ?? (opts.startTime != null ? Math.round(Date.now() - opts.startTime) : undefined);
  const payload = { statusCode: opts.statusCode, latencyMs };
  const msg = opts.msg || "request.completed";
  if (opts.statusCode >= 500) log.error(payload, msg);
  else if (opts.statusCode >= 400) log.warn(payload, msg);
  else log.info(payload, msg);
}
