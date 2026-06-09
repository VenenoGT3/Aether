import type { Metadata } from "next";
import { getBusinessDashboardInitialData } from "@/lib/supabase/dashboard-initial";
import { BusinessDashboardClient } from "./business-dashboard-client";

export const metadata: Metadata = {
  title: "Business Dashboard | Aether",
  description: "Campaign performance, verified views, and treasury at a glance.",
};

// Per-user data behind auth cookies — never statically prerendered. Explicit
// so the initial-data loader's error handling can't mask dynamic detection.
export const dynamic = "force-dynamic";

/**
 * RSC shell: fetches the dashboard's first-paint data server-side (profile,
 * campaigns, clips, per-campaign metrics — in parallel, RLS-scoped via the
 * caller's cookies) so the client component renders with data instead of a
 * loading state. Live updates stay client-side in BusinessDashboardClient.
 */
export default async function BusinessDashboardPage() {
  const initialData = await getBusinessDashboardInitialData();
  return <BusinessDashboardClient initialData={initialData} />;
}
