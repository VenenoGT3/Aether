import { createServerClient } from "@supabase/ssr";
import { cookies as getCookies } from "next/headers";
import { Profile } from "@/types";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import { mergeProfileWithUser, PROFILE_PK_COLUMN } from "@/lib/supabase/profile";

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
