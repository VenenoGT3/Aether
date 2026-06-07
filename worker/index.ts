import { Worker, type Job } from "bullmq";
import {
  connection,
  viewSyncQueue,
  earningsCalcQueue,
  payoutBatchQueue,
  poolReconcileQueue,
  closeQueues,
} from "./queues";
import {
  autoApproveOverdueClips,
  auditCampaignBudgetDrift,
  auditPayoutRevenueDrift,
  auditClipQualityInvariants,
  runFraudForensics,
  fetchTrackingClipIds,
  runViewSyncForClip,
  runEarningsCalc,
} from "./processors";
import { runPayoutBatch } from "./payout";
import { runPoolFundingReconciliation } from "./reconcile";
import { getServiceClient } from "./supabase";
import { QUEUE_NAMES, JOB_NAMES } from "./types";
import type { SyncClipJob, CalcEarningJob } from "./types";
import {
  getHeartbeatIntervalMinutes,
  getPayoutBatchIntervalMinutes,
  getPoolReconciliationIntervalMinutes,
  getProviderErrorAlertThreshold,
  getFraudDisqualifyRateAlertThreshold,
  getFraudRepeatOffenderMinEvents,
  getConfiguredViewProviderNames,
  getHealthPort,
  getViewSyncBatchSize,
  getViewSyncIntervalMinutes,
  validateWorkerEnv,
} from "./env";
import { randomUUID } from "node:crypto";
import { log, errMessage } from "./logger";
import { startHealthServer } from "./health";
import {
  recordCompleted,
  recordExhausted,
  recordFailed,
  takeWindow,
  totals,
} from "./metrics";

/**
 * Worker entrypoint (standalone Node process, run with `npm run worker`).
 *
 * Pipeline:  repeatable fan-out  ->  per-clip view-sync  ->  earnings-calc
 *
 * Error handling: each job processor is wrapped so failures are logged with
 * context (job id, name, clip id, attempt) and then RE-THROWN, which lets BullMQ
 * apply the configured retry/backoff. A single job failure never crashes the
 * process (BullMQ isolates it); process-level guards below catch the rest.
 */

const VIEW_SYNC_SCHEDULER_ID = "view-sync-scheduler";
const PAYOUT_SCHEDULER_ID = "payout-batch-scheduler";
const POOL_RECONCILE_SCHEDULER_ID = "pool-reconcile-scheduler";
const CLIP_RETRY = { attempts: 3, backoff: { type: "exponential", delay: 5_000 } } as const;

// Per-process identity (multi-instance). Used for the audit-leader lock value.
const INSTANCE_ID = randomUUID();
const AUDIT_LEADER_KEY = "aether:worker:audit-leader";

// Liveness state surfaced by the health server.
let workerReady = false;
let lastHeartbeatAt = Date.now();

/**
 * Fleet-wide audit leadership: only ONE instance runs the heavy per-tick audits
 * (pool scan + budget/revenue/quality/fraud forensics) so N instances don't run
 * them N times and emit N duplicate [ALERT]s. Uses a Redis SET NX PX lease via
 * BullMQ's own client (no extra Redis dependency). TTL < heartbeat interval so it
 * auto-expires before the next tick (any instance can win next time; a dead
 * leader never wedges the lock). The audits are also SKIP-LOCKED-safe in SQL, so
 * this lease is a load/noise optimization, not a correctness dependency.
 */
async function tryAcquireAuditLeadership(ttlMs: number): Promise<boolean> {
  try {
    const client = (await viewSyncQueue.client) as unknown as {
      set(
        key: string,
        value: string,
        mode: "PX",
        ttl: number,
        nx: "NX"
      ): Promise<string | null>;
    };
    const res = await client.set(AUDIT_LEADER_KEY, INSTANCE_ID, "PX", Math.max(ttlMs, 1000), "NX");
    return res === "OK";
  } catch (err) {
    // On a Redis hiccup, skip audits this tick (next tick / another instance covers it).
    log.warn("heartbeat.leader_lock_error", { error: errMessage(err) });
    return false;
  }
}

async function startSchedulers(): Promise<void> {
  const syncMinutes = getViewSyncIntervalMinutes();
  await viewSyncQueue.upsertJobScheduler(
    VIEW_SYNC_SCHEDULER_ID,
    { every: syncMinutes * 60_000 },
    { name: JOB_NAMES.fanOut, data: {} }
  );
  const payoutMinutes = getPayoutBatchIntervalMinutes();
  await payoutBatchQueue.upsertJobScheduler(
    PAYOUT_SCHEDULER_ID,
    { every: payoutMinutes * 60_000 },
    { name: JOB_NAMES.runPayouts, data: {} }
  );
  const reconcileMinutes = getPoolReconciliationIntervalMinutes();
  await poolReconcileQueue.upsertJobScheduler(
    POOL_RECONCILE_SCHEDULER_ID,
    { every: reconcileMinutes * 60_000 },
    { name: JOB_NAMES.reconcileFunding, data: {} }
  );
  log.info("schedulers.ready", {
    viewSyncEveryMin: syncMinutes,
    payoutEveryMin: payoutMinutes,
    reconcileEveryMin: reconcileMinutes,
  });
}

function startViewSyncWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.viewSync,
    async (job: Job) => {
      const attempt = job.attemptsMade + 1;
      try {
        if (job.name === JOB_NAMES.fanOut) {
          // Auto-approve clips whose review window lapsed (best-effort — never
          // block view-sync if the sweep fails).
          let autoApproved = 0;
          try {
            autoApproved = await autoApproveOverdueClips();
          } catch (err) {
            log.error("approval.sweep_error", { jobId: job.id, error: errMessage(err) });
          }
          const clipIds = await fetchTrackingClipIds();
          log.info("viewsync.fanout", { jobId: job.id, autoApproved, clips: clipIds.length });
          if (clipIds.length > 0) {
            await viewSyncQueue.addBulk(
              clipIds.map((clipId) => ({
                name: JOB_NAMES.syncClip,
                data: { clipId } satisfies SyncClipJob,
                opts: {
                  ...CLIP_RETRY,
                  // Per-clip dedup: while a sync for this clip is queued / active /
                  // awaiting a retry, an OVERLAPPING fan-out (slow provider, backlog,
                  // concurrency) cannot enqueue a second CONCURRENT sync of the same
                  // clip. Two concurrent syncs would insert near-simultaneous
                  // view_snapshots and corrupt the fraud trend/uniformity (CV/spike)
                  // signals. Retries reuse this id (they serialize), and the id frees
                  // on terminal state so the next fan-out re-syncs normally.
                  jobId: `${JOB_NAMES.syncClip}:${clipId}`,
                  removeOnComplete: true,
                  removeOnFail: true,
                },
              }))
            );
          }
          return { fannedOut: clipIds.length };
        }

        if (job.name === JOB_NAMES.syncClip) {
          const { clipId } = job.data as SyncClipJob;
          const outcome = await runViewSyncForClip(clipId);
          if (outcome.status === "synced") {
            await earningsCalcQueue.add(
              JOB_NAMES.calcEarning,
              {
                clipId: outcome.clipId,
                views: outcome.views,
                source: outcome.source,
              } satisfies CalcEarningJob,
              { ...CLIP_RETRY }
            );
          }
          log.debug("viewsync.clip", { jobId: job.id, clipId, status: outcome.status });
          return outcome;
        }

        return { ignored: job.name };
      } catch (err) {
        log.error("viewsync.error", {
          jobId: job.id,
          name: job.name,
          clipId: (job.data as Partial<SyncClipJob>)?.clipId,
          attempt,
          error: errMessage(err),
        });
        throw err; // rethrow → BullMQ retries per CLIP_RETRY, then marks failed
      }
    },
    { connection, concurrency: 5 }
  );
}

function startEarningsWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.earningsCalc,
    async (job: Job) => {
      const { clipId, views, source } = job.data as CalcEarningJob;
      try {
        const amount = await runEarningsCalc(clipId, views, source);
        return { clipId, amount };
      } catch (err) {
        log.error("earnings.error", {
          jobId: job.id,
          clipId,
          views,
          source,
          attempt: job.attemptsMade + 1,
          error: errMessage(err),
        });
        throw err;
      }
    },
    { connection, concurrency: 3 }
  );
}

function startPayoutWorker(): Worker {
  // Single-instance (concurrency 1) — payout batching must not run in parallel.
  return new Worker(
    QUEUE_NAMES.payoutBatch,
    async (job: Job) => {
      if (job.name !== JOB_NAMES.runPayouts) return { ignored: job.name };
      try {
        return await runPayoutBatch();
      } catch (err) {
        log.error("payout.batch.error", {
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          error: errMessage(err),
        });
        throw err;
      }
    },
    { connection, concurrency: 1 }
  );
}

function startReconcileWorker(): Worker {
  // Single-instance — recovers performance campaigns stuck in 'draft' after a
  // missed/delayed pool-funding webhook. Idempotent; safe to run repeatedly.
  return new Worker(
    QUEUE_NAMES.poolReconcile,
    async (job: Job) => {
      if (job.name !== JOB_NAMES.reconcileFunding) return { ignored: job.name };
      try {
        return await runPoolFundingReconciliation();
      } catch (err) {
        log.error("reconcile.error", {
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          error: errMessage(err),
        });
        throw err;
      }
    },
    { connection, concurrency: 1 }
  );
}

function attachListeners(worker: Worker, queue: string): void {
  worker.on("failed", (job, err) => {
    const attempt = job?.attemptsMade ?? 0;
    const max = (job?.opts?.attempts as number | undefined) ?? 1;
    const exhausted = attempt >= max;
    recordFailed();
    log.warn("job.failed", {
      queue,
      jobId: job?.id,
      name: job?.name,
      attempt,
      maxAttempts: max,
      willRetry: !exhausted,
      error: err.message,
    });
    // Exhausted all retries → critical. This is the "failed more than X times"
    // alert; nothing else will retry it automatically.
    if (exhausted) {
      recordExhausted();
      log.alert("job.exhausted", {
        queue,
        jobId: job?.id,
        name: job?.name,
        attempts: attempt,
        clipId: (job?.data as { clipId?: string } | undefined)?.clipId,
        error: err.message,
      });
    }
  });
  worker.on("completed", (job) => {
    recordCompleted();
    log.debug("job.completed", { queue, jobId: job.id, name: job.name });
  });
  worker.on("error", (err) => {
    log.error("worker.error", { queue, error: errMessage(err) });
  });
}

interface PoolRow {
  id: string;
  title: string;
  budget_pool: number | null;
  available_pool: number | null;
  budget_reserved: number | null;
  budget_paid: number | null;
}

// Campaigns we've already alerted on, so we don't re-page every heartbeat.
// Cleared per-campaign when its pool is topped back up.
const exhaustedPoolAlerts = new Set<string>();

/** Close campaigns at 100% pool + emit monitoring alerts (available_pool-aware). */
async function scanPoolExhaustion(): Promise<void> {
  const supabase = getServiceClient();
  const traceId = crypto.randomUUID();

  const { data: closed, error: reconcileErr } = await supabase.rpc(
    "reconcile_exhausted_performance_campaigns",
    { p_trace_id: traceId }
  );
  if (reconcileErr) {
    log.alert("heartbeat.reconcile_exhausted_failed", {
      traceId,
      error: reconcileErr.message,
    });
  } else if (typeof closed === "number" && closed > 0) {
    log.info("heartbeat.reconcile_exhausted", { traceId, closed });
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, title, budget_pool, available_pool, budget_reserved, budget_paid")
    .eq("campaign_type", "performance")
    .in("status", ["open", "in_progress"]);
  if (error) {
    log.warn("heartbeat.pool_scan_error", { error: error.message });
    return;
  }
  for (const c of (data ?? []) as PoolRow[]) {
    const pool =
      c.available_pool != null ? Number(c.available_pool) : Number(c.budget_pool || 0);
    const remaining =
      pool - Number(c.budget_reserved || 0) - Number(c.budget_paid || 0);
    if (remaining <= 0.005) {
      if (!exhaustedPoolAlerts.has(c.id)) {
        exhaustedPoolAlerts.add(c.id);
        log.alert("campaign.pool_exhausted", {
          traceId,
          campaignId: c.id,
          title: c.title,
          pool,
          availablePool: c.available_pool,
          reserved: c.budget_reserved,
          paid: c.budget_paid,
        });
      }
    } else {
      exhaustedPoolAlerts.delete(c.id);
    }
  }
}

/**
 * Periodic "worker is alive" beat: queue depths + the counters accrued since the
 * last beat, plus the threshold-based alerts (repeated provider errors, pool
 * exhaustion). Failures here are logged, never thrown — the beat must not die.
 */
async function emitHeartbeat(): Promise<void> {
  try {
    const [vs, ec, pb, pr] = await Promise.all([
      viewSyncQueue.getJobCounts(),
      earningsCalcQueue.getJobCounts(),
      payoutBatchQueue.getJobCounts(),
      poolReconcileQueue.getJobCounts(),
    ]);
    const w = takeWindow();
    const t = totals();
    const depth = (c: Record<string, number>) =>
      `${c.waiting ?? 0}w/${c.active ?? 0}a/${c.delayed ?? 0}d/${c.failed ?? 0}f`;
    log.info("heartbeat", {
      uptimeSec: t.uptimeSec,
      // Activity since the previous heartbeat.
      completed: w.jobsCompleted,
      failed: w.jobsFailed,
      exhausted: w.jobsExhausted,
      providerErrors: w.providerErrors,
      // Queue depths (waiting/active/delayed/failed).
      viewSync: depth(vs),
      earnings: depth(ec),
      payout: depth(pb),
      reconcile: depth(pr),
    });

    // Mark this instance live for the health probe (per-instance liveness).
    lastHeartbeatAt = Date.now();

    const provThreshold = getProviderErrorAlertThreshold();
    if (w.providerErrors >= provThreshold) {
      log.alert("views.provider.repeated_errors", {
        errors: w.providerErrors,
        threshold: provThreshold,
        windowMin: getHeartbeatIntervalMinutes(),
      });
    }

    // Fleet-wide work runs on ONE instance per tick (see tryAcquireAuditLeadership).
    // The per-instance heartbeat LOG above already ran on every instance.
    const heartbeatMs = getHeartbeatIntervalMinutes() * 60_000;
    const isAuditLeader = await tryAcquireAuditLeadership(Math.floor(heartbeatMs * 0.8));
    if (!isAuditLeader) {
      log.debug("heartbeat.audit_skip_not_leader", {});
      return;
    }

    await scanPoolExhaustion();

    // Financial-integrity drift checks: rollups vs. the earnings ledger, and
    // settled payouts vs. the platform_revenue ledger. Each RPC raises [ALERT]
    // per offending row; this surfaces counts in the beat. Best-effort.
    try {
      const client = getServiceClient();
      const [budgetDrift, revenueDrift, qualityViolations, fraud] = await Promise.all([
        auditCampaignBudgetDrift(client),
        auditPayoutRevenueDrift(client),
        auditClipQualityInvariants(client),
        runFraudForensics(
          {
            repeatOffenderMinEvents: getFraudRepeatOffenderMinEvents(),
            disqualifyRateThreshold: getFraudDisqualifyRateAlertThreshold(),
            windowMinutes: getHeartbeatIntervalMinutes(),
          },
          client
        ),
      ]);
      if (budgetDrift > 0) log.alert("heartbeat.budget_drift", { drifted: budgetDrift });
      if (revenueDrift > 0) log.alert("heartbeat.revenue_drift", { drifted: revenueDrift });
      if (qualityViolations > 0)
        log.alert("heartbeat.quality_invariant", { violations: qualityViolations });
      if (fraud.reversalFailures > 0)
        log.alert("heartbeat.fraud_reversal_failure", { count: fraud.reversalFailures });
      if (fraud.repeatOffenders > 0)
        log.alert("heartbeat.fraud_repeat_offenders", { count: fraud.repeatOffenders });
    } catch (err) {
      log.warn("heartbeat.drift_audit_error", { error: errMessage(err) });
    }
  } catch (err) {
    log.error("heartbeat.error", { error: errMessage(err) });
  }
}

async function main(): Promise<void> {
  // Fail fast on a misconfigured environment, with a clear message per problem.
  const env = validateWorkerEnv();
  env.warnings.forEach((note) => log.warn("env.warning", { note }));
  if (env.errors.length > 0) {
    env.errors.forEach((note) => log.alert("env.invalid", { note }));
    throw new Error(`Worker environment invalid: ${env.errors.join(" | ")}`);
  }
  log.info("env.validated", {});

  log.info("startup", {
    viewProviders: getConfiguredViewProviderNames(),
    viewSyncEveryMin: getViewSyncIntervalMinutes(),
    payoutEveryMin: getPayoutBatchIntervalMinutes(),
    batchSize: getViewSyncBatchSize(),
    nodeVersion: process.version,
    pid: process.pid,
  });

  // Health endpoint first, so orchestrator probes get a (not-yet-ready) response
  // immediately instead of connection-refused during startup.
  const heartbeatMs = getHeartbeatIntervalMinutes() * 60_000;
  const healthServer = startHealthServer(getHealthPort(), {
    ready: () => workerReady,
    lastHeartbeatAt: () => lastHeartbeatAt,
    // Allow ~3 missed beats before reporting stale (hung loop / dead Redis).
    heartbeatStaleMs: heartbeatMs * 3,
  });

  const workers: Array<[Worker, string]> = [
    [startViewSyncWorker(), QUEUE_NAMES.viewSync],
    [startEarningsWorker(), QUEUE_NAMES.earningsCalc],
    [startPayoutWorker(), QUEUE_NAMES.payoutBatch],
    [startReconcileWorker(), QUEUE_NAMES.poolReconcile],
  ];
  workers.forEach(([w, q]) => attachListeners(w, q));

  await startSchedulers();

  // Heartbeat: one shortly after startup, then on a fixed interval.
  void emitHeartbeat();
  const heartbeatTimer = setInterval(() => void emitHeartbeat(), heartbeatMs);
  workerReady = true;
  log.info("ready", {
    instanceId: INSTANCE_ID,
    heartbeatEveryMin: getHeartbeatIntervalMinutes(),
    healthPort: getHealthPort() || "disabled",
  });

  // Graceful shutdown: stop the heartbeat, drain in-flight jobs, close Redis.
  // Guards against a second signal, and force-exits if a close hangs so the
  // platform's stop timeout doesn't SIGKILL us mid-write.
  let shuttingDown = false;
  const SHUTDOWN_TIMEOUT_MS = 15_000;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      log.warn("shutdown.repeat_signal", { signal });
      return;
    }
    shuttingDown = true;
    workerReady = false; // readiness probe → 503 so the LB stops routing immediately
    log.info("shutdown.begin", { signal });
    clearInterval(heartbeatTimer);
    healthServer?.close();

    const force = setTimeout(() => {
      log.alert("shutdown.forced", { note: "graceful close timed out", timeoutMs: SHUTDOWN_TIMEOUT_MS });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    try {
      await Promise.all(workers.map(([w]) => w.close()));
      await closeQueues();
      clearTimeout(force);
      log.info("shutdown.done", { signal });
      process.exit(0);
    } catch (err) {
      clearTimeout(force);
      log.error("shutdown.error", { signal, error: errMessage(err) });
      process.exit(1);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

// Process-level safety nets: log rather than die silently.
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", { error: errMessage(reason) });
});
process.on("uncaughtException", (err) => {
  log.error("uncaughtException", { error: errMessage(err) });
  process.exit(1);
});

main().catch((err) => {
  log.error("fatal", { error: errMessage(err) });
  process.exit(1);
});
