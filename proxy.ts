/**
 * Request logging + correlation-id propagation.
 *
 * NOTE ON NAMING: in Next.js 16 the `middleware.ts` convention was renamed to
 * `proxy.ts` (same capability, deprecation notice in the docs). Proxy now
 * defaults to the **Node.js runtime**, which is why we can use Pino here (it
 * would not run on the legacy Edge runtime). The `runtime` config option is not
 * allowed in proxy files.
 *
 * Responsibilities:
 *   - Generate a per-request correlation id (or honor an inbound x-request-id).
 *   - Log the INCOMING request (method, path WITHOUT query string, safe UA).
 *   - Propagate the id (and a start timestamp) to the route handler via request
 *     headers, and echo x-request-id back on the response for client-side tracing.
 *
 * WHY RESPONSE STATUS/LATENCY IS NOT LOGGED HERE: by design, proxy runs BEFORE
 * the route and returns `NextResponse.next()` — it never observes the handler's
 * final status or duration for pass-through requests. Response logging therefore
 * lives at the handler boundary (lib/api/guard.ts), which reads the propagated
 * x-request-id / x-request-start to emit a correlated completion line.
 */

import { NextResponse, type NextRequest } from "next/server";
import { logger, genRequestId } from "@/lib/logger";

export const config = {
  // Only correlate/log API traffic — not static assets, images, or page renders.
  matcher: ["/api/:path*"],
};

export function proxy(request: NextRequest): NextResponse {
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
