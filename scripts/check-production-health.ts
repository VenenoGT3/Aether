/**
 * Production health probe for CI/scheduled monitoring.
 *
 * Checks the public Next.js health endpoint and optionally a worker health URL
 * when a deploy exposes one through a private monitor/reverse proxy. Fails the
 * process on unreachable/degraded health so GitHub Actions can notify owners.
 */

type HealthPayload = {
  status?: string;
  timestamp?: string;
  checks?: unknown;
};

const DEFAULT_APP_HEALTH_URL = "https://aether-blue-alpha.vercel.app/api/health";
const TIMEOUT_MS = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 10000);

function envUrl(name: string, fallback?: string): string | null {
  const value = process.env[name]?.trim() || fallback || "";
  return value.length > 0 ? value : null;
}

async function fetchJson(url: string): Promise<{ status: number; body: HealthPayload | null; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const text = await res.text();
    let body: HealthPayload | null = null;
    try {
      body = text ? (JSON.parse(text) as HealthPayload) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body, text };
  } finally {
    clearTimeout(timer);
  }
}

async function check(name: string, url: string): Promise<void> {
  const res = await fetchJson(url);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${name} returned HTTP ${res.status}: ${res.text.slice(0, 240)}`);
  }

  const status = res.body?.status;
  if (status && status !== "ok") {
    throw new Error(`${name} is ${status}: ${JSON.stringify(res.body?.checks ?? {})}`);
  }

  console.log(`${name} ok`, {
    url,
    status: status ?? "http-ok",
    timestamp: res.body?.timestamp ?? null,
  });
}

async function main(): Promise<void> {
  const appHealthUrl = envUrl("AETHER_APP_HEALTH_URL", DEFAULT_APP_HEALTH_URL);
  const workerHealthUrl = envUrl("AETHER_WORKER_HEALTH_URL");

  if (!appHealthUrl) throw new Error("AETHER_APP_HEALTH_URL is empty.");
  await check("app", appHealthUrl);

  if (workerHealthUrl) {
    await check("worker", workerHealthUrl);
  } else {
    console.log("worker skipped", {
      reason: "AETHER_WORKER_HEALTH_URL is not configured; Hetzner binds worker health to localhost.",
    });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
