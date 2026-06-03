/* eslint-disable */
/**
 * k6 load test — clip submission (POST /api/clips), authenticated creator path.
 *
 * Models creators posting clips, including an end-of-campaign rush. This is a
 * WRITE path guarded by per-user rate limiting (8/min) + the "clip-write"
 * backpressure budget, so the goal is to verify the system SHEDS gracefully
 * (429/503) under burst load and NEVER returns 5xx — not to maximize throughput.
 *
 * AUTH / TARGET:
 *   - Easiest: a MOCK-MODE deployment (AETHER_MOCK_MODE=true) — auth is bypassed
 *     and submissions return a mock clip (no DB writes). NOTE: in mock mode every
 *     request shares one demo user, so the per-user rate limit (8/min) will 429
 *     most traffic — that's the rate limiter working, and is the expected result.
 *   - Real throughput testing: run against a seeded staging env, supply a creator
 *     session via AUTH_COOKIE and an OPEN performance campaign via CAMPAIGN_ID.
 *     Use several creator sessions to exercise true concurrency.
 *
 * Env vars:
 *   BASE_URL     — target origin (default http://localhost:3000)
 *   AUTH_COOKIE  — (real mode) Cookie header for a logged-in CREATOR session
 *   CAMPAIGN_ID  — (real mode) an open performance campaign UUID to submit to
 *
 * Run:
 *   k6 run tests/load/load-test-clip-submit.js
 *   BASE_URL=https://staging.aether.app AUTH_COOKIE="sb-...=..." \
 *     CAMPAIGN_ID="<uuid>" k6 run tests/load/load-test-clip-submit.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const AUTH_COOKIE = __ENV.AUTH_COOKIE || "";
const CAMPAIGN_ID = __ENV.CAMPAIGN_ID || "00000000-0000-0000-0000-000000000000";

const HEADERS = {
  "Content-Type": "application/json",
  "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8",
  "User-Agent": "AetherLoadTest/1.0 (+k6; clip-submit)",
};
if (AUTH_COOKIE) HEADERS["Cookie"] = AUTH_COOKIE;

const accepted = new Rate("clip_accepted"); // 2xx
const shed = new Rate("clip_shed"); // 429 (rate limit) / 503 (backpressure) — expected
const serverErrors = new Rate("clip_server_errors"); // 5xx — real failures

export const options = {
  scenarios: {
    clip_submit: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 20 }, // creators trickle in
        { duration: "2m", target: 20 }, // steady submissions
        { duration: "30s", target: 100 }, // end-of-campaign rush
        { duration: "1m", target: 100 }, // sustained rush
        { duration: "30s", target: 0 }, // wind down
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    // The contract under load: NO server errors. Rate-limit/backpressure 429/503
    // are the system protecting itself, so they're allowed (not counted as errors).
    clip_server_errors: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  // Each submission needs a unique post URL (per-campaign unique constraint).
  const uniqueRef = `${__VU}-${__ITER}-${Date.now()}`;
  const payload = JSON.stringify({
    campaign_id: CAMPAIGN_ID,
    post_url: `https://www.tiktok.com/@creator${__VU}/video/${uniqueRef}`,
    platform: "tiktok",
  });

  const res = http.post(`${BASE_URL}/api/clips`, payload, {
    headers: HEADERS,
    tags: { endpoint: "clip-submit" },
  });

  accepted.add(res.status >= 200 && res.status < 300);
  shed.add(res.status === 429 || res.status === 503);
  serverErrors.add(res.status >= 500);

  check(res, {
    "no server error (5xx)": (r) => r.status < 500,
    "handled (2xx | 409 | 429 | 503)": (r) =>
      (r.status >= 200 && r.status < 300) ||
      r.status === 409 ||
      r.status === 429 ||
      r.status === 503,
  });

  // Creators post occasionally, not in tight loops: 5–15s think time.
  sleep(Math.random() * 10 + 5);
}
