"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Plus,
  Settings2,
  UserCog,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BusinessActionButton, BusinessStatusPill } from "@/components/business/business-ui";
import { LanguageToggle } from "@/components/language-toggle";
import { NotificationCenter } from "@/components/notification-center";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getClientProfile, signOutClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/translations";
import type { Profile } from "@/types";
import { toast } from "sonner";

const businessNavItems = [
  {
    label: "Dashboard",
    href: "/business/dashboard",
    icon: LayoutDashboard,
    match: (pathname: string) => pathname === "/business/dashboard",
  },
  {
    label: "Campaigns",
    href: "/business/campaigns",
    icon: Megaphone,
    match: (pathname: string) => pathname.startsWith("/business/campaigns"),
  },
  {
    label: "Submissions",
    href: "/business/moderation",
    icon: ClipboardCheck,
    match: (pathname: string) => pathname === "/business/moderation",
  },
  {
    label: "Treasury",
    href: "/business/payments",
    icon: Wallet,
    match: (pathname: string) => pathname === "/business/payments",
  },
  {
    label: "Settings",
    href: "/business/settings",
    icon: UserCog,
    match: (pathname: string) => pathname === "/business/settings",
  },
];

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "AE"
  );
}

function BusinessBrandMark() {
  const { t } = useTranslation();

  return (
    <Link href="/business/dashboard" className="flex w-36 shrink-0 items-center gap-3 sm:w-40">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-[var(--business-primary)] to-[var(--business-secondary)] text-sm font-black text-[var(--business-bg)] shadow-[0_12px_28px_-16px_rgba(173,198,255,0.8)]">
        AE
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-normal text-[var(--business-text)]">
          Aether
        </span>
        <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--business-muted)]">
          {t("Business dashboard")}
        </span>
      </span>
    </Link>
  );
}

function BusinessNavLink({
  href,
  label,
  icon: Icon,
  active,
  compact = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 rounded-lg border border-transparent text-sm font-semibold tracking-normal transition-all",
        compact ? "min-w-0 flex-1 flex-col gap-1 px-1 py-2 text-[9px] leading-none" : "px-3 py-2",
        active
          ? "text-[var(--business-text)]"
          : "text-[var(--business-muted)] hover:bg-white/[0.06] hover:text-[var(--business-text)]"
      )}
      aria-current={active ? "page" : undefined}
    >
      {active ? (
        <motion.span
          layoutId={compact ? "businessMobileNavActive" : "businessDesktopNavActive"}
          className="absolute inset-0 rounded-lg border border-white/10 bg-white/[0.08]"
          transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
        />
      ) : null}
      <Icon size={compact ? 18 : 16} className="relative z-10" aria-hidden="true" />
      <span className={cn("relative z-10", !compact && "whitespace-nowrap")}>{label}</span>
    </Link>
  );
}

function BusinessAvatar({ user }: { user: Profile | null }) {
  const name = user?.full_name || user?.company_name || "Aether";

  if (user?.avatar_url) {
    return (
      <span
        role="img"
        aria-label={name}
        className="block size-9 rounded-lg border border-white/10 bg-center bg-cover"
        style={{ backgroundImage: `url(${user.avatar_url})` }}
      />
    );
  }

  return (
    <span className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-xs font-bold text-[var(--business-primary)]">
      {initials(name)}
    </span>
  );
}

function BusinessProfileMenu({ user }: { user: Profile | null }) {
  const router = useRouter();
  const { t } = useTranslation();
  const displayName = user?.company_name || user?.full_name || "Aether";
  const subtitle = user?.email || user?.website || t("Business workspace");

  if (!user) {
    return (
      <BusinessActionButton href="/auth/login" size="sm" variant="secondary">
        {t("Sign In")}
      </BusinessActionButton>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("Open business profile menu")}
        className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(173,198,255,0.60)]"
      >
        <BusinessAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="business-portal w-64 border-white/10 bg-[rgba(21,27,45,0.96)] text-[var(--business-text)] backdrop-blur-xl"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 text-xs text-[var(--business-muted)]">
            {t("Business Workspace")}
          </DropdownMenuLabel>
          <div className="flex flex-col px-2 pb-2 pt-1">
            <span className="truncate text-sm font-semibold">{displayName}</span>
            <span className="truncate text-xs text-[var(--business-muted)]">{subtitle}</span>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1 border-white/10" />
        <DropdownMenuItem
          className="rounded-lg py-2 text-[var(--business-text)] focus:bg-white/[0.08]"
          onClick={() => router.push("/business/dashboard")}
        >
          <BarChart3 size={14} />
          <span>{t("Dashboard")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-lg py-2 text-[var(--business-text)] focus:bg-white/[0.08]"
          onClick={() => router.push("/business/settings")}
        >
          <Settings2 size={14} />
          <span>{t("Account Settings")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 border-white/10" />
        <DropdownMenuItem
          className="rounded-lg py-2 text-[var(--business-danger)] focus:bg-[rgba(248,113,113,0.10)] focus:text-[var(--business-danger)]"
          onClick={async () => {
            await signOutClient();
            toast.success(t("Successfully signed out."));
            router.push("/auth/login");
            router.refresh();
          }}
        >
          <LogOut size={14} />
          <span>{t("Sign Out")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BusinessRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/business/dashboard";
  const { t } = useTranslation();
  const [user, setUser] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      getClientProfile()
        .then((profile) => {
          if (active) setUser(profile);
        })
        .catch(() => {
          if (active) setUser(null);
        })
        .finally(() => {
          if (active) setProfileLoaded(true);
        });
    };

    refresh();
    window.addEventListener("role-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("role-change", refresh);
    };
  }, []);

  const activeItem = useMemo(
    () => businessNavItems.find((item) => item.match(pathname)) ?? businessNavItems[0],
    [pathname]
  );
  const businessName = user?.company_name || user?.full_name || "Business";

  return (
    <div className="business-route-shell business-portal min-h-[100svh] overflow-x-clip bg-[linear-gradient(180deg,#0c1324_0%,#10131d_58%,#0b0f18_100%)] text-[var(--business-text)]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[rgba(12,19,36,0.86)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-5">
            <BusinessBrandMark />
            <nav
              className="business-scrollbar-none hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex"
              aria-label="Business navigation"
            >
              {businessNavItems.map((item) => (
                <BusinessNavLink
                  key={item.href}
                  href={item.href}
                  label={t(item.label)}
                  icon={item.icon}
                  active={item.match(pathname)}
                />
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <BusinessStatusPill className="hidden max-w-44 truncate whitespace-nowrap 2xl:inline-flex" tone="accent">
              {profileLoaded ? businessName : t("Loading")}
            </BusinessStatusPill>
            <Link
              href="/business/campaigns/new"
              className="hidden h-9 items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-[linear-gradient(135deg,var(--business-primary)_0%,var(--business-secondary)_100%)] px-3 text-sm font-semibold text-[var(--business-bg)] shadow-[0_8px_28px_-14px_rgba(173,198,255,0.7)] transition-all hover:brightness-105 lg:inline-flex"
            >
              <Plus size={15} aria-hidden="true" />
              <span className="ml-2">{t("New Campaign")}</span>
            </Link>
            <div className="hidden sm:block">
              <LanguageToggle />
            </div>
            <div>
              <NotificationCenter />
            </div>
            <Link
              href="/business/campaigns/new"
              aria-label={t("New campaign")}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-[var(--business-primary)] sm:hidden"
            >
              <Plus size={18} aria-hidden="true" />
            </Link>
            <BusinessProfileMenu user={user} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-xs text-[var(--business-muted)] sm:px-6 md:hidden">
        <span className="inline-flex min-w-0 items-center gap-2">
          <activeItem.icon size={14} className="shrink-0 text-[var(--business-primary)]" aria-hidden="true" />
          <span className="truncate font-semibold text-[var(--business-text)]">{t(activeItem.label)}</span>
        </span>
        <span className="truncate">{profileLoaded ? businessName : t("Loading workspace")}</span>
      </div>

      <div className="relative z-10 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:pb-0">{children}</div>

      <nav
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[460px] -translate-x-1/2 rounded-lg border border-white/10 bg-[rgba(12,19,36,0.92)] p-1.5 shadow-[0_18px_45px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl md:hidden"
        aria-label="Business mobile navigation"
      >
        <div className="flex items-center justify-between gap-1">
          {businessNavItems.map((item) => (
            <BusinessNavLink
              key={item.href}
              href={item.href}
              label={t(item.label)}
              icon={item.icon}
              active={item.match(pathname)}
              compact
            />
          ))}
        </div>
      </nav>

      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--business-primary)]/35 to-transparent" />
    </div>
  );
}
