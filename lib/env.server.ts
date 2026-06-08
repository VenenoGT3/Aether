import "server-only";
/**
 * Server-only secrets for the Next.js runtime (Vercel).
 * Never import from Client Components.
 */

export const SERVER_SECRET_NAMES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CRON_SECRET",
  "XAI_API_KEY",
  "SOCIAVAULT_API_KEY",
  "YOUTUBE_DATA_API_KEY",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "AYRSHARE_API_KEY",
  "RESEND_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENABLE_TEST_LOGIN",
  "TEST_LOGIN_ACCESS_CODE",
  "TEST_BRAND_EMAIL",
  "TEST_BRAND_PASSWORD",
  "TEST_CREATOR_EMAIL",
  "TEST_CREATOR_PASSWORD",
] as const;

function requireServerSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  throw new Error(`[Aether] Missing required server secret: ${name}.`);
}

/** Optional secret — never throws (caller decides how to handle absence). */
function optionalServerSecret(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getStripeSecretKey(): string {
  return requireServerSecret("STRIPE_SECRET_KEY");
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
  return requireServerSecret("SUPABASE_SERVICE_ROLE_KEY");
}

export function getStripeWebhookSecret(): string {
  return requireServerSecret("STRIPE_WEBHOOK_SECRET");
}

export function getCronSecret(): string {
  return requireServerSecret("CRON_SECRET");
}

export function getXaiApiKey(): string | undefined {
  return process.env.XAI_API_KEY?.trim() || undefined;
}

export function getXaiModel(): string {
  return process.env.XAI_MODEL?.trim() || "grok-4.3";
}

export function getSociavaultApiKey(): string | undefined {
  return process.env.SOCIAVAULT_API_KEY?.trim() || undefined;
}

export function getYoutubeDataApiKey(): string | undefined {
  return process.env.YOUTUBE_DATA_API_KEY?.trim() || undefined;
}

export function getTiktokClientKey(): string | undefined {
  return process.env.TIKTOK_CLIENT_KEY?.trim() || undefined;
}

export function getTiktokClientSecret(): string | undefined {
  return process.env.TIKTOK_CLIENT_SECRET?.trim() || undefined;
}

export function getAyrshareApiKey(): string | undefined {
  return process.env.AYRSHARE_API_KEY?.trim() || undefined;
}

export function getResendApiKey(): string | undefined {
  return process.env.RESEND_API_KEY?.trim() || undefined;
}

export type TestLoginRole = "business" | "influencer";

export function isTestLoginEnabled(): boolean {
  return process.env.ENABLE_TEST_LOGIN?.trim().toLowerCase() === "true";
}

export function isDeployedRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    !!process.env.VERCEL_ENV ||
    process.env.NODE_ENV === "production"
  );
}

export function getTestLoginAccessCode(): string | undefined {
  return optionalServerSecret("TEST_LOGIN_ACCESS_CODE");
}

export function isTestLoginAccessCodeRequired(): boolean {
  return isDeployedRuntime();
}

export function getAvailableTestLoginRoles(): TestLoginRole[] {
  if (!isTestLoginEnabled()) return [];
  if (isTestLoginAccessCodeRequired() && !getTestLoginAccessCode()) return [];

  const roles: TestLoginRole[] = [];
  if (process.env.TEST_BRAND_EMAIL?.trim() && process.env.TEST_BRAND_PASSWORD?.trim()) {
    roles.push("business");
  }
  if (process.env.TEST_CREATOR_EMAIL?.trim() && process.env.TEST_CREATOR_PASSWORD?.trim()) {
    roles.push("influencer");
  }
  return roles;
}

export function getTestLoginCredentials(
  role: TestLoginRole
): { email: string; password: string } | null {
  if (!isTestLoginEnabled()) return null;

  const emailName = role === "business" ? "TEST_BRAND_EMAIL" : "TEST_CREATOR_EMAIL";
  const passwordName =
    role === "business" ? "TEST_BRAND_PASSWORD" : "TEST_CREATOR_PASSWORD";
  const email = process.env[emailName]?.trim();
  const password = process.env[passwordName]?.trim();

  return email && password ? { email, password } : null;
}
