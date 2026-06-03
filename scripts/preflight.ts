/**
 * Preflight configuration check. Run before a deploy and/or on host boot:
 *
 *   npm run preflight
 *
 * HARD-FAILS (exit 1) on missing required env / unsafe production config.
 * Everything else (Redis reachability, Sentry DSN, flag state) is a WARNING, in
 * line with the app's fail-open behavior. Intentionally dependency-light (only
 * the pure `lib/env` + `lib/feature-flags`) so it runs under tsx without pulling
 * the Next/Sentry module graph.
 */

import {
  isMockMode,
  getStripeWebhookHandler,
  getRequiredEnvVarNames,
  isVercelProductionDeploy,
  validateEnv,
} from "../lib/env";
import { resolveFlags, FEATURE_FLAG_NAMES } from "../lib/feature-flags";

const TIMEOUT_MS = 5000;

type Level = "ok" | "warn" | "fail";
const results: { level: Level; msg: string }[] = [];
const ok = (msg: string) => results.push({ level: "ok", msg });
const warn = (msg: string) => results.push({ level: "warn", msg });
const fail = (msg: string) => results.push({ level: "fail", msg });

async function checkRedis(): Promise<void> {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim() || "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim() || "";

  if (!url || !token) {
    warn("Redis (Upstash REST) not configured — in-memory rate limiting + no cache (fail-open OK).");
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(["PING"]),
      signal: controller.signal,
    });
    if (!res.ok) {
      warn(`Redis configured but PING returned HTTP ${res.status} (app fails open).`);
      return;
    }
    const json = (await res.json()) as { result?: unknown };
    if (String(json.result).toUpperCase() === "PONG") {
      ok("Redis (Upstash REST) reachable — PONG.");
    } else {
      warn(`Redis configured; unexpected PING result: ${JSON.stringify(json.result)}.`);
    }
  } catch (e) {
    warn(`Redis configured but unreachable: ${(e as Error).message} (app fails open).`);
  } finally {
    clearTimeout(timer);
  }
}

function checkSentry(): void {
  const server = process.env.SENTRY_DSN?.trim();
  const client = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (server && client) {
    ok("Sentry DSN set for server + browser.");
  } else if (server || client) {
    warn(`Sentry DSN only partially set (${server ? "server" : "browser"} only) — set both.`);
  } else if (isMockMode) {
    ok("Sentry DSN unset (mock mode) — Sentry no-ops.");
  } else {
    warn("Sentry DSN unset — error tracking disabled. Set SENTRY_DSN + NEXT_PUBLIC_SENTRY_DSN.");
  }
}

function checkFlags(): void {
  // Remote (Upstash) overrides apply at runtime; here we report env + defaults.
  const flags = resolveFlags();
  const summary = FEATURE_FLAG_NAMES.map((f) => `${f}=${flags[f] ? "on" : "off"}`).join(", ");
  ok(`Feature flags (env + defaults): ${summary}.`);
}

async function main(): Promise<void> {
  const mode = isMockMode ? "MOCK" : "REAL";
  const env = isVercelProductionDeploy() ? " · vercel-production" : "";
  console.log(`\n  Aether preflight — validating critical configuration`);
  console.log(`  mode: ${mode}${env}\n`);

  // 1. Required env + production safety — the only HARD failure.
  try {
    validateEnv();
    if (isMockMode) {
      ok("Mock mode — production vars not enforced.");
    } else {
      ok(
        `Required env present (${getRequiredEnvVarNames().length} vars) · webhook handler: ${getStripeWebhookHandler()}.`
      );
    }
  } catch (e) {
    fail((e as Error).message);
  }

  // 2-4. Soft checks (fail-open in the running app → warnings here).
  checkSentry();
  await checkRedis();
  checkFlags();

  const icon: Record<Level, string> = { ok: "\u2713", warn: "\u26a0", fail: "\u2717" };
  for (const r of results) console.log(`  ${icon[r.level]} ${r.msg}`);

  const failed = results.filter((r) => r.level === "fail").length;
  const warned = results.filter((r) => r.level === "warn").length;
  console.log(
    `\n  ${failed ? "\u2717 FAILED" : "\u2713 PASSED"} — ${failed} error(s), ${warned} warning(s)\n`
  );
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("preflight crashed:", e);
  process.exit(1);
});
