import "server-only";
import { isMockMode, canUseServiceRoleInNextRuntime } from "@/lib/env";

/**
 * Server-only secrets for the Next.js runtime (Vercel).
 * Never import from Client Components.
 *
 * Supabase service role lives in Supabase Edge Function secrets by default —
 * not in the Vercel app unless STRIPE_WEBHOOK_HANDLER=vercel.
 */

export const SERVER_SECRET_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CRON_SECRET",
  "GEMINI_API_KEY",
  "SOCIAVAULT_API_KEY",
  "AYRSHARE_API_KEY",
  "RESEND_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

function requireServerSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isMockMode) return "";
  throw new Error(
    `[Aether] Missing server secret: ${name}. Required outside AETHER_MOCK_MODE.`
  );
}

/** Optional secret for mock/local paths — never throws. */
function optionalServerSecret(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getStripeSecretKey(): string {
  const key = requireServerSecret("STRIPE_SECRET_KEY");
  if (isMockMode) {
    return key || "sk_test_placeholder";
  }
  return key;
}

export function getOptionalCronSecret(): string | undefined {
  return optionalServerSecret("CRON_SECRET");
}

export function getOptionalStripeWebhookSecret(): string | undefined {
  return optionalServerSecret("STRIPE_WEBHOOK_SECRET");
}

export function getOptionalServiceRoleKey(): string | undefined {
  return optionalServerSecret("SUPABASE_SERVICE_ROLE_KEY");
}

export function getServiceRoleKey(): string {
  if (!canUseServiceRoleInNextRuntime()) {
    throw new Error(
      "[Aether] SUPABASE_SERVICE_ROLE_KEY is not available in the Next.js runtime. " +
        "Use STRIPE_WEBHOOK_HANDLER=supabase (default) and deploy supabase/functions/stripe-webhook. " +
        "Set STRIPE_WEBHOOK_HANDLER=vercel only for local legacy testing."
    );
  }
  return requireServerSecret("SUPABASE_SERVICE_ROLE_KEY");
}

export function getStripeWebhookSecret(): string {
  return requireServerSecret("STRIPE_WEBHOOK_SECRET");
}

export function getCronSecret(): string {
  return requireServerSecret("CRON_SECRET");
}

export function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

export function getSociavaultApiKey(): string | undefined {
  return process.env.SOCIAVAULT_API_KEY?.trim() || undefined;
}

export function getAyrshareApiKey(): string | undefined {
  return process.env.AYRSHARE_API_KEY?.trim() || undefined;
}

export function getResendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}