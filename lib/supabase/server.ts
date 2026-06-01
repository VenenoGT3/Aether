import { createServerClient } from "@supabase/ssr";
import { cookies as getCookies } from "next/headers";
import { Profile, UserRole } from "@/types";
import { getSupabaseAnonKey, getSupabaseUrl, isMockMode } from "@/lib/env";
import { MOCK_BUSINESS_USER, MOCK_INFLUENCER_USER } from "./client";
import { mergeProfileWithUser, PROFILE_PK_COLUMN } from "@/lib/supabase/profile";

export { isMockMode };

export async function createClient() {
  const cookieStore = await getCookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — middleware refreshes sessions
        }
      },
    },
  });
}

export async function getServerSession() {
  if (isMockMode) {
    const cookieStore = await getCookies();
    const sessionCookie = cookieStore.get("aether-session")?.value;
    if (!sessionCookie) return null;

    const userId = sessionCookie.replace("mock-token-", "");
    return {
      user: {
        id: userId,
        email: userId.includes("influencer")
          ? "creator@aether.co"
          : "brand@aether.co",
      },
    };
  }

  try {
    const supabaseServer = await createClient();
    const {
      data: { session },
    } = await supabaseServer.auth.getSession();
    return session;
  } catch {
    return null;
  }
}

export async function getServerUser(): Promise<Profile | null> {
  const cookieStore = await getCookies();
  const sessionCookie = cookieStore.get("aether-session")?.value;

  if (!sessionCookie) return null;

  if (isMockMode) {
    const roleCookie =
      (cookieStore.get("aether-role")?.value as "business" | "influencer") ||
      "business";
    const onboardedCookie =
      cookieStore.get("aether-onboarded")?.value === "true";

    const baseProfile =
      roleCookie === "influencer" ? MOCK_INFLUENCER_USER : MOCK_BUSINESS_USER;
    const isSignedUpUser = sessionCookie.startsWith("mock-token-mock-user-");
    const userId = sessionCookie.replace("mock-token-", "");

    return {
      ...baseProfile,
      user_id: userId,
      role: roleCookie,
      onboarded: onboardedCookie,
      full_name: isSignedUpUser
        ? roleCookie === "business"
          ? "New Brand"
          : "New Creator"
        : baseProfile.full_name,
    };
  }

  try {
    const supabaseServer = await createClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    if (!user) return null;

    const [{ data: profile }, { data: userRow }] = await Promise.all([
      supabaseServer.from("profiles").select("*").eq(PROFILE_PK_COLUMN, user.id).single(),
      supabaseServer.from("users").select("role").eq("id", user.id).single(),
    ]);

    if (!profile) return null;

    return mergeProfileWithUser(
      profile,
      userRow?.role ?? user.app_metadata?.role,
      user.email
    );
  } catch {
    return null;
  }
}

export async function getServerRole(): Promise<"business" | "influencer"> {
  if (isMockMode) {
    const cookieStore = await getCookies();
    const roleCookie = cookieStore.get("aether-role")?.value as
      | "business"
      | "influencer";
    return roleCookie === "influencer" ? "influencer" : "business";
  }

  try {
    const supabaseServer = await createClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    if (user) {
      const { data: userRow } = await supabaseServer
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();
      return (
        (userRow?.role as "business" | "influencer") ||
        (user.app_metadata?.role as "business" | "influencer") ||
        "business"
      );
    }
  } catch {}

  return "business";
}

export async function isUserOnboarded(): Promise<boolean> {
  if (isMockMode) {
    const cookieStore = await getCookies();
    return cookieStore.get("aether-onboarded")?.value === "true";
  }

  try {
    const supabaseServer = await createClient();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    if (user) {
      const { data: profile } = await supabaseServer
        .from("profiles")
        .select("onboarded")
        .eq(PROFILE_PK_COLUMN, user.id)
        .single();

      return profile?.onboarded ?? false;
    }
  } catch {}

  return false;
}