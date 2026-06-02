import { runPayoutBatch } from "./payout";
import { isMockMode } from "./env";
import { log, errMessage } from "./logger";

/**
 * One-shot payout batch WITHOUT Redis (run with `npm run payouts:once`).
 * Useful for testing and cron-style invocation. In mock mode the Stripe
 * transfer is simulated, but the DB settlement (earnings -> paid, budget
 * reserved -> paid, audit transaction) runs for real against Supabase.
 */
async function main(): Promise<void> {
  log.info("payouts.once.start", { mock: isMockMode });
  // runPayoutBatch emits its own structured summary (payout.batch.done).
  await runPayoutBatch();
  process.exit(0);
}

main().catch((err) => {
  log.error("payouts.once.fatal", { error: errMessage(err) });
  process.exit(1);
});
