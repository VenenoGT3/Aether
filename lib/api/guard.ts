import type { ZodSchema } from "zod";
import { checkRateLimit, getClientIp, RATE_LIMITS } from "@/lib/api/rate-limit";
import { rateLimitError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/validate";
import { requireApiAuth, type ApiAuthContext } from "@/lib/api/auth";
import type { UserRole } from "@/types";

type RateLimitPreset = keyof typeof RATE_LIMITS;

export type ApiGuardOptions<T> = {
  schema: ZodSchema<T>;
  rateLimit: RateLimitPreset;
  auth?: boolean | UserRole;
  routeKey: string;
};

export type GuardedRequest<T> = {
  data: T;
  auth: ApiAuthContext | null;
};

export async function guardApiPost<T>(
  request: Request,
  options: ApiGuardOptions<T>
): Promise<
  { ok: true; ctx: GuardedRequest<T> } | { ok: false; response: Response }
> {
  const ip = getClientIp(request);
  const rl = RATE_LIMITS[options.rateLimit];
  const limit = checkRateLimit(
    `${options.routeKey}:${ip}`,
    rl.limit,
    rl.windowMs
  );
  if (!limit.allowed) {
    return {
      ok: false,
      response: rateLimitError(limit.retryAfterSec ?? 60),
    };
  }

  const body = await parseJsonBody(request, options.schema);
  if (!body.ok) return { ok: false, response: body.response };

  let auth: ApiAuthContext | null = null;
  if (options.auth) {
    const role = options.auth === true ? undefined : options.auth;
    const authResult = await requireApiAuth(role);
    if (!authResult.ok) return { ok: false, response: authResult.response };
    auth = authResult.auth;
  }

  return { ok: true, ctx: { data: body.data, auth } };
}