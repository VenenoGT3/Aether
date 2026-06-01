import { createServerClient } from "@supabase/ssr";
import { cookies as getCookies } from "next/headers";
import { Profile, MOCK_BUSINESS_USER, MOCK_INFLUENCER_USER } from "./client";

// Detect if we are running in mock mode
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const isMockMode = 
  !supabaseUrl || 
  !supabaseAnonKey || 
  supabaseUrl.includes("placeholder-url") || 
  supabaseUrl.includes("your-project-id") ||
  supabaseAnonKey.includes("placeholder-anon-key") ||
  supabaseAnonKey.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");

export async function createClient() {
  const cookieStore = await getCookies();

  return createServerClient(
    supabaseUrl || "https://placeholder-url.supabase.co",
    supabaseAnonKey || "placeholder-anon-key",
    {
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
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

// Server user session detection
export async function getServerSession() {
  if (isMockMode) {
    const cookieStore = await getCookies();
    const sessionCookie = cookieStore.get("aether-session")?.value;
    if (!sessionCookie) return null;
    
    // Extract user ID from mock token if possible
    const userId = sessionCookie.replace("mock-token-", "");
    return {
      user: {
        id: userId,
        email: userId.includes("influencer") ? "creator@aether.co" : "brand@aether.co"
      }
    };
  }
  
  try {
    const supabaseServer = await createClient();
    const { data: { session } } = await supabaseServer.auth.getSession();
    return session;
  } catch (e) {
    return null;
  }
}

// Server role detection (reads from the role cookie or user session)
export async function getServerUser(): Promise<Profile | null> {
  const cookieStore = await getCookies();
  const sessionCookie = cookieStore.get("aether-session")?.value;
  
  if (!sessionCookie) return null;
  
  if (isMockMode) {
    const roleCookie = cookieStore.get("aether-role")?.value as "business" | "influencer" || "business";
    const onboardedCookie = cookieStore.get("aether-onboarded")?.value === "true";
    
    // Choose base template
    const baseProfile = roleCookie === "influencer" ? MOCK_INFLUENCER_USER : MOCK_BUSINESS_USER;
    
    // If it's a dynamic mock user (from signup), build a custom object
    const isSignedUpUser = sessionCookie.startsWith("mock-token-mock-user-");
    const userId = sessionCookie.replace("mock-token-", "");
    
    return {
      ...baseProfile,
      id: userId,
      role: roleCookie,
      onboarded: onboardedCookie,
      full_name: isSignedUpUser ? (roleCookie === "business" ? "New Brand" : "New Creator") : baseProfile.full_name
    };
  }
  
  try {
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return null;
    
    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
      
    return profile as Profile;
  } catch (e) {
    return null;
  }
}

export async function getServerRole(): Promise<"business" | "influencer"> {
  const cookieStore = await getCookies();
  const roleCookie = cookieStore.get("aether-role")?.value as "business" | "influencer";
  
  if (roleCookie) return roleCookie;
  
  if (!isMockMode) {
    try {
      const supabaseServer = await createClient();
      const { data: { user } } = await supabaseServer.auth.getUser();
      if (user) {
        return (user.app_metadata?.role as "business" | "influencer") || "business";
      }
    } catch (e) {}
  }
  
  return "business";
}

export async function isUserOnboarded(): Promise<boolean> {
  const cookieStore = await getCookies();
  const onboardedCookie = cookieStore.get("aether-onboarded")?.value;
  
  if (onboardedCookie !== undefined) {
    return onboardedCookie === "true";
  }
  
  if (!isMockMode) {
    try {
      const supabaseServer = await createClient();
      const { data: { user } } = await supabaseServer.auth.getUser();
      if (user) {
        const { data: profile } = await supabaseServer
          .from("profiles")
          .select("onboarded")
          .eq("id", user.id)
          .single();
          
        return profile?.onboarded ?? false;
      }
    } catch (e) {}
  }
  
  return false;
}
