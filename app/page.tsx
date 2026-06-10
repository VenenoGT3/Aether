import type { Metadata } from "next";
import { AetherLandingPage } from "@/components/landing/aether-landing-page";
import { getLandingStats } from "@/lib/supabase/landing-stats";

export const metadata: Metadata = {
  title: "Aether | Performance UGC and Clipping Marketplace",
  description:
    "Launch creator campaigns with funded performance pools, verified view tracking, fraud checks, and Stripe-backed creator payouts.",
};

// ISR: regenerate at most every 5 minutes. The landing page is the highest
// traffic anonymous route — its DB-backed stats must never cost one query
// batch per visit, and must still refresh (they were frozen at build before).
export const revalidate = 300;

export default async function Home() {
  const stats = await getLandingStats();
  return <AetherLandingPage stats={stats} />;
}
