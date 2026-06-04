"use client";

import { Link2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/translations";

/**
 * Account-linking placeholder for trusted view tracking.
 *
 * WHERE REAL LINKING WILL HAPPEN: creators connect TikTok/YouTube/Instagram
 * accounts here. The official provider flow should persist server-side account
 * rows in creator_social_accounts; optional Ayrshare linking can still store a
 * profile key. Today it's a disabled stub so the UI slot exists ahead of the
 * integration.
 */
export function AyrshareLinkPlaceholder() {
  const { t } = useTranslation();

  return (
    <div className="p-6 apple-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <Link2 size={15} className="text-primary" /> {t("View tracking")}
        </h3>
        <span className="text-[9px] font-bold uppercase tracking-wide bg-secondary text-muted-foreground border border-border/30 px-2 py-0.5 rounded-full">
          {t("Coming soon")}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed mb-4">
        {t(
          "Connect your social accounts so views are tracked automatically and your earnings stay accurate. Until then, views are estimated."
        )}
      </p>
      <Button
        disabled
        variant="outline"
        className="w-full rounded-xl py-4 text-xs font-bold gap-1.5 border-border text-muted-foreground h-auto cursor-not-allowed"
      >
        <ShieldCheck size={14} /> {t("Connect accounts (coming soon)")}
      </Button>
    </div>
  );
}
