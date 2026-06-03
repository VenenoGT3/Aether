import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Centered empty state for lists/queues: tinted icon chip, title, optional
 * description. Use when a section has no data so real-mode screens look clean.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("py-12 text-center flex flex-col items-center justify-center gap-2", className)}>
      {Icon && (
        <div
          className="w-12 h-12 rounded-2xl bg-secondary/30 flex items-center justify-center border border-border/10 mb-1"
          aria-hidden="true"
        >
          <Icon size={20} className="text-muted-foreground/60" />
        </div>
      )}
      <p className="text-sm font-bold text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground max-w-xs">{description}</p>}
    </div>
  );
}

/**
 * Slim horizontal CTA card (icon + copy + arrow) used to nudge a user toward the
 * performance model when a section is empty — keeps the pay-per-view flow as the
 * hero even in zero states. Accent color tints the surface, chip, and arrow.
 */
export function PromoCard({
  icon: Icon,
  title,
  description,
  href,
  color = "#34C759",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  color?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-4 p-5 rounded-3xl border transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        className
      )}
      style={{ backgroundColor: `${color}0d`, borderColor: `${color}33` }}
    >
      <div className="flex items-start gap-3">
        <span
          className="p-2 rounded-2xl shrink-0"
          style={{ backgroundColor: `${color}1a`, color }}
          aria-hidden="true"
        >
          <Icon size={16} />
        </span>
        <div>
          <h4 className="text-xs font-bold text-foreground">{title}</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-normal">{description}</p>
        </div>
      </div>
      <ArrowRight
        size={16}
        className="shrink-0 group-hover:translate-x-0.5 transition-transform"
        style={{ color }}
        aria-hidden="true"
      />
    </Link>
  );
}
