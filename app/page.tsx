import type { Metadata } from "next";
import { AetherLandingPage } from "@/components/landing/aether-landing-page";
import { getLandingStats } from "@/lib/supabase/landing-stats";

export const metadata: Metadata = {
  title: "Aether | Performance UGC and Clipping Marketplace",
  description:
    "Launch creator campaigns with funded performance pools, verified view tracking, fraud checks, and Stripe-backed creator payouts.",
};

export default async function Home() {
  const stats = await getLandingStats();
  return <AetherLandingPage stats={stats} />;
}
