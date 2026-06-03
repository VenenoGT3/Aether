/**
 * Minimal HTTP health endpoint for the worker so container orchestrators
 * (Docker HEALTHCHECK, Kubernetes liveness/readiness, Fly checks) can probe it.
 *
 * The worker is a non-web process, so this is intentionally tiny: no framework,
 * no routing library, no body parsing. Liveness = "the heartbeat loop is still
 * firing" (a hung event loop or dead Redis stops it, going stale → 503).
 *
 *   GET /health | /healthz | /livez  → 200 when ready AND heartbeat is fresh
 *   GET /ready  | /readyz            → 200 only once startup completed
 *   (anything else → 404; non-GET → 405)
 */

import { createServer, type Server } from "node:http";
import { log } from "./logger";

export interface HealthState {
  /** True once workers + schedulers are up. */
  ready: () => boolean;
  /** Epoch ms of the last heartbeat tick. */
  lastHeartbeatAt: () => number;
  /** Heartbeat is considered stale (unhealthy) after this many ms with no tick. */
  heartbeatStaleMs: number;
}

/**
 * Start the health server. Returns the Server (close it on shutdown) or null
 * when disabled (port <= 0). Never throws — a health-port bind failure is logged
 * as an [ALERT] but must not crash the worker.
 */
export function startHealthServer(port: number, state: HealthState): Server | null {
  if (!Number.isFinite(port) || port <= 0) {
    log.info("health.disabled", { note: "WORKER_HEALTH_PORT=0" });
    return null;
  }

  const server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0];

    if (req.method !== "GET") {
      res.writeHead(405, { allow: "GET" }).end();
      return;
    }

    const now = Date.now();
    const stale = now - state.lastHeartbeatAt() > state.heartbeatStaleMs;
    const isReady = state.ready();

    const liveness = url === "/health" || url === "/healthz" || url === "/livez";
    const readiness = url === "/ready" || url === "/readyz";

    if (!liveness && !readiness) {
      res.writeHead(404).end();
      return;
    }

    // Liveness: ready AND heartbeat fresh. Readiness: just startup-complete.
    const ok = readiness ? isReady : isReady && !stale;
    const body = JSON.stringify({
      status: ok ? "ok" : "degraded",
      ready: isReady,
      heartbeatStale: stale,
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
    });
    res.writeHead(ok ? 200 : 503, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(body);
  });

  // A bind failure (port in use) must not take down the worker — the job
  // pipeline can run fine without health probes; surface it loudly instead.
  server.on("error", (err) => {
    log.alert("health.server_error", {
      port,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // Don't keep the event loop alive solely for the health socket during drain.
  server.listen(port, () => log.info("health.listening", { port }));
  server.unref();

  return server;
}
