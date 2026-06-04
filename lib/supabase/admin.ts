import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl, canUseServiceRoleInNextRuntime } from "@/lib/env";
import { getServiceRoleKey } from "@/lib/env.server";

/**
 * Service-role Supabase client — bypasses RLS.
 *
 * Allowed only when `STRIPE_WEBHOOK_HANDLER=vercel` (legacy; not recommended for
 * production Vercel deploys). Production default: Stripe webhooks run in Supabase
 * Edge Functions, which receive `SUPABASE_SERVICE_ROLE_KEY` from the Supabase
 * runtime — not from Vercel.
 */
export function createAdminClient() {
  if (!canUseServiceRoleInNextRuntime()) {
    throw new Error(
      "createAdminClient() is disabled on Vercel when STRIPE_WEBHOOK_HANDLER=supabase. " +
        "Use the stripe-webhook Edge Function instead."
    );
  }

  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}