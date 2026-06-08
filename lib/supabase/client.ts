import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { Profile, UserRole } from "@/types";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import { authCallbackUrl as buildAuthCallbackUrl } from "@/lib/supabase/auth-redirect";
import { mergeProfileWithUser, PROFILE_PK_COLUMN } from "@/lib/supabase/profile";

export type { Profile };

/** Browser Supabase client (anon key). Real auth + data only — no mock paths. */
export const supabase = createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey(), {
  auth: {
    detectSessionInUrl: false,
  },
});

/**
 * Hosted Supabase email templates are locked on the free/default mailer.
 * Use implicit signup links there so confirmation emails don't depend on a
 * browser-local PKCE verifier that may be absent when users open email links.
 */
const signupRedirectClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    flowType: "implicit",
    persistSession: false,
  },
});

/** A one-year, lax cookie used by middleware/server for coarse role + onboarding UX. */
function setUxCookie(name: string, value: string): void {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

function withClientTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export function authCallbackUrl(nextPath = "/dashboard"): string {
  return buildAuthCallbackUrl(
    nextPath,
    typeof window !== "undefined" ? window.location.origin : undefined
  );
}

export function signInWithGoogleClient(nextPath = "/dashboard") {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: authCallbackUrl(nextPath),
      scopes: "openid email profile",
      queryParams: {
        prompt: "select_account",
      },
    },
  });
}

export async function syncAuthUxCookies(roleHint?: UserRole) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  if (roleHint) {
    await supabase.rpc("claim_initial_user_role", { p_role: roleHint });
  }

  const fallbackRole =
    roleHint ||
    (user.app_metadata?.role as UserRole) ||
    (user.user_metadata?.role as UserRole) ||
    "influencer";

  setUxCookie("aether-role", fallbackRole);
  setUxCookie("aether-session", "session-active");
  setUxCookie("aether-onboarded", "false");

  const [{ data: profile }, { data: userRow }] = await Promise.all([
    supabase
      .from("profiles")
      .select("onboarded")
      .eq(PROFILE_PK_COLUMN, user.id)
      .maybeSingle(),
    supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
  ]);

  const userRole = (userRow?.role as UserRole) || fallbackRole;
  const isOnboarded = profile?.onboarded ?? false;

  setUxCookie("aether-role", userRole);
  setUxCookie("aether-onboarded", isOnboarded ? "true" : "false");
  window.dispatchEvent(new Event("role-change"));

  return { role: userRole, onboarded: isOnboarded };
}

export async function signUpClient(
  email: string,
  password: string,
  fullName: string,
  role: UserRole,
  nextPath?: string
) {
  const { data, error } = await signupRedirectClient.auth.signUp({
    email,
    password,
    options: {
      data: { role, full_name: fullName },
      emailRedirectTo: authCallbackUrl(nextPath),
    },
  });

  if (data.session) {
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }

  if (data?.user && data.session) {
    setUxCookie("aether-role", role);
    setUxCookie("aether-session", "session-active");
    setUxCookie("aether-onboarded", "false");
  }

  return { data, error, needsEmailConfirmation: !!data?.user && !data.session };
}

export async function resendSignupConfirmation(email: string, nextPath = "/dashboard") {
  return signupRedirectClient.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: authCallbackUrl(nextPath) },
  });
}

export async function signInClient(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (data?.user) {
    const fallbackRole =
      (data.user.app_metadata?.role as UserRole) ||
      (data.user.user_metadata?.role as UserRole) ||
      "influencer";

    void withClientTimeout(syncAuthUxCookies(fallbackRole), 5000)
      .catch(() => {
        // The server-side route guard performs the authoritative profile lookup.
      });
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
    supabase.from("profiles").select("*").eq(PROFILE_PK_COLUMN, user.id).maybeSingle(),
    supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
  ]);

  if (profile) {
    return mergeProfileWithUser(
      profile,
      userRow?.role ?? user.user_metadata?.role,
      user.email
    );
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

  const dbProfileFields: Record<string, unknown> = { ...data };
  const followers = data.followers;
  const niche = data.niche;
  const socialLinks = data.social_links;

  delete dbProfileFields.role;
  delete dbProfileFields.user_id;
  delete dbProfileFields.email;
  delete dbProfileFields.followers;
  delete dbProfileFields.niche;
  delete dbProfileFields.social_handle;
  delete dbProfileFields.social_links;
  delete dbProfileFields.portfolio;
  delete dbProfileFields.onboarded;
  delete dbProfileFields.trusted_creator;
  delete dbProfileFields.stripe_connect_id;
  delete dbProfileFields.stripe_onboarding_completed;
  delete dbProfileFields.authenticity_score;

  if (followers !== undefined) dbProfileFields.follower_count = followers;
  if (niche !== undefined) dbProfileFields.niches = niche ? [niche] : [];
  if (socialLinks !== undefined) dbProfileFields.social_handles = socialLinks;

  const { data: updated, error } = await supabase
    .from("profiles")
    .update(dbProfileFields)
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
