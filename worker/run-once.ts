import {
  fetchTrackingClipIds,
  runViewSyncForClip,
  runEarningsCalc,
} from "./processors";
import { isMockMode, shouldSimulateViews } from "./env";
import { log, errMessage } from "./logger";

/**
 * One-shot runner: executes a single view-sync + earnings cycle WITHOUT Redis.
 * Run with `npm run worker:once`. Ideal for local testing or cron-style
 * invocation. With AETHER_MOCK_MODE=true it uses simulated view growth, so you
 * can watch the views -> snapshots -> earnings flow end to end against a
 * Supabase project without Ayrshare or BullMQ.
 */
async function main(): Promise<void> {
  log.info("once.start", {
    mock: isMockMode,
    viewProvider: shouldSimulateViews() ? "simulated" : "ayrshare",
  });

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
        totalAccrued += await runEarningsCalc(outcome.clipId, outcome.views);
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
