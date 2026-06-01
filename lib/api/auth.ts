import { createClient } from "@/lib/supabase/server";
import { isMockMode } from "@/lib/env";
import { unauthorizedError, forbiddenError } from "@/lib/api/response";
import type { UserRole } from "@/types";

export type ApiAuthContext = {
  userId: string;
  role: UserRole;
  email?: string;
};

/**
 * Resolves the authenticated user for API routes.
 * In mock mode, allows demo traffic without Supabase session (rate limits still apply).
 */
export async function requireApiAuth(
  requiredRole?: UserRole
): Promise<
  { ok: true; auth: ApiAuthContext } | { ok: false; response: Response }
> {
  if (isMockMode) {
    return {
      ok: true,
      auth: {
        userId: "mock-api-user",
        role: requiredRole ?? "influencer",
        email: "demo@aether.local",
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, response: unauthorizedError() };
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role =
    (userRow?.role as UserRole) ||
    (user.app_metadata?.role as UserRole) ||
    "influencer";

  const roleStr = role as string;
  if (requiredRole && role !== requiredRole && roleStr !== "admin") {
    return {
      ok: false,
      response: forbiddenError(`Requires ${requiredRole} role`),
    };
  }

  return {
    ok: true,
    auth: { userId: user.id, role, email: user.email },
  };
}

/** Cron / internal service calls bypass user auth when bearer matches CRON_SECRET */
export function isInternalCronCall(request: Request): boolean {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}