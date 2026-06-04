import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import { logger, genRequestId } from "@/lib/logger";
import { PROFILE_PK_COLUMN } from "@/lib/supabase/profile";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

/**
 * Single Next.js 16 proxy entrypoint.
 *
 * API requests get request-id propagation for correlated route-handler logs.
 * Page requests get the lightweight auth/role redirects formerly implemented
 * in middleware.ts.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return correlateApiRequest(request);
  }

  return enforcePageAccess(request);
}

function correlateApiRequest(request: NextRequest): NextResponse {
  const requestId = request.headers.get("x-request-id") || genRequestId();
  const startTime = Date.now();
  const pathname = request.nextUrl.pathname; // already excludes the query string
  // User-agent carries no secrets; cap length so a hostile client can't bloat logs.
  const userAgent = request.headers.get("user-agent")?.slice(0, 256) || undefined;

  logger.info(
    { event: "request.received", requestId, method: request.method, url: pathname, userAgent },
    "request.received"
  );

  // Forward correlation context UPSTREAM to the route handler (new request headers).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-request-start", String(startTime));

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Echo the id to the client for end-to-end tracing / support correlation.
  response.headers.set("x-request-id", requestId);
  return response;
}

async function enforcePageAccess(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const res = NextResponse.next();

  let isLoggedIn = false;
  let userRole: "business" | "influencer" = "business";
  let isOnboarded = false;

  try {
    const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
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
    });

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

  const userRolePath = userRole === "influencer" ? "creator" : "business";

  const isProtectedPath =
    pathname.startsWith("/business") ||
    pathname.startsWith("/creator") ||
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
          new URL(`/${userRolePath}/onboarding`, request.url)
        );
      }
      return NextResponse.redirect(new URL(`/${userRolePath}/dashboard`, request.url));
    }

    if (pathname.startsWith("/business") && userRole !== "business") {
      return NextResponse.redirect(new URL("/creator/dashboard", request.url));
    }

    if (pathname.startsWith("/creator") && userRole !== "influencer") {
      return NextResponse.redirect(new URL("/business/dashboard", request.url));
    }

    const isBusinessOnboarding = pathname === "/business/onboarding";
    const isCreatorOnboarding = pathname === "/creator/onboarding";
    const isOnboardingPath = isBusinessOnboarding || isCreatorOnboarding;

    if (!isOnboarded && isProtectedPath && !isOnboardingPath) {
      return NextResponse.redirect(
        new URL(`/${userRolePath}/onboarding`, request.url)
      );
    }

    if (isOnboarded && isOnboardingPath) {
      return NextResponse.redirect(
        new URL(`/${userRolePath}/dashboard`, request.url)
      );
    }
  }

  return res;
}
