import {
  fetchTrackingClipIds,
  runViewSyncForClip,
  runEarningsCalc,
} from "./processors";
import { getConfiguredViewProviderNames } from "./env";
import { log, errMessage } from "./logger";

/**
 * One-shot runner: executes a single view-sync + earnings cycle WITHOUT Redis.
 * Run with `npm run worker:once`. Ideal for cron-style invocation. Pulls live
 * view counts from configured trusted providers and runs the full
 * views -> snapshots -> earnings flow against Supabase without BullMQ.
 */
async function main(): Promise<void> {
  log.info("once.start", { viewProviders: getConfiguredViewProviderNames() });

  const clipIds = await fetchTrackingClipIds();
  log.info("once.tracking", { clips: clipIds.length });

  let synced = 0;
  let skipped = 0;
  let totalAccrued = 0;

  for (const clipId of clipIds) {
    try {
      const outcome = await runViewSyncForClip(clipId);
      if (outcome.status === "synced") {
        synced++;
        totalAccrued += await runEarningsCalc(
          outcome.clipId,
          outcome.views,
          outcome.source
        );
      } else {
        skipped++;
        log.info("once.skipped", { clipId, status: outcome.status, reason: outcome.reason });
      }
    } catch (err) {
      // Keep the cycle going; one bad clip shouldn't abort the whole run.
      log.error("once.clip_error", { clipId, error: errMessage(err) });
    }
  }

  log.info("once.done", {
    synced,
    skipped,
    total: clipIds.length,
    accrued: totalAccrued.toFixed(2),
  });
  process.exit(0);
}

main().catch((err) => {
  log.error("once.fatal", { error: errMessage(err) });
  process.exit(1);
});
