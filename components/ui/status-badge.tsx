import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "purple";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-secondary text-muted-foreground border-border/40",
  info: "bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/20",
  success: "bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20",
  warning: "bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  purple: "bg-[#5856D6]/10 text-[#5856D6] border-[#5856D6]/20",
};

/**
 * Small semantic pill used for clip/campaign statuses, types, and risk flags.
 * One tone scale keeps status colors consistent everywhere they appear.
 */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
