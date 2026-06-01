import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Profile, UserRole } from "@/types";
export type { Profile };

// Safe loading of environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Detect if we are running in mock mode
export const isMockMode = 
  !supabaseUrl || 
  !supabaseAnonKey || 
  supabaseUrl.includes("placeholder-url") || 
  supabaseUrl.includes("your-project-id") ||
  supabaseAnonKey.includes("placeholder-anon-key") ||
  supabaseAnonKey.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");

// Real client instantiation (will fail gracefully if variables are placeholders/missing)
export const supabase = createSupabaseClient(
  supabaseUrl || "https://placeholder-url.supabase.co", 
  supabaseAnonKey || "placeholder-anon-key"
);

// Active mock user templates
export const MOCK_BUSINESS_USER: Profile = {
  id: "mock-business-uuid",
  role: "business",
  full_name: "Sarah Jenkins",
  avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
  onboarded: true,
  email: "sarah@aether.co",
  company_name: "Aether Labs",
  website: "https://aetherlabs.co",
  industry: "Technology",
  company_size: "11-50",
  stripe_connect_id: "acct_mockstripe123",
  stripe_onboarding_completed: true,
  bio: "Creating frictionless marketing ecosystems.",
};

export const MOCK_INFLUENCER_USER: Profile = {
  id: "mock-influencer-uuid",
  role: "influencer",
  full_name: "Marcus Vance",
  avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
  onboarded: true,
  email: "marcus@aether.co",
  social_handle: "@marcusv", // Deprecated, kept for backward compatibility
  bio: "Visual storyteller focusing on tech, desktop setups, and minimalism.",
  niche: "Tech & Design",
  followers: 48500,
  engagement_rate: 4.8,
  social_links: {
    tiktok: "marcusv.tiktok",
    instagram: "marcusv",
    youtube: "marcusvance"
  },
  rate_card: {
    post: 450,
    video: 950,
    story: 200
  },
  portfolio: [
    { title: "Desk Setup Tour 2026", description: "Product placement integration for minimalist desk shelf.", url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80" },
    { title: "Apple Studio Display Review", description: "Video collaboration reviewing creative workflow enhancements.", url: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80" }
  ]
};

// Client-side authentication helpers with fallback
export function getMockUser(): Profile {
  if (typeof window === "undefined") return MOCK_BUSINESS_USER;
  
  const activeId = localStorage.getItem("aether-active-uid");
  if (activeId) {
    const profileJson = localStorage.getItem(`aether-profile-${activeId}`);
    if (profileJson) {
      try {
        return JSON.parse(profileJson);
      } catch (e) {
        // Fallback
      }
    }
  }
  
  const storedRole = localStorage.getItem("aether-mock-role") as UserRole;
  if (storedRole === "influencer") {
    return MOCK_INFLUENCER_USER;
  }
  return MOCK_BUSINESS_USER;
}

export function setMockUserRole(role: UserRole) {
  if (typeof window !== "undefined") {
    localStorage.setItem("aether-mock-role", role);
    const mockUser = role === "influencer" ? MOCK_INFLUENCER_USER : MOCK_BUSINESS_USER;
    localStorage.setItem("aether-active-uid", mockUser.id);
    localStorage.setItem(`aether-profile-${mockUser.id}`, JSON.stringify(mockUser));
    
    // Force cookies for server-side middleware and actions
    document.cookie = `aether-role=${role}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = `aether-session=mock-token-${mockUser.id}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = `aether-onboarded=true; path=/; max-age=31536000; SameSite=Lax`;
    
    window.dispatchEvent(new Event("role-change"));
  }
}

export function getMockRole(): UserRole {
  if (typeof window === "undefined") return "business";
  return (localStorage.getItem("aether-mock-role") as UserRole) || "business";
}

// Client authentication methods that handle Mock vs Supabase
export async function signUpClient(email: string, password: string, fullName: string, role: UserRole) {
  if (isMockMode) {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    const id = `mock-user-${Math.random().toString(36).substr(2, 9)}`;
    const avatar_url = role === "business" 
      ? "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
      : "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80";
      
    const newProfile: Profile = {
      id,
      role,
      full_name: fullName,
      avatar_url,
      onboarded: false,
      social_handle: role === "influencer" ? `@${fullName.toLowerCase().replace(/\s+/g, "")}` : undefined
    };
    
    if (typeof window !== "undefined") {
      localStorage.setItem("aether-active-uid", id);
      localStorage.setItem("aether-mock-role", role);
      localStorage.setItem(`aether-profile-${id}`, JSON.stringify(newProfile));
      
      document.cookie = `aether-role=${role}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aether-session=mock-token-${id}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aether-onboarded=false; path=/; max-age=31536000; SameSite=Lax`;
      
      window.dispatchEvent(new Event("role-change"));
    }
    
    return { data: { user: { id, email, user_metadata: { role, full_name: fullName } } }, error: null };
  } else {
    // Real Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          full_name: fullName
        }
      }
    });
    
    if (data?.user) {
      // Sync cookies on sign up success
      document.cookie = `aether-role=${role}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aether-session=session-active; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aether-onboarded=false; path=/; max-age=31536000; SameSite=Lax`;
    }
    
    return { data, error };
  }
}

export async function signInClient(email: string, password: string) {
  if (isMockMode) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    // Simulate finding a registered user or fallback to defaults
    let activeId = "";
    let role: UserRole = "business";
    
    // Search localStorage for existing mock profiles
    if (typeof window !== "undefined") {
      let foundUser: Profile | null = null;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("aether-profile-")) {
          const val = localStorage.getItem(key);
          if (val) {
            try {
              const parsed = JSON.parse(val);
              // Since we don't store passwords, we simulate matching by email if name contains part of email
              const emailPrefix = email.split("@")[0].toLowerCase();
              if (parsed.full_name?.toLowerCase().includes(emailPrefix) || parsed.id.includes(emailPrefix)) {
                foundUser = parsed;
                break;
              }
            } catch (e) {}
          }
        }
      }
      
      if (foundUser) {
        activeId = foundUser.id;
        role = foundUser.role;
      } else {
        // Fallback based on email domain or string contains
        const isInfluencerEmail = email.toLowerCase().includes("creator") || email.toLowerCase().includes("influencer");
        role = isInfluencerEmail ? "influencer" : "business";
        const defaultUser = role === "influencer" ? MOCK_INFLUENCER_USER : MOCK_BUSINESS_USER;
        activeId = defaultUser.id;
        localStorage.setItem(`aether-profile-${activeId}`, JSON.stringify(defaultUser));
      }
      
      localStorage.setItem("aether-active-uid", activeId);
      localStorage.setItem("aether-mock-role", role);
      
      const profile = JSON.parse(localStorage.getItem(`aether-profile-${activeId}`) || "{}") as Profile;
      
      document.cookie = `aether-role=${role}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aether-session=mock-token-${activeId}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aether-onboarded=${profile.onboarded ? "true" : "false"}; path=/; max-age=31536000; SameSite=Lax`;
      
      window.dispatchEvent(new Event("role-change"));
    }
    
    return { data: { user: { id: activeId, email } }, error: null };
  } else {
    // Real Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (data?.user) {
      // Fetch user profile to set role and onboarded cookies
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, onboarded")
        .eq("id", data.user.id)
        .single();
        
      const userRole = profile?.role || data.user.app_metadata?.role || "influencer";
      const isOnboarded = profile?.onboarded ?? false;
      
      document.cookie = `aether-role=${userRole}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aether-session=session-active; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `aether-onboarded=${isOnboarded ? "true" : "false"}; path=/; max-age=31536000; SameSite=Lax`;
    }
    
    return { data, error };
  }
}

export async function signOutClient() {
  if (typeof window !== "undefined") {
    // Remove local storage triggers
    localStorage.removeItem("aether-active-uid");
    
    // Clear cookies
    document.cookie = "aether-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "aether-role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "aether-onboarded=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    
    window.dispatchEvent(new Event("role-change"));
  }
  
  if (!isMockMode) {
    await supabase.auth.signOut();
  }
  return { error: null };
}

export async function getClientProfile(): Promise<Profile | null> {
  if (isMockMode) {
    return getMockUser();
  }
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
    
  if (data) {
    return {
      ...data,
      email: user.email
    } as Profile;
  }
  return null;
}

export async function updateClientProfile(data: Partial<Profile>): Promise<{ data: Profile | null; error: any }> {
  if (isMockMode) {
    const profile = getMockUser();
    const updated = { ...profile, ...data };
    
    if (typeof window !== "undefined") {
      localStorage.setItem(`aether-profile-${profile.id}`, JSON.stringify(updated));
      document.cookie = `aether-onboarded=${updated.onboarded ? "true" : "false"}; path=/; max-age=31536000; SameSite=Lax`;
      window.dispatchEvent(new Event("role-change"));
    }
    
    return { data: updated, error: null };
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: new Error("User not authenticated") };
    
    const { data: updated, error } = await supabase
      .from("profiles")
      .update(data)
      .eq("id", user.id)
      .select()
      .single();
      
    if (!error && updated) {
      document.cookie = `aether-onboarded=${updated.onboarded ? "true" : "false"}; path=/; max-age=31536000; SameSite=Lax`;
    }
    
    return { data: updated as Profile, error };
  }
}
