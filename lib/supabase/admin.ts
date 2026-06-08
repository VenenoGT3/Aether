import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/env";
import { getServiceRoleKey } from "@/lib/env.server";

/**
 * Service-role Supabase client — bypasses RLS.
 *
 * Server-only. Use narrowly for trusted post-provider transitions where RLS must
 * not be callable by browser clients, such as settling Stripe transfer outcomes.
 */
export function createAdminClient() {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
