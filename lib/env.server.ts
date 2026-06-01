import "server-only";
import { isMockMode } from "@/lib/env";

/**
 * Server-only secrets. Never import this module from Client Components or
 * files that may be bundled for the browser.
 */

function requireServerSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isMockMode) return "";
  throw new Error(
    `[Aether] Missing server secret: ${name}. Required outside AETHER_MOCK_MODE.`
  );
}

export function getServiceRoleKey(): string {
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

export function getResendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}