import {
  fetchTrackingClipIds,
  runViewSyncForClip,
  runEarningsCalc,
} from "./processors";
import { isMockMode, shouldSimulateViews } from "./env";

/**
 * One-shot runner: executes a single view-sync + earnings cycle WITHOUT Redis.
 * Run with `npm run worker:once`. Ideal for local testing or cron-style
 * invocation. With AETHER_MOCK_MODE=true it uses simulated view growth, so you
 * can watch the views -> snapshots -> earnings flow end to end against a
 * Supabase project without Ayrshare or BullMQ.
 */
async function main(): Promise<void> {
  console.log(
    `[worker:once] one sync cycle (mock=${isMockMode}, simulatedViews=${shouldSimulateViews()})`
  );

  const clipIds = await fetchTrackingClipIds();
  console.log(`[worker:once] ${clipIds.length} tracking clips`);

  let synced = 0;
  let totalAccrued = 0;

  for (const clipId of clipIds) {
    const outcome = await runViewSyncForClip(clipId);
    if (outcome.status === "synced") {
      synced++;
      totalAccrued += await runEarningsCalc(outcome.clipId, outcome.views);
    } else {
      console.log(`[worker:once] clip ${clipId}: ${outcome.status} (${outcome.reason})`);
    }
  }

  console.log(
    `[worker:once] done — synced ${synced}/${clipIds.length}, accrued $${totalAccrued.toFixed(2)}`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[worker:once] fatal:", err);
  process.exit(1);
});
