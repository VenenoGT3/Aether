# Production Monitoring

Aether now has three monitoring layers:

1. **Public app health** — `GET /api/health` returns `status: "ok"` or `"degraded"` with Redis, circuit-breaker, and backpressure state.
2. **Scheduled GitHub health probe** — `.github/workflows/production-monitoring.yml` runs every 15 minutes and fails if the app health endpoint is unreachable or degraded.
3. **Worker alerting** — the Hetzner worker emits structured logs and forwards `[worker][ALERT]` lines to `ALERT_WEBHOOK_URL` when configured.

## Required Production Settings

Set these when credentials are available:

| Where | Variable | Purpose |
| --- | --- | --- |
| Vercel | `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` | Server/browser error tracking. |
| Vercel | `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Source-map upload during production builds. |
| Vercel | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Fleet-wide rate limits, cache, and remote feature flags. |
| Hetzner worker | `ALERT_WEBHOOK_URL` | Sends critical worker alerts to Slack/Discord/PagerDuty-compatible webhook. |
| GitHub Actions secret | `AETHER_WORKER_HEALTH_URL` | Optional worker health URL if exposed through a private monitor/proxy. |
| GitHub Actions variable | `AETHER_APP_HEALTH_URL` | Overrides the default app health endpoint. |

## Current Limitation

The Hetzner worker health port is intentionally bound to `127.0.0.1`, so the scheduled GitHub workflow cannot probe it directly. Verify worker runtime over SSH with:

```bash
ssh -i ~/.ssh/aether_worker_hetzner -o IdentitiesOnly=yes root@167.233.55.6 \
  'systemctl status aether-worker --no-pager -l; curl -fsS http://127.0.0.1:8080/health'
```

If we want external worker uptime checks later, expose `/health` only through a private monitor path or VPN, not directly to the public internet.
