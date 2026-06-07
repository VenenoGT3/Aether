# syntax=docker/dockerfile:1
#
# Aether background worker (BullMQ schedulers + view-sync / earnings / payouts /
# pool-reconcile). This is the standalone Node process — NOT the Next.js app.
# Runs TypeScript directly with tsx (no separate build step).
#
# Build & run:
#   docker build -t aether-worker .
#   docker run --env-file .env -p 8080:8080 aether-worker
#
# Or use docker-compose.yml (worker + Redis) for local testing.
# Deployed in production on a Hetzner VPS — see PRODUCTION-README.md.

# ---- deps: install production dependencies only ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Omit dev deps (eslint, vitest, typescript, tailwind…). tsx + bullmq + supabase
# + stripe are production deps, so the worker has everything it needs.
RUN npm ci --omit=dev --no-audit --no-fund

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

LABEL org.opencontainers.image.title="aether-worker" \
      org.opencontainers.image.description="Aether background worker (BullMQ view-sync, earnings, payouts, fraud)" \
      org.opencontainers.image.source="https://github.com/VenenoGT3/Aether"

ENV NODE_ENV=production
# Health endpoint port (Docker/k8s/Fly probes). Overridable at runtime;
# set WORKER_HEALTH_PORT=0 to disable the server on platforms with no probes.
ENV WORKER_HEALTH_PORT=8080

# tini = PID 1 init: reaps zombies and forwards SIGTERM/SIGINT so the worker's
# graceful-shutdown handler actually runs on `docker stop` / platform redeploys.
RUN apk add --no-cache tini

# Run as an unprivileged user.
RUN addgroup -S aether && adduser -S aether -G aether

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY worker ./worker
COPY lib/social-post.ts ./lib/social-post.ts

USER aether

EXPOSE 8080
# busybox wget (bundled in alpine). start-period covers schedulers/Redis connect.
# Uses ${WORKER_HEALTH_PORT} so the probe follows the configured port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O- "http://127.0.0.1:${WORKER_HEALTH_PORT}/health" >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
# Invoke tsx directly (not via npm) so signals reach the Node process cleanly.
CMD ["node_modules/.bin/tsx", "worker/index.ts"]
