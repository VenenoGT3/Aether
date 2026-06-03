import type { ZodSchema } from "zod";
import {
  applyRateLimit,
  applyRateLimitAsync,
  type RateLimitPreset,
} from "@/lib/api/rate-limit";
import { rateLimitError } from "@/lib/api/response";
import { rejectIfHoneypot } from "@/lib/api/honeypot";
import { parseJsonBody, parseQuery } from "@/lib/api/validate";
import {
  isInternalCronCall,
  requireApiAuth,
  type ApiAuthContext,
} from "@/lib/api/auth";
import type { UserRole } from "@/types";
import { DEFAULT_MAX_BODY_BYTES } from "@/lib/api/validate";
import { methodNotAllowed } from "@/lib/api/response";
import { requestLogger, endRequest, genRequestId } from "@/lib/logger";
import type { Logger } from "pino";
import * as Sentry from "@sentry/nextjs";
import { toErrorResponse } from "@/lib/errors";

export type ApiGuardOptions<T> = {
  schema: ZodSchema<T>;
  rateLimit: RateLimitPreset;
  routeKey: string;
  auth?: boolean | UserRole;
  /** Allow verified CRON_SECRET bearer without a user session (metrics cron) */
  allowCronBearer?: boolean;
  maxBodyBytes?: number;
};

export { methodNotAllowed };

export type GuardedRequest<T> = {
  data: T;
  auth: ApiAuthContext | null;
  /** Request-scoped logger (requestId + method + url bound); use it in handlers. */
  log: Logger;
  /** Proxy-propagated request start (epoch ms) for end-to-end latency. */
  startTime: number;
};

/**
 * Read the correlation context the proxy propagated (x-request-id / x-request-start).
 * Falls back to a fresh id + now() when the proxy didn't run (e.g. direct calls).
 */
function requestContext(request: Request): {
  requestId: string;
  startTime: number;
  log: Logger;
} {
  const requestId = request.headers.get("x-request-id") || genRequestId();
  const startHeader = Number(request.headers.get("x-request-start"));
  const startTime = Number.isFinite(startHeader) && startHeader > 0 ? startHeader : Date.now();
  const log = requestLogger({ requestId, method: request.method, url: request.url });
  // Correlate Sentry events with the same requestId the logger uses. Operates on
  // the per-request isolation scope (set up by the Sentry Next.js SDK), so it
  // does not leak across concurrent requests. No-ops when Sentry is unconfigured.
  Sentry.setTag("requestId", requestId);
  return { requestId, startTime, log };
}

/** Distributed (Redis) enforcement for the async guards; in-memory fallback inside. */
async function enforceRateLimitAsync(
  request: Request,
  routeKey: string,
  preset: RateLimitPreset,
  userId?: string | null
) {
  const rl = await applyRateLimitAsync(request, routeKey, preset, userId);
  if (!rl.allowed) {
    return rateLimitError(rl.retryAfterSec);
  }
  return null;
}

/** Synchronous in-memory enforcement for the sync-only guard (webhooks/cron). */
function enforceRateLimit(
  request: Request,
  routeKey: string,
  preset: RateLimitPreset,
  userId?: string | null
) {
  const rl = applyRateLimit(request, routeKey, preset, userId);
  if (!rl.allowed) {
    return rateLimitError(rl.retryAfterSec);
  }
  return null;
}

async function resolveAuth(
  request: Request,
  auth?: boolean | UserRole,
  allowCronBearer?: boolean
): Promise<
  { ok: true; auth: ApiAuthContext | null } | { ok: false; response: Response }
> {
  if (!auth) return { ok: true, auth: null };
  if (allowCronBearer && isInternalCronCall(request)) {
    return { ok: true, auth: null };
  }
  const role = auth === true ? undefined : auth;
  const authResult = await requireApiAuth(role);
  if (!authResult.ok) return { ok: false, response: authResult.response };
  return { ok: true, auth: authResult.auth };
}

/**
 * Guard a POST/JSON-body route. Any UNEXPECTED throw is converted to a safe JSON
 * error (and reported to Sentry) so a handler never returns a raw stack/500.
 */
export async function guardApiPost<T>(
  request: Request,
  options: ApiGuardOptions<T>
): Promise<
  { ok: true; ctx: GuardedRequest<T> } | { ok: false; response: Response }
> {
  try {
    return await guardApiPostImpl(request, options);
  } catch (err) {
    return { ok: false, response: toErrorResponse(err, { routeKey: options.routeKey }) };
  }
}

async function guardApiPostImpl<T>(
  request: Request,
  options: ApiGuardOptions<T>
): Promise<
  { ok: true; ctx: GuardedRequest<T> } | { ok: false; response: Response }
> {
  const { startTime, log: baseLog } = requestContext(request);
  let log = baseLog.child({ routeKey: options.routeKey });
  Sentry.setTag("routeKey", options.routeKey);

  const authResult = await resolveAuth(
    request,
    options.auth,
    options.allowCronBearer
  );
  if (!authResult.ok) {
    endRequest(log, { statusCode: authResult.response.status, startTime, msg: "request.rejected" });
    return { ok: false, response: authResult.response };
  }
  // Bind the authenticated user for every subsequent line.
  if (authResult.auth?.userId) {
    log = log.child({ userId: authResult.auth.userId });
    // Opaque user id only (no email/PII) — correlates errors to a user.
    Sentry.setUser({ id: authResult.auth.userId });
  }

  const rateLimited = await enforceRateLimitAsync(
    request,
    options.routeKey,
    options.rateLimit,
    authResult.auth?.userId
  );
  if (rateLimited) {
    endRequest(log, { statusCode: rateLimited.status, startTime, msg: "request.rate_limited" });
    return { ok: false, response: rateLimited };
  }

  const body = await parseJsonBody(
    request,
    options.schema,
    options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  );
  if (!body.ok) {
    endRequest(log, { statusCode: body.response.status, startTime, msg: "request.invalid" });
    return { ok: false, response: body.response };
  }

  const hp = rejectIfHoneypot(body.data as { _hp?: string });
  if (hp) {
    endRequest(log, { statusCode: hp.status, startTime, msg: "request.honeypot" });
    return { ok: false, response: hp };
  }

  log.debug({ event: "request.authorized" }, "request.authorized");
  return { ok: true, ctx: { data: body.data, auth: authResult.auth, log, startTime } };
}

export type ApiGuardQueryOptions<T> = ApiGuardOptions<T>;

/** Guard a GET/query route. Same unexpected-error safety net as guardApiPost. */
export async function guardApiGet<T>(
  request: Request,
  options: ApiGuardQueryOptions<T>
): Promise<
  { ok: true; ctx: GuardedRequest<T> } | { ok: false; response: Response }
> {
  try {
    return await guardApiGetImpl(request, options);
  } catch (err) {
    return { ok: false, response: toErrorResponse(err, { routeKey: options.routeKey }) };
  }
}

async function guardApiGetImpl<T>(
  request: Request,
  options: ApiGuardQueryOptions<T>
): Promise<
  { ok: true; ctx: GuardedRequest<T> } | { ok: false; response: Response }
> {
  const { startTime, log: baseLog } = requestContext(request);
  let log = baseLog.child({ routeKey: options.routeKey });
  Sentry.setTag("routeKey", options.routeKey);

  const authResult = await resolveAuth(
    request,
    options.auth,
    options.allowCronBearer
  );
  if (!authResult.ok) {
    endRequest(log, { statusCode: authResult.response.status, startTime, msg: "request.rejected" });
    return { ok: false, response: authResult.response };
  }
  if (authResult.auth?.userId) {
    log = log.child({ userId: authResult.auth.userId });
    // Opaque user id only (no email/PII) — correlates errors to a user.
    Sentry.setUser({ id: authResult.auth.userId });
  }

  const rateLimited = await enforceRateLimitAsync(
    request,
    options.routeKey,
    options.rateLimit,
    authResult.auth?.userId
  );
  if (rateLimited) {
    endRequest(log, { statusCode: rateLimited.status, startTime, msg: "request.rate_limited" });
    return { ok: false, response: rateLimited };
  }

  const query = parseQuery(request, options.schema);
  if (!query.ok) {
    endRequest(log, { statusCode: query.response.status, startTime, msg: "request.invalid" });
    return { ok: false, response: query.response };
  }

  log.debug({ event: "request.authorized" }, "request.authorized");
  return { ok: true, ctx: { data: query.data, auth: authResult.auth, log, startTime } };
}

/** Rate limit only (webhooks, cron) */
export function guardRateLimitOnly(
  request: Request,
  routeKey: string,
  preset: RateLimitPreset
): Response | null {
  return enforceRateLimit(request, routeKey, preset, null);
}