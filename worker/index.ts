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
  allowSimulatedPayoutsInRealMode,
  getHeartbeatIntervalMinutes,
  getPayoutBatchIntervalMinutes,
  getPoolReconciliationIntervalMinutes,
  getProviderErrorAlertThreshold,
  getViewSyncBatchSize,
  getViewSyncIntervalMinutes,
  isMockMode,
  isRealModeSimulatingViews,
  shouldSimulateViews,
  validateWorkerEnv,
} from "./env";
import { log, errMessage } from "./logger";
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
                opts: { ...CLIP_RETRY },
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
              { clipId: outcome.clipId, views: outcome.views } satisfies CalcEarningJob,
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
      const { clipId, views } = job.data as CalcEarningJob;
      try {
        const amount = await runEarningsCalc(clipId, views);
        return { clipId, amount };
      } catch (err) {
        log.error("earnings.error", {
          jobId: job.id,
          clipId,
          views,
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
  budget_reserved: number | null;
  budget_paid: number | null;
}

// Campaigns we've already alerted on, so we don't re-page every heartbeat.
// Cleared per-campaign when its pool is topped back up.
const exhaustedPoolAlerts = new Set<string>();

/** Scan active performance campaigns for an exhausted budget pool and alert once. */
async function scanPoolExhaustion(): Promise<void> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, title, budget_pool, budget_reserved, budget_paid")
    .eq("campaign_type", "performance")
    .in("status", ["open", "in_progress"]);
  if (error) {
    log.warn("heartbeat.pool_scan_error", { error: error.message });
    return;
  }
  for (const c of (data ?? []) as PoolRow[]) {
    const remaining =
      Number(c.budget_pool || 0) - Number(c.budget_reserved || 0) - Number(c.budget_paid || 0);
    if (remaining <= 0) {
      if (!exhaustedPoolAlerts.has(c.id)) {
        exhaustedPoolAlerts.add(c.id);
        log.alert("campaign.pool_exhausted", {
          campaignId: c.id,
          title: c.title,
          pool: c.budget_pool,
          reserved: c.budget_reserved,
          paid: c.budget_paid,
        });
      }
    } else {
      exhaustedPoolAlerts.delete(c.id); // topped up → re-arm the alert
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

    const provThreshold = getProviderErrorAlertThreshold();
    if (w.providerErrors >= provThreshold) {
      log.alert("views.provider.repeated_errors", {
        errors: w.providerErrors,
        threshold: provThreshold,
        windowMin: getHeartbeatIntervalMinutes(),
      });
    }

    // Keep paging while the worker is in the dangerous real-mode-simulated state.
    if (isRealModeSimulatingViews()) {
      log.alert("simulated_views_in_real_mode", {
        earningsBlocked: !allowSimulatedPayoutsInRealMode(),
        overrideEnabled: allowSimulatedPayoutsInRealMode(),
      });
    }

    await scanPoolExhaustion();
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
  log.info("env.validated", { mode: isMockMode ? "mock" : "real" });

  log.info("startup", {
    mock: isMockMode,
    viewProvider: shouldSimulateViews() ? "simulated" : "ayrshare",
    viewSyncEveryMin: getViewSyncIntervalMinutes(),
    payoutEveryMin: getPayoutBatchIntervalMinutes(),
    batchSize: getViewSyncBatchSize(),
    nodeVersion: process.version,
    pid: process.pid,
  });

  // Loud startup alert for the dangerous real-mode-with-simulated-views state.
  if (isRealModeSimulatingViews()) {
    if (allowSimulatedPayoutsInRealMode()) {
      log.alert("startup.simulated_payouts_override", {
        note: "REAL mode + SIMULATED views, but ALLOW_SIMULATED_PAYOUTS_IN_REAL_MODE=true — real money may move on simulated views. Use for testing only.",
      });
    } else {
      log.alert("startup.simulated_views_guard", {
        note: "REAL mode + SIMULATED views (no AYRSHARE_API_KEY) — earnings accrual and payouts are BLOCKED. Set AYRSHARE_API_KEY for real views, or ALLOW_SIMULATED_PAYOUTS_IN_REAL_MODE=true to override (testing only).",
      });
    }
  }

  const workers: Array<[Worker, string]> = [
    [startViewSyncWorker(), QUEUE_NAMES.viewSync],
    [startEarningsWorker(), QUEUE_NAMES.earningsCalc],
    [startPayoutWorker(), QUEUE_NAMES.payoutBatch],
    [startReconcileWorker(), QUEUE_NAMES.poolReconcile],
  ];
  workers.forEach(([w, q]) => attachListeners(w, q));

  await startSchedulers();

  // Heartbeat: one shortly after startup, then on a fixed interval.
  const heartbeatMs = getHeartbeatIntervalMinutes() * 60_000;
  void emitHeartbeat();
  const heartbeatTimer = setInterval(() => void emitHeartbeat(), heartbeatMs);
  log.info("ready", { heartbeatEveryMin: getHeartbeatIntervalMinutes() });

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
    log.info("shutdown.begin", { signal });
    clearInterval(heartbeatTimer);

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
