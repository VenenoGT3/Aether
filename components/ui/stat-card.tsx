import Link from "next/link";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Accent color (hex) for the icon chip. */
  color?: string;
  /** Optional caption under the value. */
  sub?: string;
  /** Tooltip / extended description (also used as aria description hint). */
  hint?: string;
  /** Render as a link… */
  href?: string;
  /** …or a button. Plain div when neither is set. */
  onClick?: () => void;
  className?: string;
}

/**
 * Compact KPI card: uppercase label, tinted icon chip, large value, optional
 * caption. Renders as a Link / button / static div depending on interactivity,
 * with proper focus states and an aria-label so screen readers get "label: value".
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  color = "#007AFF",
  sub,
  hint,
  href,
  onClick,
  className,
}: StatCardProps) {
  const inner = (
    <>
      <div className="flex justify-between items-start text-muted-foreground">
        <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
        <span
          className="p-1.5 rounded-xl"
          style={{ backgroundColor: `${color}1a`, color }}
          aria-hidden="true"
        >
          <Icon size={14} />
        </span>
      </div>
      <h3 className="text-xl font-bold tracking-tight mt-3">{value}</h3>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </>
  );

  const base = "block text-left p-5 apple-card";
  const interactive =
    "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";
  const ariaLabel = `${label}: ${value}${sub ? ` (${sub})` : ""}`;

  if (href) {
    return (
      <Link href={href} title={hint} aria-label={ariaLabel} className={cn(base, interactive, className)}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={hint}
        aria-label={ariaLabel}
        className={cn(base, interactive, "w-full", className)}
      >
        {inner}
      </button>
    );
  }
  return (
    <div title={hint} className={cn(base, className)}>
      {inner}
    </div>
  );
}
