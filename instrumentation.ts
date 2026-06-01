/**
 * Runs once when the Next.js server starts (dev and production).
 * Fails fast if production env vars are missing while mock mode is off.
 */
export async function register() {
  const { validateEnv } = await import("./lib/env");
  validateEnv();
}