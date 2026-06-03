import { NextResponse } from "next/server";
import { methodNotAllowed } from "@/lib/api/response";
import { isRedisConfigured, redisCommand } from "@/lib/redis/rest-client";
import { circuitBreakerStates } from "@/lib/circuit-breaker";
import { limiterStats } from "@/lib/backpressure";

/**
 * Lightweight, unauthenticated health endpoint for uptime/probe checks.
 *
 * Returns 200 whenever the app PROCESS is alive — even when "degraded" — because
 * downstream issues (an open breaker, Redis blip) are handled by fail-open
 * fallbacks; returning 503 here would needlessly evict a still-serving instance
 * from rotation. The JSON `status` field ("ok" | "degraded") is the alerting
 * signal. Exposes only non-sensitive operational state (no secrets/PII).
 */

export const dynamic = "force-dynamic"; // never cache health
export const POST = () => methodNotAllowed(["GET"]);

const START_TIME = Date.now();
const REDIS_PING_TIMEOUT_NOTE = "via the Redis breaker (returns fast when open)";

export async function GET(): Promise<Response> {
  const breakers = circuitBreakerStates();
  const anyBreakerOpen = Object.values(breakers).some((s) => s === "open");

  // Redis: report configured + a live reachability probe. The PING goes through
  // the breaker, so when Redis is degraded this returns fast (no hang).
  const redisConfigured = isRedisConfigured();
  let redisReachable: boolean | null = null;
  if (redisConfigured) {
    try {
      const ping = await redisCommand(["PING"]);
      redisReachable = ping.ok;
    } catch {
      redisReachable = false;
    }
  }

  const degraded = anyBreakerOpen || (redisConfigured && redisReachable === false);

  return NextResponse.json(
    {
      status: degraded ? "degraded" : "ok",
      timestamp: new Date().toISOString(),
      uptimeSec: Math.round((Date.now() - START_TIME) / 1000),
      checks: {
        redis: {
          configured: redisConfigured,
          reachable: redisReachable, // null when not configured
          note: redisConfigured ? REDIS_PING_TIMEOUT_NOTE : "not configured",
        },
        circuitBreakers: breakers, // {} until a breaker is first used
        backpressure: limiterStats(),
      },
    },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
