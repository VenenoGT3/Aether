/**
 * Centralized environment configuration for Aether.
 * Set AETHER_MOCK_MODE=true for local demo without Supabase/Stripe.
 */

const EXPLICIT_MOCK = process.env.AETHER_MOCK_MODE === "true";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

/** Legacy heuristic when AETHER_MOCK_MODE is not explicitly set to false */
function hasPlaceholderCredentials(): boolean {
  return (
    !supabaseUrl ||
    !supabaseAnonKey ||
    supabaseUrl.includes("placeholder-url") ||
    supabaseUrl.includes("your-project-id") ||
    supabaseAnonKey.includes("placeholder-anon-key") ||
    supabaseAnonKey.startsWith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9")
  );
}

export const isMockMode =
  EXPLICIT_MOCK ||
  (process.env.AETHER_MOCK_MODE !== "false" && hasPlaceholderCredentials());

export const isProduction = process.env.NODE_ENV === "production";

const REQUIRED_PRODUCTION_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_APP_URL",
  "CRON_SECRET",
] as const;

/**
 * Validates required environment variables when not in mock mode.
 * Call from next.config.ts at build time and from server entry points as needed.
 */
export function validateEnv(): void {
  if (isMockMode) return;

  const missing = REQUIRED_PRODUCTION_VARS.filter(
    (key) => !process.env[key]?.trim()
  );

  if (missing.length > 0) {
    throw new Error(
      `[Aether] Missing required environment variables for production mode:\n` +
        missing.map((k) => `  - ${k}`).join("\n") +
        `\n\nSet AETHER_MOCK_MODE=true for local demo, or provide all required keys.`
    );
  }
}

export function getSupabaseUrl(): string {
  return supabaseUrl || "https://placeholder-url.supabase.co";
}

export function getSupabaseAnonKey(): string {
  return supabaseAnonKey || "placeholder-anon-key";
}