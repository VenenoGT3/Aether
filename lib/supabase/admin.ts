import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, isMockMode } from "@/lib/env";

/**
 * Service-role Supabase client for system operations (webhooks, cron).
 * Bypasses RLS — use only in verified server contexts.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey && !isMockMode) {
    throw new Error(
      "[Aether] SUPABASE_SERVICE_ROLE_KEY is required for admin operations."
    );
  }

  return createClient(
    getSupabaseUrl(),
    serviceRoleKey || "placeholder-service-role-key",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}