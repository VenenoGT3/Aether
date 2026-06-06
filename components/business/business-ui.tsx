"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type BusinessTone =
  | "neutral"
  | "accent"
  | "secondary"
  | "info"
  | "success"
  | "warning"
  | "danger";

const toneText: Record<BusinessTone, string> = {
  neutral: "text-[var(--business-muted)]",
  accent: "text-[var(--business-primary)]",
  secondary: "text-[var(--business-secondary)]",
  info: "text-[var(--business-accent)]",
  success: "text-[var(--business-success)]",
  warning: "text-[var(--business-warning)]",
  danger: "text-[var(--business-danger)]",
};

const toneChip: Record<BusinessTone, string> = {
  neutral: "bg-white/5 text-[var(--business-muted)] border-white/10",
  accent: "bg-[rgba(173,198,255,0.10)] text-[var(--business-primary)] border-[rgba(173,198,255,0.20)]",
  secondary: "bg-[rgba(208,188,255,0.10)] text-[var(--business-secondary)] border-[rgba(208,188,255,0.20)]",
  info: "bg-[rgba(77,142,255,0.10)] text-[var(--business-accent)] border-[rgba(77,142,255,0.20)]",
  success: "bg-[rgba(52,211,153,0.10)] text-[var(--business-success)] border-[rgba(52,211,153,0.20)]",
  warning: "bg-[rgba(251,191,36,0.10)] text-[var(--business-warning)] border-[rgba(251,191,36,0.20)]",
  danger: "bg-[rgba(248,113,113,0.10)] text-[var(--business-danger)] border-[rgba(248,113,113,0.20)]",
};

const toneProgress: Record<BusinessTone, string> = {
  neutral: "bg-[var(--business-muted)]",
  accent: "business-progress-fill",
  secondary: "bg-[var(--business-secondary)]",
  info: "bg-[var(--business-accent)]",
  success: "bg-[var(--business-success)]",
  warning: "bg-[var(--business-warning)]",
  danger: "bg-[var(--business-danger)]",
};

type BusinessPortalShellProps = ComponentPropsWithoutRef<"main"> & {
  maxWidth?: "screen" | "wide" | "content";
};

export function BusinessPortalShell({
  children,
  className,
  maxWidth = "wide",
  ...props
}: BusinessPortalShellProps) {
  return (
    <main
      className={cn(
        "business-portal min-h-screen overflow-hidden",
        "bg-[linear-gradient(180deg,#0c1324_0%,#10131d_52%,#0b0f18_100%)]",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "mx-auto w-full px-4 py-6 sm:px-6 lg:px-8",
          maxWidth === "wide" && "max-w-7xl",
          maxWidth === "content" && "max-w-5xl",
          maxWidth === "screen" && "max-w-none"
        )}
      >
        {children}
      </div>
    </main>
  );
}

type BusinessGlassCardProps = ComponentPropsWithoutRef<"section"> & {
  variant?: "default" | "heavy" | "elevated";
};

export function BusinessGlassCard({
  children,
  className,
  variant = "default",
  ...props
}: BusinessGlassCardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl p-4 sm:p-5",
        variant === "default" && "business-glass",
        variant === "heavy" && "business-glass-heavy",
        variant === "elevated" && "business-glass-elevated",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

type BusinessSectionHeaderProps = ComponentPropsWithoutRef<"div"> & {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function BusinessSectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
  ...props
}: BusinessSectionHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
      {...props}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--business-primary)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="business-font-display text-3xl font-semibold tracking-normal text-[var(--business-text)] sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--business-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

type BusinessMetricCardProps = ComponentPropsWithoutRef<"div"> & {
  label: string;
  value: string;
  icon?: LucideIcon;
  detail?: string;
  trend?: string;
  tone?: BusinessTone;
};

export function BusinessMetricCard({
  label,
  value,
  icon: Icon,
  detail,
  trend,
  tone = "accent",
  className,
  ...props
}: BusinessMetricCardProps) {
  return (
    <div
      className={cn("business-glass rounded-2xl p-4 sm:p-5", className)}
      aria-label={`${label}: ${value}`}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
            {label}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-normal text-[var(--business-text)]">
            {value}
          </p>
        </div>
        {Icon ? (
          <span
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border",
              toneChip[tone]
            )}
            aria-hidden="true"
          >
            <Icon size={18} />
          </span>
        ) : null}
      </div>
      {(detail || trend) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {trend ? <span className={cn("font-semibold", toneText[tone])}>{trend}</span> : null}
          {detail ? <span className="text-[var(--business-muted)]">{detail}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

type BusinessStatusPillProps = ComponentPropsWithoutRef<"span"> & {
  tone?: BusinessTone;
};

export function BusinessStatusPill({
  children,
  className,
  tone = "neutral",
  ...props
}: BusinessStatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
        toneChip[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

type BusinessProgressBarProps = ComponentPropsWithoutRef<"div"> & {
  value: number;
  max?: number;
  label?: string;
  tone?: BusinessTone;
};

export function BusinessProgressBar({
  value,
  max = 100,
  label,
  tone = "accent",
  className,
  ...props
}: BusinessProgressBarProps) {
  const safeMax = max > 0 ? max : 100;
  const percentage = Math.min(Math.max((value / safeMax) * 100, 0), 100);

  return (
    <div className={cn("space-y-2", className)} {...props}>
      {label ? (
        <div className="flex items-center justify-between gap-3 text-xs text-[var(--business-muted)]">
          <span>{label}</span>
          <span>{Math.round(percentage)}%</span>
        </div>
      ) : null}
      <div
        className="business-progress-track h-2 rounded-full"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300 ease-out", toneProgress[tone])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

type BusinessActionButtonProps = ComponentPropsWithoutRef<"button"> & {
  href?: string;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export function BusinessActionButton({
  children,
  className,
  href,
  icon: Icon,
  trailingIcon: TrailingIcon,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: BusinessActionButtonProps) {
  const classes = cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border text-sm font-semibold tracking-normal transition-all",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(173,198,255,0.60)] disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "h-8 px-3 text-xs",
    size === "md" && "h-10 px-4",
    size === "lg" && "h-12 px-5 text-base",
    variant === "primary" && "business-accent-button border-transparent",
    variant === "secondary" && "business-glass-elevated border-white/10 text-[var(--business-text)] hover:bg-white/10",
    variant === "ghost" && "border-transparent text-[var(--business-muted)] hover:bg-white/[0.08] hover:text-[var(--business-text)]",
    variant === "danger" && "border-[rgba(248,113,113,0.25)] bg-[rgba(248,113,113,0.10)] text-[var(--business-danger)] hover:bg-[rgba(248,113,113,0.15)]",
    className
  );
  const content = (
    <>
      {Icon ? <Icon size={16} aria-hidden="true" /> : null}
      {children}
      {TrailingIcon ? <TrailingIcon size={16} aria-hidden="true" /> : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} {...props}>
      {content}
    </button>
  );
}

type BusinessEmptyStateProps = ComponentPropsWithoutRef<"div"> & {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
};

export function BusinessEmptyState({
  icon: Icon = ArrowUpRight,
  title,
  description,
  actionHref,
  actionLabel,
  className,
  ...props
}: BusinessEmptyStateProps) {
  return (
    <div
      className={cn(
        "business-glass flex min-h-64 flex-col items-center justify-center rounded-2xl p-8 text-center",
        className
      )}
      {...props}
    >
      <span className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-[var(--business-primary)]">
        <Icon size={20} aria-hidden="true" />
      </span>
      <h2 className="text-lg font-semibold tracking-normal text-[var(--business-text)]">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--business-muted)]">{description}</p>
      ) : null}
      {actionHref && actionLabel ? (
        <BusinessActionButton href={actionHref} className="mt-5" trailingIcon={ArrowUpRight}>
          {actionLabel}
        </BusinessActionButton>
      ) : null}
    </div>
  );
}
