import { cookies as getCookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_PK_COLUMN } from "@/lib/supabase/profile";
import {
  getAvailableTestLoginRoles,
  getTestLoginCredentials,
  type TestLoginRole,
} from "@/lib/env.server";
import { jsonError, jsonSuccess, methodNotAllowed } from "@/lib/api/response";

const TestLoginBodySchema = z.object({
  role: z.enum(["business", "influencer"]),
});

export const dynamic = "force-dynamic";
export const DELETE = () => methodNotAllowed(["GET", "POST"]);
export const PUT = () => methodNotAllowed(["GET", "POST"]);

function redirectFor(role: TestLoginRole, onboarded: boolean): string {
  const segment = role === "influencer" ? "creator" : "business";
  return onboarded ? `/${segment}/dashboard` : `/${segment}/onboarding`;
}

export async function GET(): Promise<Response> {
  return jsonSuccess({ roles: getAvailableTestLoginRoles() });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const parsed = TestLoginBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Choose a valid test account.", 400);
  }

  const credentials = getTestLoginCredentials(parsed.data.role);
  if (!credentials) {
    return jsonError("Test login is not configured.", 404);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error || !data.user) {
    return jsonError("Could not sign in to the test account.", 401);
  }

  const [{ data: profile }, { data: userRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarded")
      .eq(PROFILE_PK_COLUMN, data.user.id)
      .single(),
    supabase.from("users").select("role").eq("id", data.user.id).single(),
  ]);

  const role =
    (userRow?.role as TestLoginRole | undefined) ??
    (data.user.app_metadata?.role as TestLoginRole | undefined) ??
    parsed.data.role;
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

  return jsonSuccess({
    redirectTo: redirectFor(role, onboarded),
  });
}
