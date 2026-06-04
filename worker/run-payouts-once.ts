import { runPayoutBatch } from "./payout";
import { log, errMessage } from "./logger";

/**
 * One-shot payout batch WITHOUT Redis (run with `npm run payouts:once`).
 * Useful for cron-style invocation. Issues real Stripe transfers
 * (STRIPE_SECRET_KEY required) and runs the DB settlement (earnings -> paid,
 * budget reserved -> paid, audit transaction) against Supabase.
 */
async function main(): Promise<void> {
  log.info("payouts.once.start", {});
  // runPayoutBatch emits its own structured summary (payout.batch.done).
  await runPayoutBatch();
  process.exit(0);
}

main().catch((err) => {
  log.error("payouts.once.fatal", { error: errMessage(err) });
  process.exit(1);
});
