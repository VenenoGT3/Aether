/**
 * Centralized environment configuration for Aether.
 *
 * Why this matters:
 * - Mock mode must be an explicit opt-in (`AETHER_MOCK_MODE=true`), not inferred from
 *   missing or placeholder API keys. Silent inference hides misconfiguration and
 *   lets broken production deploys appear to "work" in demo mode.
 * - When mock mode is off, missing Supabase/Stripe/cron secrets must fail at startup
 *   so payment and auth bugs surface before users hit them.
 *
 * Usage:
 * - Local UI demo:  AETHER_MOCK_MODE=true  (see .env.example)
 * - Production:     AETHER_MOCK_MODE=false or unset, with all required vars set
 */

const MOCK_FLAG = process.env.AETHER_MOCK_MODE?.trim().toLowerCase();

/**
 * True only when `AETHER_MOCK_MODE=true` (case-insensitive).
 * Any other value — including unset or `false` — means production configuration.
 */
export const isMockMode = MOCK_FLAG === "true";

/** True when `NODE_ENV === "production"` (Next.js/Vercel production runtime). */
export const isProduction = process.env.NODE_ENV === "production";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

/** Required when `isMockMode` is false. Validated by `validateEnv()`. */
export const REQUIRED_PRODUCTION_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "CRON_SECRET",
] as const;

export type RequiredProductionVar = (typeof REQUIRED_PRODUCTION_VARS)[number];

/**
 * Throws if any required production variable is missing or empty.
 * No-op when `isMockMode` is true.
 *
 * Called from `next.config.ts` (build) and `instrumentation.ts` (server startup).
 * Do not invoke from client bundles — server-only secrets are not available in the browser.
 */
export function validateEnv(): void {
  if (isMockMode) return;

  const missing = REQUIRED_PRODUCTION_VARS.filter(
    (key) => !process.env[key]?.trim()
  );

  if (missing.length > 0) {
    throw new Error(
      `[Aether] Production mode requires all environment variables.\n` +
        `Set AETHER_MOCK_MODE=true for a local demo, or provide:\n` +
        missing.map((k) => `  - ${k}`).join("\n")
    );
  }
}

/** Supabase URL for the active mode. Placeholders only when mock mode is explicit. */
export function getSupabaseUrl(): string {
  if (isMockMode) {
    return supabaseUrl || "https://placeholder-url.supabase.co";
  }
  return supabaseUrl;
}

/** Supabase anon key for the active mode. Placeholders only when mock mode is explicit. */
export function getSupabaseAnonKey(): string {
  if (isMockMode) {
    return supabaseAnonKey || "placeholder-anon-key";
  }
  return supabaseAnonKey;
}

/** Stripe secret key; placeholder only in explicit mock mode. */
export function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (isMockMode) {
    return key || "sk_test_placeholder";
  }
  return key;
}