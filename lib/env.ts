/**
 * Centralized environment configuration for Aether.
 *
 * Production-only: every integration (Supabase, Stripe, Redis, Ayrshare) must be
 * configured. Missing required vars fail clearly at build/startup — there is no
 * mock/demo fallback.
 *
 * Secret placement:
 * - Vercel: app secrets only (no Supabase service role by default)
 * - Supabase Edge Functions: service role + Stripe webhook secrets
 * See docs/SECRETS.md and README § Secret handling.
 */

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

/** Required on Vercel / Next.js in production (always). */
export const REQUIRED_APP_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "CRON_SECRET",
] as const;

/** Only when STRIPE_WEBHOOK_HANDLER=vercel (legacy local testing — forbidden in production). */
export const REQUIRED_VERCEL_WEBHOOK_VARS = [
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

/** @deprecated Use getRequiredEnvVarNames() */
export const REQUIRED_PRODUCTION_VARS = [
  ...REQUIRED_APP_VARS,
  ...REQUIRED_VERCEL_WEBHOOK_VARS,
] as const;

export type RequiredAppVar = (typeof REQUIRED_APP_VARS)[number];

/** Env var names required for the current webhook handler. */
export function getRequiredEnvVarNames(): string[] {
  const required: string[] = [...REQUIRED_APP_VARS];
  if (getStripeWebhookHandler() === "vercel") {
    required.push(...REQUIRED_VERCEL_WEBHOOK_VARS);
  }
  return required;
}

/** True on Vercel Production deploys (not local `next build` or Preview). */
export function isVercelProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/**
 * Blocks unsafe configuration on Vercel Production only.
 */
export function validateProductionSafety(): void {
  if (!isVercelProductionDeploy()) return;

  if (getStripeWebhookHandler() === "vercel") {
    throw new Error(
      "[Aether] STRIPE_WEBHOOK_HANDLER=vercel is forbidden on Vercel Production. " +
        "Use the default (supabase) and deploy supabase/functions/stripe-webhook so " +
        "SUPABASE_SERVICE_ROLE_KEY never enters the Vercel runtime."
    );
  }
}

/**
 * Throws if required variables are missing.
 * STRIPE_WEBHOOK_SECRET and service role are required only for STRIPE_WEBHOOK_HANDLER=vercel.
 */
export function validateEnv(): void {
  validateProductionSafety();

  const required = getRequiredEnvVarNames();
  const missing = required.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `[Aether] Missing required environment variables:\n` +
        missing.map((k) => `  - ${k}`).join("\n") +
        (getStripeWebhookHandler() === "supabase"
          ? `\n\nNote: STRIPE_WEBHOOK_SECRET and SUPABASE_SERVICE_ROLE_KEY belong in ` +
            `Supabase Edge Function secrets (stripe-webhook), not on Vercel, when ` +
            `STRIPE_WEBHOOK_HANDLER=supabase (default).`
          : "")
    );
  }
}

export function getSupabaseUrl(): string {
  if (!supabaseUrl) {
    throw new Error(
      "[Aether] NEXT_PUBLIC_SUPABASE_URL is not set. Configure Supabase before starting the app."
    );
  }
  return supabaseUrl;
}

export function getSupabaseAnonKey(): string {
  if (!supabaseAnonKey) {
    throw new Error(
      "[Aether] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Configure Supabase before starting the app."
    );
  }
  return supabaseAnonKey;
}

/** Public Edge Function URL for Stripe dashboard (when using default handler). */
export function getSupabaseStripeWebhookUrl(): string | null {
  const host = getSupabaseUrl().replace(/\/$/, "");
  return `${host}/functions/v1/stripe-webhook`;
}

/** Whether the Next.js runtime may use the Supabase service role key. */
export function canUseServiceRoleInNextRuntime(): boolean {
  return getStripeWebhookHandler() === "vercel";
}