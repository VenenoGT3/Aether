"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Compass,
  FileText,
  Home,
  LogOut,
  Scissors,
  Settings2,
  Sparkles,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { CreatorStatusPill } from "@/components/creator/creator-ui";
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

const creatorNavItems = [
  {
    label: "Home",
    href: "/creator/dashboard",
    icon: Home,
    match: (pathname: string) => pathname === "/creator/dashboard",
  },
  {
    label: "Discover",
    href: "/creator/discover",
    icon: Compass,
    match: (pathname: string) => pathname === "/creator/discover",
  },
  {
    label: "Contracts",
    href: "/creator/campaigns",
    icon: FileText,
    match: (pathname: string) => pathname === "/creator/campaigns",
  },
  {
    label: "UGC",
    href: "/creator/ugc",
    icon: Sparkles,
    match: (pathname: string) => pathname === "/creator/ugc",
  },
  {
    label: "Clipping",
    href: "/creator/clips",
    icon: Scissors,
    match: (pathname: string) => pathname === "/creator/clips",
  },
  {
    label: "Settings",
    href: "/creator/settings",
    icon: UserCog,
    match: (pathname: string) => pathname === "/creator/settings",
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

function CreatorBrandMark() {
  const { t } = useTranslation();

  return (
    <Link href="/creator/dashboard" className="flex w-36 shrink-0 items-center gap-3 sm:w-40">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-[var(--creator-primary)] to-[var(--creator-secondary)] text-sm font-black text-[var(--creator-bg)] shadow-[0_12px_28px_-16px_rgba(159,141,250,0.8)]">
        AE
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold tracking-normal text-white">
          Aether
        </span>
        <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          {t("Creator workspace")}
        </span>
      </span>
    </Link>
  );
}

function CreatorNavLink({
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
          ? "text-white"
          : "text-white/55 hover:bg-white/[0.06] hover:text-white"
      )}
      aria-current={active ? "page" : undefined}
    >
      {active ? (
        <motion.span
          layoutId={compact ? "creatorMobileNavActive" : "creatorDesktopNavActive"}
          className="absolute inset-0 rounded-lg border border-white/10 bg-white/[0.08]"
          transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
        />
      ) : null}
      <Icon size={compact ? 18 : 16} className="relative z-10" aria-hidden="true" />
      <span className={cn("relative z-10", !compact && "whitespace-nowrap")}>{label}</span>
    </Link>
  );
}

function CreatorAvatar({ user }: { user: Profile | null }) {
  const name = user?.full_name || user?.social_handle || "Creator";

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
    <span className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-xs font-bold text-[var(--creator-primary)]">
      {initials(name)}
    </span>
  );
}

function CreatorProfileMenu({ user }: { user: Profile | null }) {
  const router = useRouter();
  const { t } = useTranslation();
  const displayName = user?.full_name || user?.social_handle || "Creator";
  const subtitle = user?.social_handle || user?.email || t("Creator workspace");

  if (!user) {
    return (
      <Link
        href="/auth/login"
        className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white"
      >
        {t("Sign In")}
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("Open creator profile menu")}
        className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(159,141,250,0.60)]"
      >
        <CreatorAvatar user={user} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="creator-portal w-64 border-white/10 bg-[rgba(15,23,42,0.94)] text-white backdrop-blur-xl"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5 text-xs text-white/45">
            {t("Creator Workspace")}
          </DropdownMenuLabel>
          <div className="flex flex-col px-2 pb-2 pt-1">
            <span className="truncate text-sm font-semibold">{displayName}</span>
            <span className="truncate text-xs text-white/45">{subtitle}</span>
          </div>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1 border-white/10" />
        <DropdownMenuItem
          className="rounded-lg py-2 text-white focus:bg-white/[0.08]"
          onClick={() => router.push("/creator/dashboard")}
        >
          <Home size={14} />
          <span>{t("Home")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="rounded-lg py-2 text-white focus:bg-white/[0.08]"
          onClick={() => router.push("/creator/settings")}
        >
          <Settings2 size={14} />
          <span>{t("Account Settings")}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 border-white/10" />
        <DropdownMenuItem
          className="rounded-lg py-2 text-[var(--creator-danger)] focus:bg-[rgba(248,113,113,0.10)] focus:text-[var(--creator-danger)]"
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

export function CreatorRouteShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/creator/dashboard";
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
    () => creatorNavItems.find((item) => item.match(pathname)) ?? creatorNavItems[0],
    [pathname]
  );
  const creatorName = user?.full_name?.split(/\s+/)[0] || user?.social_handle || "Creator";

  return (
    <div className="creator-route-shell creator-portal relative min-h-[100svh] overflow-x-hidden bg-[var(--creator-bg)] text-white">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-[4%] top-[10%] h-[42vw] w-[42vw] rounded-full bg-[rgba(77,142,255,0.055)] blur-[110px]" />
        <div className="absolute bottom-[14%] right-[2%] h-[48vw] w-[48vw] rounded-full bg-[rgba(159,141,250,0.05)] blur-[125px]" />
        <div className="absolute left-[42%] top-[45%] h-[30vw] w-[30vw] rounded-full bg-[rgba(34,211,238,0.035)] blur-[95px]" />
      </div>

      <header className="sticky top-0 z-[100] border-b border-white/10 bg-[rgba(12,19,36,0.86)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-5">
            <CreatorBrandMark />
            <nav
              className="creator-scrollbar-none hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex"
              aria-label="Creator navigation"
            >
              {creatorNavItems.map((item) => (
                <CreatorNavLink
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
            <CreatorStatusPill className="hidden max-w-44 truncate whitespace-nowrap 2xl:inline-flex" tone="accent">
              {profileLoaded ? creatorName : t("Loading")}
            </CreatorStatusPill>
            <Link
              href="/creator/discover"
              className="hidden h-9 items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-[linear-gradient(135deg,var(--creator-primary)_0%,var(--creator-secondary)_100%)] px-3 text-sm font-semibold text-[var(--creator-bg)] shadow-[0_8px_28px_-14px_rgba(159,141,250,0.7)] transition-all hover:brightness-105 lg:inline-flex"
            >
              <Compass size={15} aria-hidden="true" />
              <span className="ml-2">{t("Find Campaigns")}</span>
            </Link>
            <div className="hidden sm:block">
              <LanguageToggle />
            </div>
            <div>
              <NotificationCenter />
            </div>
            <Link
              href="/creator/discover"
              aria-label={t("Find Campaigns")}
              className="inline-flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-[var(--creator-primary)] sm:hidden"
            >
              <Compass size={18} aria-hidden="true" />
            </Link>
            <CreatorProfileMenu user={user} />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-xs text-white/45 sm:px-6 md:hidden">
        <span className="inline-flex min-w-0 items-center gap-2">
          <activeItem.icon size={14} className="shrink-0 text-[var(--creator-primary)]" aria-hidden="true" />
          <span className="truncate font-semibold text-white">{t(activeItem.label)}</span>
        </span>
        <span className="truncate">{profileLoaded ? creatorName : t("Loading workspace")}</span>
      </div>

      <div className="relative z-10 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:pb-0">{children}</div>

      <nav
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-[100] w-[calc(100%-1.5rem)] max-w-[460px] -translate-x-1/2 rounded-lg border border-white/10 bg-[rgba(12,19,36,0.92)] p-1.5 shadow-[0_18px_45px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl md:hidden"
        aria-label="Creator mobile navigation"
      >
        <div className="flex items-center justify-between gap-1">
          {creatorNavItems.map((item) => (
            <CreatorNavLink
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

      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--creator-primary)]/35 to-transparent" />
    </div>
  );
}
