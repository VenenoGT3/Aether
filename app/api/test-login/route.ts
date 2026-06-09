import { createHash, timingSafeEqual } from "crypto";
import { cookies as getCookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_PK_COLUMN } from "@/lib/supabase/profile";
import {
  getTestLoginAccessCode,
  getAvailableTestLoginRoles,
  getTestLoginCredentials,
  isProductionDeployment,
  isTestLoginAccessCodeRequired,
  type TestLoginRole,
} from "@/lib/env.server";
import { guardApiGet, guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { endRequest } from "@/lib/logger";

const TestLoginBodySchema = z.object({
  role: z.enum(["business", "influencer"]),
  accessCode: z.string().trim().optional(),
  _hp: z.string().optional(),
});

const EmptyQuerySchema = z.object({});

export const dynamic = "force-dynamic";
export const DELETE = () => methodNotAllowed(["GET", "POST"]);
export const PUT = () => methodNotAllowed(["GET", "POST"]);

function redirectFor(role: TestLoginRole, onboarded: boolean): string {
  const segment = role === "influencer" ? "creator" : "business";
  return onboarded ? `/${segment}/dashboard` : `/${segment}/onboarding`;
}

/** Length-independent comparison; a brute-forcer learns nothing from timing. */
function accessCodeMatches(provided: string | undefined, configured: string): boolean {
  const a = createHash("sha256").update(provided ?? "").digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  if (isProductionDeployment()) {
    return jsonSuccess({ roles: [], requiresAccessCode: false });
  }

  const guarded = await guardApiGet(request, {
    schema: EmptyQuerySchema,
    rateLimit: "metrics",
    routeKey: "test-login/config",
  });
  if (!guarded.ok) return guarded.response;
  const { log, startTime } = guarded.ctx;

  endRequest(log, { statusCode: 200, startTime });
  return jsonSuccess({
    roles: getAvailableTestLoginRoles(),
    requiresAccessCode: isTestLoginAccessCodeRequired(),
  });
}

export async function POST(request: Request): Promise<Response> {
  if (isProductionDeployment()) {
    return jsonError("Not found.", 404);
  }

  const guarded = await guardApiPost(request, {
    schema: TestLoginBodySchema,
    rateLimit: "apply",
    routeKey: "test-login/sign-in",
  });
  if (!guarded.ok) return guarded.response;
  const { log, startTime, data } = guarded.ctx;

  const fail = (message: string, status: number): Response => {
    endRequest(log, { statusCode: status, startTime });
    return jsonError(message, status);
  };

  const configuredAccessCode = getTestLoginAccessCode();
  if (isTestLoginAccessCodeRequired()) {
    if (!configuredAccessCode) {
      return fail("Test login is not available on this deployment.", 404);
    }
    if (!accessCodeMatches(data.accessCode, configuredAccessCode)) {
      return fail("Invalid test login access code.", 403);
    }
  }

  const credentials = getTestLoginCredentials(data.role);
  if (!credentials) {
    return fail("Test login is not configured.", 404);
  }

  const supabase = await createClient();
  const { data: signIn, error } = await supabase.auth.signInWithPassword(credentials);
  if (error || !signIn.user || !signIn.session) {
    return fail("Could not sign in to the test account.", 401);
  }

  const [{ data: profile }, { data: userRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarded")
      .eq(PROFILE_PK_COLUMN, signIn.user.id)
      .single(),
    supabase.from("users").select("role").eq("id", signIn.user.id).single(),
  ]);

  const role =
    (userRow?.role as TestLoginRole | undefined) ??
    (signIn.user.app_metadata?.role as TestLoginRole | undefined) ??
    data.role;
  const onboarded = profile?.onboarded ?? false;

  const cookieStore = await getCookies();
  cookieStore.set("aether-role", role, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  cookieStore.set("aether-session", "session-active", {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  cookieStore.set("aether-onboarded", onboarded ? "true" : "false", {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });

  endRequest(log, { statusCode: 200, startTime });
  return jsonSuccess({
    redirectTo: redirectFor(role, onboarded),
  });
}
