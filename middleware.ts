import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Exclude static assets, public folder, and api routes from middleware interception
  if (
    pathname.startsWith("/_next") || 
    pathname.startsWith("/api") || 
    pathname.includes(".") || 
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const cookieStore = request.cookies;
  
  // Safe loading of environment variables to determine mock mode
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const isMockMode = 
    !supabaseUrl || 
    !supabaseAnonKey || 
    supabaseUrl.includes("placeholder-url") || 
    supabaseUrl.includes("your-project-id") ||
    supabaseAnonKey.includes("placeholder-anon-key") ||
    supabaseAnonKey.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");

  let isLoggedIn = false;
  let userRole: "business" | "influencer" = "business";
  let isOnboarded = false;

  if (isMockMode) {
    // Read session status from mock cookies
    const sessionCookie = cookieStore.get("aether-session")?.value;
    const roleCookie = cookieStore.get("aether-role")?.value;
    const onboardedCookie = cookieStore.get("aether-onboarded")?.value;
    
    isLoggedIn = !!sessionCookie;
    userRole = (roleCookie === "influencer" ? "influencer" : "business");
    isOnboarded = onboardedCookie === "true";
  } else {
    // Real Supabase Client logic in middleware
    try {
      const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value, options }) => {
                request.cookies.set(name, value);
                res.cookies.set(name, value, options);
              });
            },
          },
        }
      );
      
      const { data: { user } } = await supabase.auth.getUser();
      isLoggedIn = !!user;
      
      if (user) {
        // Read custom claim from JWT app_metadata
        userRole = (user.app_metadata?.role as "business" | "influencer") || "influencer";
        
        // Check onboarded state from cookie or profile database fallback.
        // Reading from cookie is preferred for speed in middleware.
        const onboardedCookie = cookieStore.get("aether-onboarded")?.value;
        if (onboardedCookie !== undefined) {
          isOnboarded = onboardedCookie === "true";
        } else {
          // Quick DB query fallback in middleware
          const { data: profile } = await supabase
            .from("profiles")
            .select("onboarded")
            .eq("id", user.id)
            .single();
          isOnboarded = profile?.onboarded ?? false;
          
          // Write to cookie to prevent repeated DB checks
          res.cookies.set("aether-onboarded", isOnboarded ? "true" : "false", {
            path: "/",
            maxAge: 31536000,
            sameSite: "lax"
          });
        }
      }
    } catch (e) {
      isLoggedIn = false;
    }
  }

  // 1. Unauthenticated users trying to access protected routes
  const isProtectedPath = 
    pathname.startsWith("/business") || 
    pathname.startsWith("/influencer") || 
    pathname.startsWith("/campaigns") ||
    pathname === "/dashboard";
    
  if (!isLoggedIn && isProtectedPath) {
    const loginUrl = new URL("/auth/login", request.url);
    // Option to redirect back after login
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Authenticated users trying to access login/signup pages
  const isAuthPath = pathname.startsWith("/auth");
  if (isLoggedIn && isAuthPath) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 3. Authenticated user routing guards
  if (isLoggedIn) {
    // Redirect if accessing dashboard root
    if (pathname === "/dashboard") {
      if (!isOnboarded) {
        return NextResponse.redirect(new URL(`/${userRole}/onboarding`, request.url));
      }
      return NextResponse.redirect(new URL(`/${userRole}/dashboard`, request.url));
    }

    // Role specific route check
    if (pathname.startsWith("/business") && userRole !== "business") {
      // Influencer trying to access business dashboard
      return NextResponse.redirect(new URL("/influencer/dashboard", request.url));
    }
    
    if (pathname.startsWith("/influencer") && userRole !== "influencer") {
      // Business trying to access influencer dashboard
      return NextResponse.redirect(new URL("/business/dashboard", request.url));
    }

    // Onboarding guard
    const isBusinessOnboarding = pathname === "/business/onboarding";
    const isInfluencerOnboarding = pathname === "/influencer/onboarding";
    const isOnboardingPath = isBusinessOnboarding || isInfluencerOnboarding;

    if (!isOnboarded && isProtectedPath && !isOnboardingPath) {
      // Direct user to onboarding if they haven't onboarded yet
      return NextResponse.redirect(new URL(`/${userRole}/onboarding`, request.url));
    }

    if (isOnboarded && isOnboardingPath) {
      // If already onboarded, prevent returning to onboarding wizard
      return NextResponse.redirect(new URL(`/${userRole}/dashboard`, request.url));
    }
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
