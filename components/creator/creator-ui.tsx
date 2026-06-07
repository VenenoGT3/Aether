"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type CreatorTone =
  | "neutral"
  | "accent"
  | "violet"
  | "cyan"
  | "success"
  | "warning"
  | "danger";

const toneChip: Record<CreatorTone, string> = {
  neutral: "border-white/10 bg-white/[0.05] text-white/55",
  accent: "border-[rgba(77,142,255,0.22)] bg-[rgba(77,142,255,0.12)] text-[var(--creator-primary)]",
  violet: "border-[rgba(159,141,250,0.22)] bg-[rgba(159,141,250,0.12)] text-[var(--creator-violet)]",
  cyan: "border-[rgba(34,211,238,0.22)] bg-[rgba(34,211,238,0.10)] text-[var(--creator-cyan)]",
  success: "border-[rgba(52,211,153,0.22)] bg-[rgba(52,211,153,0.10)] text-[var(--creator-success)]",
  warning: "border-[rgba(245,158,11,0.22)] bg-[rgba(245,158,11,0.10)] text-[var(--creator-warning)]",
  danger: "border-[rgba(248,113,113,0.24)] bg-[rgba(248,113,113,0.10)] text-[var(--creator-danger)]",
};

const toneLine: Record<CreatorTone, string> = {
  neutral: "from-white/25",
  accent: "from-[var(--creator-primary)]",
  violet: "from-[var(--creator-violet)]",
  cyan: "from-[var(--creator-cyan)]",
  success: "from-[var(--creator-success)]",
  warning: "from-[var(--creator-warning)]",
  danger: "from-[var(--creator-danger)]",
};

const toneText: Record<CreatorTone, string> = {
  neutral: "text-white/55",
  accent: "text-[var(--creator-primary)]",
  violet: "text-[var(--creator-violet)]",
  cyan: "text-[var(--creator-cyan)]",
  success: "text-[var(--creator-success)]",
  warning: "text-[var(--creator-warning)]",
  danger: "text-[var(--creator-danger)]",
};

type CreatorPageShellProps = ComponentPropsWithoutRef<"main"> & {
  maxWidth?: "phone" | "content" | "wide";
};

export function CreatorPageShell({
  children,
  className,
  maxWidth = "wide",
  ...props
}: CreatorPageShellProps) {
  return (
    <main
      className={cn(
        "creator-portal relative z-10 mx-auto w-full px-4 py-6 pb-28 sm:px-6 lg:px-8 md:pb-10",
        maxWidth === "phone" && "max-w-md",
        maxWidth === "content" && "max-w-5xl",
        maxWidth === "wide" && "max-w-7xl",
        className
      )}
      {...props}
    >
      {children}
    </main>
  );
}

type CreatorGlassCardProps = ComponentPropsWithoutRef<"section"> & {
  variant?: "default" | "high" | "flat";
};

export function CreatorGlassCard({
  children,
  className,
  variant = "default",
  ...props
}: CreatorGlassCardProps) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl p-4 sm:p-5",
        variant === "default" && "creator-glass",
        variant === "high" && "creator-glass-high",
        variant === "flat" && "border border-white/10 bg-white/[0.035]",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

type CreatorSectionHeaderProps = ComponentPropsWithoutRef<"div"> & {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
};

export function CreatorSectionHeader({
  title,
  eyebrow,
  description,
  action,
  className,
  ...props
}: CreatorSectionHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="creator-label mb-2 text-[var(--creator-muted)]">{eyebrow}</p>
        ) : null}
        <h1 className="creator-display text-3xl font-semibold tracking-normal text-white sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--creator-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type CreatorMetricCardProps = ComponentPropsWithoutRef<"div"> & {
  label: string;
  value: string;
  icon?: LucideIcon;
  detail?: string;
  trend?: string;
  tone?: CreatorTone;
};

export function CreatorMetricCard({
  label,
  value,
  icon: Icon,
  detail,
  trend,
  tone = "accent",
  className,
  ...props
}: CreatorMetricCardProps) {
  return (
    <div className={cn("creator-glass group relative overflow-hidden rounded-2xl p-5", className)} {...props}>
      <div className={cn("absolute left-0 top-0 h-[2px] w-full bg-gradient-to-r to-transparent opacity-50 transition-opacity group-hover:opacity-100", toneLine[tone])} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="creator-label text-white/40">{label}</p>
          <p className={cn("mt-2 text-3xl font-bold tracking-tight text-white", tone === "accent" && "text-[var(--creator-primary)]")}>
            {value}
          </p>
        </div>
        {Icon ? (
          <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl border", toneChip[tone])}>
            <Icon size={18} aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {(detail || trend) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {trend ? <span className={cn("font-semibold", toneText[tone])}>{trend}</span> : null}
          {detail ? <span className="text-white/45">{detail}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

type CreatorStatusPillProps = ComponentPropsWithoutRef<"span"> & {
  tone?: CreatorTone;
};

export function CreatorStatusPill({
  children,
  className,
  tone = "neutral",
  ...props
}: CreatorStatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em]",
        toneChip[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

type CreatorProgressBarProps = ComponentPropsWithoutRef<"div"> & {
  value: number;
  max?: number;
};

export function CreatorProgressBar({
  value,
  max = 100,
  className,
  ...props
}: CreatorProgressBarProps) {
  const safeMax = max > 0 ? max : 100;
  const width = Math.min(Math.max((value / safeMax) * 100, 0), 100);

  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-white/[0.06]", className)} {...props}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-[var(--creator-primary)] via-[var(--creator-cyan)] to-[var(--creator-success)] shadow-[0_0_18px_rgba(77,142,255,0.35)]"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

type CreatorActionButtonProps = ComponentPropsWithoutRef<"button"> & {
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
  children: ReactNode;
};

export function CreatorActionButton({
  href,
  variant = "primary",
  className,
  children,
  ...props
}: CreatorActionButtonProps) {
  const classes = cn(
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold tracking-normal transition-all active:scale-[0.98]",
    variant === "primary" && "creator-gradient-accent text-white shadow-[0_12px_32px_-18px_rgba(77,142,255,0.9)] hover:brightness-105",
    variant === "secondary" && "creator-glass text-white hover:bg-white/[0.08]",
    variant === "ghost" && "border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white",
    className
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}

export function CreatorEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-10 text-center">
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-[var(--creator-primary)]">
        <Icon size={22} />
      </span>
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--creator-muted)]">{description}</p>
    </div>
  );
}

