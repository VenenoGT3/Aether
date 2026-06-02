import { Worker, type Job } from "bullmq";
import {
  connection,
  viewSyncQueue,
  earningsCalcQueue,
  closeQueues,
} from "./queues";
import {
  fetchTrackingClipIds,
  runViewSyncForClip,
  runEarningsCalc,
} from "./processors";
import { QUEUE_NAMES, JOB_NAMES } from "./types";
import type { SyncClipJob, CalcEarningJob } from "./types";
import {
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

const SCHEDULER_ID = "view-sync-scheduler";

async function startScheduler(): Promise<void> {
  const minutes = getViewSyncIntervalMinutes();
  await viewSyncQueue.upsertJobScheduler(
    SCHEDULER_ID,
    { every: minutes * 60_000 },
    { name: JOB_NAMES.fanOut, data: {} }
  );
  console.log(`[worker] view-sync scheduled every ${minutes}m`);
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
  // Scaffold for Phase 5: settle 'approved' earnings into batched Stripe transfers.
  return new Worker(
    QUEUE_NAMES.payoutBatch,
    async (job: Job) => {
      console.log(`[worker] payout-batch '${job.name}' received (not implemented yet)`);
      return { skipped: true };
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

  await startScheduler();
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
