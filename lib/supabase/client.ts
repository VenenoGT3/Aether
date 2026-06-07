import { createBrowserClient } from "@supabase/ssr";
import { Profile, UserRole } from "@/types";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import { mergeProfileWithUser, PROFILE_PK_COLUMN } from "@/lib/supabase/profile";

export type { Profile };

/** Browser Supabase client (anon key). Real auth + data only — no mock paths. */
export const supabase = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());

/** A one-year, lax cookie used by middleware/server for coarse role + onboarding UX. */
function setUxCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

function appOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return configured || "http://localhost:3000";
}

function safeNextPath(nextPath?: string): string {
  if (!nextPath?.startsWith("/") || nextPath.startsWith("//")) return "/dashboard";
  return nextPath;
}

export function authCallbackUrl(nextPath = "/dashboard"): string {
  const url = new URL("/auth/callback", appOrigin());
  url.searchParams.set("next", safeNextPath(nextPath));
  return url.toString();
}

export async function signUpClient(
  email: string,
  password: string,
  fullName: string,
  role: UserRole,
  nextPath?: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role, full_name: fullName },
      emailRedirectTo: authCallbackUrl(nextPath),
    },
  });

  if (data?.user && data.session) {
    setUxCookie("aether-role", role);
    setUxCookie("aether-session", "session-active");
    setUxCookie("aether-onboarded", "false");
  }

  return { data, error, needsEmailConfirmation: !!data?.user && !data.session };
}

export async function resendSignupConfirmation(email: string, nextPath = "/dashboard") {
  return supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: authCallbackUrl(nextPath) },
  });
}

export async function signInClient(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (data?.user) {
    const [{ data: profile }, { data: userRow }] = await Promise.all([
      supabase.from("profiles").select("onboarded").eq(PROFILE_PK_COLUMN, data.user.id).single(),
      supabase.from("users").select("role").eq("id", data.user.id).single(),
    ]);

    const userRole =
      (userRow?.role as UserRole) ||
      (data.user.app_metadata?.role as UserRole) ||
      "influencer";
    const isOnboarded = profile?.onboarded ?? false;

    setUxCookie("aether-role", userRole);
    setUxCookie("aether-session", "session-active");
    setUxCookie("aether-onboarded", isOnboarded ? "true" : "false");
  }

  return { data, error };
}

export async function signOutClient() {
  await supabase.auth.signOut();

  if (typeof window !== "undefined") {
    document.cookie = "aether-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "aether-role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "aether-onboarded=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.dispatchEvent(new Event("role-change"));
  }

  return { error: null };
}

export async function getClientProfile(): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: userRow }] = await Promise.all([
    supabase.from("profiles").select("*").eq(PROFILE_PK_COLUMN, user.id).single(),
    supabase.from("users").select("role").eq("id", user.id).single(),
  ]);

  if (profile) {
    return mergeProfileWithUser(profile, userRow?.role, user.email);
  }
  return null;
}

export async function updateClientProfile(
  data: Partial<Profile>
): Promise<{ data: Profile | null; error: { message: string } | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { message: "User not authenticated" } };

  // Strip identity columns that must not be updated here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { role: _role, user_id: _uid, email: _email, ...profileFields } = data;
  const { data: updated, error } = await supabase
    .from("profiles")
    .update(profileFields)
    .eq(PROFILE_PK_COLUMN, user.id)
    .select()
    .single();

  if (!error && updated) {
    if (typeof window !== "undefined") {
      setUxCookie("aether-onboarded", updated.onboarded ? "true" : "false");
    }
    const { data: userRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    return {
      data: mergeProfileWithUser(updated, userRow?.role, user.email),
      error: null,
    };
  }

  return { data: null, error };
}
