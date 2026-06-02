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
  getViewSyncIntervalMinutes,
  isMockMode,
  shouldSimulateViews,
} from "./env";

/**
 * Worker entrypoint (standalone Node process, run with `npm run worker`).
 *
 * Pipeline:
 *   repeatable fan-out  ->  per-clip view-sync  ->  earnings-calc
 *
 * The view-sync worker handles two job types on one queue: the scheduled
 * 'fan-out' (enqueue one job per tracking clip) and 'sync-clip' (sync a single
 * clip, then enqueue earnings). Keeping fan-out and per-clip work as separate
 * jobs gives us retries/backoff per clip and bounded concurrency against the
 * view provider.
 */

const VIEW_SYNC_SCHEDULER_ID = "view-sync-scheduler";
const PAYOUT_SCHEDULER_ID = "payout-batch-scheduler";

async function startSchedulers(): Promise<void> {
  const syncMinutes = getViewSyncIntervalMinutes();
  await viewSyncQueue.upsertJobScheduler(
    VIEW_SYNC_SCHEDULER_ID,
    { every: syncMinutes * 60_000 },
    { name: JOB_NAMES.fanOut, data: {} }
  );
  console.log(`[worker] view-sync scheduled every ${syncMinutes}m`);

  const payoutMinutes = getPayoutBatchIntervalMinutes();
  await payoutBatchQueue.upsertJobScheduler(
    PAYOUT_SCHEDULER_ID,
    { every: payoutMinutes * 60_000 },
    { name: JOB_NAMES.runPayouts, data: {} }
  );
  console.log(`[worker] payout-batch scheduled every ${payoutMinutes}m`);
}

function startViewSyncWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.viewSync,
    async (job: Job) => {
      if (job.name === JOB_NAMES.fanOut) {
        const clipIds = await fetchTrackingClipIds();
        console.log(`[worker] fan-out: ${clipIds.length} tracking clips`);
        if (clipIds.length > 0) {
          await viewSyncQueue.addBulk(
            clipIds.map((clipId) => ({
              name: JOB_NAMES.syncClip,
              data: { clipId } satisfies SyncClipJob,
              opts: { attempts: 3, backoff: { type: "exponential", delay: 5_000 } },
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
            { attempts: 3, backoff: { type: "exponential", delay: 5_000 } }
          );
        }
        return outcome;
      }

      return { ignored: job.name };
    },
    { connection, concurrency: 5 }
  );
}

function startEarningsWorker(): Worker {
  return new Worker(
    QUEUE_NAMES.earningsCalc,
    async (job: Job) => {
      const { clipId, views } = job.data as CalcEarningJob;
      const amount = await runEarningsCalc(clipId, views);
      return { clipId, amount };
    },
    { connection, concurrency: 3 }
  );
}

function startPayoutWorker(): Worker {
  // Single-instance (concurrency 1) — payout batching must not run in parallel.
  return new Worker(
    QUEUE_NAMES.payoutBatch,
    async (job: Job) => {
      if (job.name === JOB_NAMES.runPayouts) {
        return await runPayoutBatch();
      }
      return { ignored: job.name };
    },
    { connection, concurrency: 1 }
  );
}

async function main(): Promise<void> {
  console.log(
    `[worker] starting (mock=${isMockMode}, simulatedViews=${shouldSimulateViews()})`
  );

  const workers = [
    startViewSyncWorker(),
    startEarningsWorker(),
    startPayoutWorker(),
  ];

  for (const w of workers) {
    w.on("failed", (job: Job | undefined, err: Error) => {
      console.error(`[worker] job ${job?.id} (${job?.name}) failed:`, err.message);
    });
  }

  await startSchedulers();
  console.log("[worker] ready");

  const shutdown = async () => {
    console.log("[worker] shutting down...");
    await Promise.all(workers.map((w) => w.close()));
    await closeQueues();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
