import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl, isMockMode } from "@/lib/env";
import { PROFILE_PK_COLUMN } from "@/lib/supabase/profile";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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

  let isLoggedIn = false;
  let userRole: "business" | "influencer" = "business";
  let isOnboarded = false;

  if (isMockMode) {
    const sessionCookie = cookieStore.get("aether-session")?.value;
    const roleCookie = cookieStore.get("aether-role")?.value;
    const onboardedCookie = cookieStore.get("aether-onboarded")?.value;

    isLoggedIn = !!sessionCookie;
    userRole = roleCookie === "influencer" ? "influencer" : "business";
    isOnboarded = onboardedCookie === "true";
  } else {
    try {
      const supabase = createServerClient(
        getSupabaseUrl(),
        getSupabaseAnonKey(),
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

      const {
        data: { user },
      } = await supabase.auth.getUser();
      isLoggedIn = !!user;

      if (user) {
        userRole =
          (user.app_metadata?.role as "business" | "influencer") || "influencer";

        const { data: userRow } = await supabase
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();
        if (userRow?.role) {
          userRole = userRow.role as "business" | "influencer";
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("onboarded")
          .eq(PROFILE_PK_COLUMN, user.id)
          .single();
        isOnboarded = profile?.onboarded ?? false;

        res.cookies.set("aether-onboarded", isOnboarded ? "true" : "false", {
          path: "/",
          maxAge: 31536000,
          sameSite: "lax",
        });
      }
    } catch {
      isLoggedIn = false;
    }
  }

  const isProtectedPath =
    pathname.startsWith("/business") ||
    pathname.startsWith("/influencer") ||
    pathname.startsWith("/campaigns") ||
    pathname === "/dashboard";

  if (!isLoggedIn && isProtectedPath) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAuthPath = pathname.startsWith("/auth");
  if (isLoggedIn && isAuthPath) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isLoggedIn) {
    if (pathname === "/dashboard") {
      if (!isOnboarded) {
        return NextResponse.redirect(
          new URL(`/${userRole}/onboarding`, request.url)
        );
      }
      return NextResponse.redirect(new URL(`/${userRole}/dashboard`, request.url));
    }

    if (pathname.startsWith("/business") && userRole !== "business") {
      return NextResponse.redirect(new URL("/influencer/dashboard", request.url));
    }

    if (pathname.startsWith("/influencer") && userRole !== "influencer") {
      return NextResponse.redirect(new URL("/business/dashboard", request.url));
    }

    const isBusinessOnboarding = pathname === "/business/onboarding";
    const isInfluencerOnboarding = pathname === "/influencer/onboarding";
    const isOnboardingPath = isBusinessOnboarding || isInfluencerOnboarding;

    if (!isOnboarded && isProtectedPath && !isOnboardingPath) {
      return NextResponse.redirect(
        new URL(`/${userRole}/onboarding`, request.url)
      );
    }

    if (isOnboarded && isOnboardingPath) {
      return NextResponse.redirect(
        new URL(`/${userRole}/dashboard`, request.url)
      );
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};