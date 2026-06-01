import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, isMockMode } from "@/lib/env";
import { getServiceRoleKey } from "@/lib/env.server";

/**
 * Service-role Supabase client for verified system operations only:
 * - Stripe webhooks (signature-verified)
 *
 * Bypasses RLS. Never use for user-initiated requests.
 */
export function createAdminClient() {
  const serviceRoleKey = isMockMode
    ? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      "placeholder-service-role-key"
    : getServiceRoleKey();

  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}