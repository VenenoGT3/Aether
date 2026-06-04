"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getClientProfile } from "@/lib/supabase/client";

/**
 * Generic /campaigns entry — routes to the role-specific campaigns page.
 * (The real listings live at /business/campaigns and /creator/campaigns.)
 */
export default function CampaignsPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    getClientProfile()
      .then((p) => {
        if (!active) return;
        const segment = p?.role === "business" ? "business" : "creator";
        router.replace(`/${segment}/campaigns`);
      })
      .catch(() => {
        if (active) router.replace("/auth/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <Loader2 className="animate-spin text-primary" size={28} />
    </div>
  );
}
