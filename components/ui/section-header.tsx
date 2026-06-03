import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  /** Small uppercase label above the title (e.g. "Performance Campaigns"). */
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  /** Accent color (hex) for the eyebrow text + icon. */
  eyebrowColor?: string;
  title: string;
  /** Optional trailing action link (e.g. "Moderation →"). */
  action?: { label: string; href: string };
  className?: string;
}

/**
 * Standard section header used across dashboards: an accent eyebrow + title with
 * an optional trailing action link. Keeps visual hierarchy and spacing uniform.
 */
export function SectionHeader({
  eyebrow,
  eyebrowIcon: Icon,
  eyebrowColor = "#34C759",
  title,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3 mb-5", className)}>
      <div>
        {eyebrow && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5"
            style={{ color: eyebrowColor }}
          >
            {Icon && <Icon size={12} aria-hidden="true" />} {eyebrow}
          </span>
        )}
        <h2 className="text-lg font-bold tracking-tight mt-1">{title}</h2>
      </div>
      {action && (
        <Link
          href={action.href}
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {action.label} <ArrowRight size={13} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
