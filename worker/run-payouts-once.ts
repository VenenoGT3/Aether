import { runPayoutBatch } from "./payout";
import { isMockMode } from "./env";

/**
 * One-shot payout batch WITHOUT Redis (run with `npm run payouts:once`).
 * Useful for testing and cron-style invocation. In mock mode the Stripe
 * transfer is simulated, but the DB settlement (earnings -> paid, budget
 * reserved -> paid, audit transaction) runs for real against Supabase.
 */
async function main(): Promise<void> {
  console.log(`[payouts:once] running one payout batch (mock=${isMockMode})`);
  const summary = await runPayoutBatch();
  console.log("[payouts:once] done:", summary);
  process.exit(0);
}

main().catch((err) => {
  console.error("[payouts:once] fatal:", err);
  process.exit(1);
});
