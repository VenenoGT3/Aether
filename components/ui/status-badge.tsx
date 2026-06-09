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
  neutral: "bg-white/10 text-white/80 border-white/20",
  info: "bg-[#4d8eff]/15 text-[#7db0ff] border-[#4d8eff]/25",
  success: "bg-[#34d399]/15 text-[#6ee7b7] border-[#34d399]/25",
  warning: "bg-[#f59e0b]/15 text-[#fcd34d] border-[#f59e0b]/25",
  danger: "bg-[#f87171]/15 text-[#fca5a5] border-[#f87171]/25",
  purple: "bg-[#9f8dfa]/15 text-[#c4b5fd] border-[#9f8dfa]/25",
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
        "inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
