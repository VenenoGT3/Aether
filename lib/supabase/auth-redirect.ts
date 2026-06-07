const PUBLIC_APP_ORIGIN = "https://aether-blue-alpha.vercel.app";

function safeNextPath(nextPath?: string): string {
  if (!nextPath?.startsWith("/") || nextPath.startsWith("//")) return "/dashboard";
  return nextPath;
}

function normalizeOrigin(value?: string): string | null {
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isVercelDeploymentOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname.endsWith(".vercel.app") && hostname !== new URL(PUBLIC_APP_ORIGIN).hostname;
  } catch {
    return false;
  }
}

export function appOrigin(currentOrigin?: string): string {
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL?.trim());
  const browserOrigin = normalizeOrigin(currentOrigin);

  if (browserOrigin && isLocalOrigin(browserOrigin)) {
    return browserOrigin;
  }

  if (!configuredOrigin && browserOrigin && isVercelDeploymentOrigin(browserOrigin)) {
    return PUBLIC_APP_ORIGIN;
  }

  return configuredOrigin || browserOrigin || "http://localhost:3000";
}

export function authCallbackUrl(nextPath = "/dashboard", currentOrigin?: string): string {
  const url = new URL("/auth/callback", appOrigin(currentOrigin));
  url.searchParams.set("next", safeNextPath(nextPath));
  return url.toString();
}
