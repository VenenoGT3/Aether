/**
 * Centralized environment configuration for Aether.
 *
 * Mock mode must be explicit (`AETHER_MOCK_MODE=true`). When off, missing
 * required vars fail at build and server startup.
 *
 * Secret placement:
 * - Vercel: app secrets only (no Supabase service role by default)
 * - Supabase Edge Functions: service role + Stripe webhook secrets
 * See docs/SECRETS.md and README § Secret handling.
 */

const MOCK_FLAG = process.env.AETHER_MOCK_MODE?.trim().toLowerCase();

/** True only when `AETHER_MOCK_MODE=true` (case-insensitive). */
export const isMockMode = MOCK_FLAG === "true";

/** True when `NODE_ENV === "production"`. */
export const isProduction = process.env.NODE_ENV === "production";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

/**
 * Where Stripe webhooks are processed.
 * - `supabase` (default): Edge Function holds service role — not on Vercel
 * - `vercel`: legacy path; requires SUPABASE_SERVICE_ROLE_KEY on Vercel
 */
export type StripeWebhookHandler = "supabase" | "vercel";

export function getStripeWebhookHandler(): StripeWebhookHandler {
  const raw = process.env.STRIPE_WEBHOOK_HANDLER?.trim().toLowerCase();
  return raw === "vercel" ? "vercel" : "supabase";
}

/** Required on Vercel / Next.js when mock mode is off. */
export const REQUIRED_APP_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "CRON_SECRET",
] as const;

/** Only when STRIPE_WEBHOOK_HANDLER=vercel (not recommended for production). */
export const REQUIRED_VERCEL_WEBHOOK_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** @deprecated Use REQUIRED_APP_VARS — kept for tests/docs compatibility */
export const REQUIRED_PRODUCTION_VARS = [
  ...REQUIRED_APP_VARS,
  ...REQUIRED_VERCEL_WEBHOOK_VARS,
] as const;

export type RequiredAppVar = (typeof REQUIRED_APP_VARS)[number];

/**
 * Throws if required variables are missing. No-op in mock mode.
 * Service role is required only when webhooks run on Vercel (`STRIPE_WEBHOOK_HANDLER=vercel`).
 */
export function validateEnv(): void {
  if (isMockMode) return;

  const required: string[] = [...REQUIRED_APP_VARS];

  if (getStripeWebhookHandler() === "vercel") {
    required.push(...REQUIRED_VERCEL_WEBHOOK_VARS);
  }

  const missing = required.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `[Aether] Production mode requires all environment variables.\n` +
        `Set AETHER_MOCK_MODE=true for a local demo, or provide:\n` +
        missing.map((k) => `  - ${k}`).join("\n") +
        (getStripeWebhookHandler() === "supabase"
          ? `\n\nNote: SUPABASE_SERVICE_ROLE_KEY is not required on Vercel when ` +
            `STRIPE_WEBHOOK_HANDLER=supabase (default). Set it in Supabase Edge Function secrets instead.`
          : "")
    );
  }
}

export function getSupabaseUrl(): string {
  if (isMockMode) {
    return supabaseUrl || "https://placeholder-url.supabase.co";
  }
  return supabaseUrl;
}

export function getSupabaseAnonKey(): string {
  if (isMockMode) {
    return supabaseAnonKey || "placeholder-anon-key";
  }
  return supabaseAnonKey;
}

export function getStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (isMockMode) {
    return key || "sk_test_placeholder";
  }
  return key;
}

/** Public Edge Function URL for Stripe dashboard (when using default handler). */
export function getSupabaseStripeWebhookUrl(): string | null {
  const url = getSupabaseUrl();
  if (!url || url.includes("placeholder")) return null;
  const host = url.replace(/\/$/, "");
  return `${host}/functions/v1/stripe-webhook`;
}

/** Whether the Next.js runtime may use the Supabase service role key. */
export function canUseServiceRoleInNextRuntime(): boolean {
  return isMockMode || getStripeWebhookHandler() === "vercel";
}