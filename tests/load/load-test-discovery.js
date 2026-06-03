/* eslint-disable */
/**
 * k6 load test — global discovery feed (GET /api/campaigns/search).
 *
 * Models an Italian/European creator platform: a steady weekday-evening browsing
 * baseline (CET peak ~19:00–23:00) followed by a 10x VIRAL SPIKE (a campaign or
 * post goes viral and creators flood the discovery feed). The feed is cached
 * (stale-while-revalidate) and protected by a circuit breaker + backpressure, so
 * this validates that the spike is absorbed without latency/error blowups.
 *
 * AUTH: the route is auth-guarded. Easiest target is a MOCK-MODE deployment
 * (AETHER_MOCK_MODE=true) which bypasses auth (rate limits still apply) — no
 * token needed. For a real deployment, pass a Supabase session cookie via
 * AUTH_COOKIE.
 *
 * Env vars:
 *   BASE_URL     — target origin (default http://localhost:3000)
 *   AUTH_COOKIE  — (real mode only) full Cookie header for a logged-in session
 *
 * Run:
 *   k6 run tests/load/load-test-discovery.js
 *   BASE_URL=https://staging.aether.app k6 run tests/load/load-test-discovery.js
 *
 * Run from EU/Italy zones (k6 Cloud), to mirror the user base geographically:
 *   // add to options:
 *   // ext: { loadimpact: { name: "Aether discovery", distribution: {
 *   //   milan:     { loadZone: "amazon:it:milan",     percent: 50 },
 *   //   frankfurt: { loadZone: "amazon:de:frankfurt", percent: 30 },
 *   //   paris:     { loadZone: "amazon:fr:paris",      percent: 20 },
 *   // } } }
 *   k6 cloud run tests/load/load-test-discovery.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_COOKIE = __ENV.AUTH_COOKIE || "";

const HEADERS = {
  // Italian-first audience.
  "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8",
  "User-Agent": "AetherLoadTest/1.0 (+k6; discovery)",
};
if (AUTH_COOKIE) HEADERS["Cookie"] = AUTH_COOKIE;

const NICHES = ["Tech", "Fashion", "Beauty", "Fitness", "Food", "Travel", "Gaming", "Lifestyle"];
const CATEGORIES = ["ugc", "clipping"];

const discoveryErrors = new Rate("discovery_errors");

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const options = {
  scenarios: {
    discovery: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 }, // ramp to the evening baseline
        { duration: "3m", target: 50 }, // sustained browsing
        { duration: "30s", target: 500 }, // VIRAL SPIKE — 10x in 30s
        { duration: "1m", target: 500 }, // hold the spike
        { duration: "1m", target: 50 }, // recover to baseline
        { duration: "30s", target: 0 }, // wind down
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    // The cache should keep discovery fast even through the spike. A small share
    // of 503s (backpressure shedding) is acceptable, but errors must stay low.
    http_req_duration: ["p(95)<800", "p(99)<1500"],
    discovery_errors: ["rate<0.02"],
    checks: ["rate>0.97"],
  },
};

export default function () {
  // Realistic browse mix: most just open the feed; some filter by niche/category.
  let qs = "page=1&limit=20";
  if (Math.random() < 0.5) qs += "&niche=" + pick(NICHES);
  if (Math.random() < 0.3) qs += "&category=" + pick(CATEGORIES);

  const res = http.get(`${BASE_URL}/api/campaigns/search?${qs}`, {
    headers: HEADERS,
    tags: { endpoint: "discovery" },
  });

  // 200 = served (fresh or stale cache); 503 = backpressure shedding (acceptable
  // under the spike). 5xx / 401 are failures (401 => AUTH_COOKIE needed in real mode).
  const ok = check(res, {
    "served (200 or 503)": (r) => r.status === 200 || r.status === 503,
    "feed shape when 200": (r) => {
      if (r.status !== 200) return true;
      try {
        return Array.isArray(r.json("campaigns"));
      } catch (_e) {
        return false;
      }
    },
  });
  discoveryErrors.add(!ok);

  // Italian creators browse unhurriedly in the evening: 3–8s think time.
  sleep(Math.random() * 5 + 3);
}
