/* eslint-disable */
/**
 * k6 load test — health endpoint (/api/health).
 *
 * A lightweight, high-frequency probe: the health endpoint must stay fast and
 * return 200 even while downstreams are degraded (it reports `status` rather than
 * failing). Use this as a baseline/smoke load test before the heavier scenarios.
 *
 * Env vars:
 *   BASE_URL  — target origin (default http://localhost:3000)
 *
 * Run:
 *   k6 run tests/load/load-test-health.js
 *   BASE_URL=https://staging.aether.app k6 run tests/load/load-test-health.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const healthErrors = new Rate("health_errors");

export const options = {
  scenarios: {
    health_probe: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 25 }, // ramp up
        { duration: "40s", target: 25 }, // steady probing
        { duration: "10s", target: 0 }, // wind down
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    // Health must be fast and almost never error.
    http_req_duration: ["p(95)<300"],
    health_errors: ["rate<0.005"],
    checks: ["rate>0.99"],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/health`, { tags: { endpoint: "health" } });

  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "reports ok|degraded": (r) => {
      try {
        return ["ok", "degraded"].indexOf(r.json("status")) !== -1;
      } catch (_e) {
        return false;
      }
    },
  });

  healthErrors.add(!ok);
  sleep(1);
}
