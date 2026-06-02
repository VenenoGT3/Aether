import { Worker, type Job } from "bullmq";
import {
  connection,
  viewSyncQueue,
  earningsCalcQueue,
  payoutBatchQueue,
  closeQueues,
} from "./queues";
import {
  fetchTrackingClipIds,
  runViewSyncForClip,
  runEarningsCalc,
} from "./processors";
import { runPayoutBatch } from "./payout";
import { QUEUE_NAMES, JOB_NAMES } from "./types";
import type { SyncClipJob, CalcEarningJob } from "./types";
import {
  getPayoutBatchIntervalMinutes,
  getViewSyncBatchSize,
  getViewSyncIntervalMinutes,
  isMockMode,
  shouldSimulateViews,
} from "./env";
import { log, errMessage } from "./logger";

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
  log.info("schedulers.ready", {
    viewSyncEveryMin: syncMinutes,
    payoutEveryMin: payoutMinutes,
  });
}

function startViewSyncWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.viewSync,
    async (job: Job) => {
      const attempt = job.attemptsMade + 1;
      try {
        if (job.name === JOB_NAMES.fanOut) {
          const clipIds = await fetchTrackingClipIds();
          log.info("viewsync.fanout", { jobId: job.id, clips: clipIds.length });
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

function attachListeners(worker: Worker, queue: string): void {
  worker.on("failed", (job, err) => {
    const attempt = job?.attemptsMade ?? 0;
    const max = (job?.opts?.attempts as number | undefined) ?? 1;
    log.warn("job.failed", {
      queue,
      jobId: job?.id,
      name: job?.name,
      attempt,
      maxAttempts: max,
      willRetry: attempt < max,
      error: err.message,
    });
  });
  worker.on("completed", (job) => {
    log.debug("job.completed", { queue, jobId: job.id, name: job.name });
  });
  worker.on("error", (err) => {
    log.error("worker.error", { queue, error: errMessage(err) });
  });
}

async function main(): Promise<void> {
  log.info("startup", {
    mock: isMockMode,
    viewProvider: shouldSimulateViews() ? "simulated" : "ayrshare",
    viewSyncEveryMin: getViewSyncIntervalMinutes(),
    payoutEveryMin: getPayoutBatchIntervalMinutes(),
    batchSize: getViewSyncBatchSize(),
  });

  const workers: Array<[Worker, string]> = [
    [startViewSyncWorker(), QUEUE_NAMES.viewSync],
    [startEarningsWorker(), QUEUE_NAMES.earningsCalc],
    [startPayoutWorker(), QUEUE_NAMES.payoutBatch],
  ];
  workers.forEach(([w, q]) => attachListeners(w, q));

  await startSchedulers();
  log.info("ready");

  const shutdown = async () => {
    log.info("shutdown.begin");
    await Promise.all(workers.map(([w]) => w.close()));
    await closeQueues();
    log.info("shutdown.done");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
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
