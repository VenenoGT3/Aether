import type { ZodSchema } from "zod";
import {
  applyRateLimit,
  type RateLimitPreset,
} from "@/lib/api/rate-limit";
import { rateLimitError } from "@/lib/api/response";
import { rejectIfHoneypot } from "@/lib/api/honeypot";
import { parseJsonBody, parseQuery } from "@/lib/api/validate";
import { requireApiAuth, type ApiAuthContext } from "@/lib/api/auth";
import type { UserRole } from "@/types";

export type ApiGuardOptions<T> = {
  schema: ZodSchema<T>;
  rateLimit: RateLimitPreset;
  routeKey: string;
  auth?: boolean | UserRole;
};

export type GuardedRequest<T> = {
  data: T;
  auth: ApiAuthContext | null;
};

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
  auth?: boolean | UserRole
): Promise<
  { ok: true; auth: ApiAuthContext | null } | { ok: false; response: Response }
> {
  if (!auth) return { ok: true, auth: null };
  const role = auth === true ? undefined : auth;
  const authResult = await requireApiAuth(role);
  if (!authResult.ok) return { ok: false, response: authResult.response };
  return { ok: true, auth: authResult.auth };
}

export async function guardApiPost<T>(
  request: Request,
  options: ApiGuardOptions<T>
): Promise<
  { ok: true; ctx: GuardedRequest<T> } | { ok: false; response: Response }
> {
  const authResult = await resolveAuth(options.auth);
  if (!authResult.ok) return { ok: false, response: authResult.response };

  const rateLimited = enforceRateLimit(
    request,
    options.routeKey,
    options.rateLimit,
    authResult.auth?.userId
  );
  if (rateLimited) return { ok: false, response: rateLimited };

  const body = await parseJsonBody(request, options.schema);
  if (!body.ok) return { ok: false, response: body.response };

  const hp = rejectIfHoneypot(body.data as { _hp?: string });
  if (hp) return { ok: false, response: hp };

  return { ok: true, ctx: { data: body.data, auth: authResult.auth } };
}

export type ApiGuardQueryOptions<T> = ApiGuardOptions<T>;

export async function guardApiGet<T>(
  request: Request,
  options: ApiGuardQueryOptions<T>
): Promise<
  { ok: true; ctx: GuardedRequest<T> } | { ok: false; response: Response }
> {
  const authResult = await resolveAuth(options.auth);
  if (!authResult.ok) return { ok: false, response: authResult.response };

  const rateLimited = enforceRateLimit(
    request,
    options.routeKey,
    options.rateLimit,
    authResult.auth?.userId
  );
  if (rateLimited) return { ok: false, response: rateLimited };

  const query = parseQuery(request, options.schema);
  if (!query.ok) return { ok: false, response: query.response };

  return { ok: true, ctx: { data: query.data, auth: authResult.auth } };
}

/** Rate limit only (webhooks, cron) */
export function guardRateLimitOnly(
  request: Request,
  routeKey: string,
  preset: RateLimitPreset
): Response | null {
  return enforceRateLimit(request, routeKey, preset, null);
}