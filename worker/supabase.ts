import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServiceRoleKey, getSupabaseUrl } from "./env";

/**
 * Service-role Supabase client for the worker. Bypasses RLS — required so the
 * worker can write view_snapshots, call record_clip_earning, and update clips
 * for any creator/campaign. Created lazily so importing worker modules (e.g. in
 * tests) does not require Supabase credentials.
 */
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
