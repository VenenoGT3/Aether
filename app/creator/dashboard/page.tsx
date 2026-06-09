import type { Metadata } from "next";
import { getCreatorDashboardInitialData } from "@/lib/supabase/dashboard-initial";
import { CreatorDashboardClient } from "./creator-dashboard-client";

export const metadata: Metadata = {
  title: "Creator Dashboard | Aether",
  description: "Your clips, verified views, earnings, and payouts.",
};

// Per-user data behind auth cookies — never statically prerendered. Explicit
// so the initial-data loader's error handling can't mask dynamic detection.
export const dynamic = "force-dynamic";

/**
 * RSC shell: the creator dashboard's data lives in client hooks (posts,
 * clips, earnings, transactions), so the server pre-fetches just the profile
 * for an immediate authenticated first paint. Deeper hook hydration can
 * follow the same initialData pattern hook by hook.
 */
export default async function CreatorDashboardPage() {
  const initialData = await getCreatorDashboardInitialData();
  return <CreatorDashboardClient initialData={initialData} />;
}
