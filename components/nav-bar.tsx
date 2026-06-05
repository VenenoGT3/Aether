"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LanguageToggle } from "./language-toggle";
import { useTranslation } from "@/lib/translations";
import { NotificationCenter } from "./notification-center";
import { getClientProfile, signOutClient } from "@/lib/supabase/client";
import { Profile } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, BarChart3, LogOut } from "lucide-react";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

export function NavBar() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<Profile | null>(null);
  const role: "business" | "influencer" = user?.role === "business" ? "business" : "influencer";

  useEffect(() => {
    let active = true;
    const refresh = () => {
      getClientProfile()
        .then((p) => {
          if (active) setUser(p);
        })
        .catch(() => {
          if (active) setUser(null);
        });
    };
    refresh();
    // Re-fetch when auth state changes (e.g. sign out).
    window.addEventListener("role-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("role-change", refresh);
    };
  }, []);

  const isAuthPage = pathname?.startsWith("/auth");

  if (isAuthPage) return null;

  return (
    <header className="sticky top-0 z-50 w-full glass-nav">
      <div className="mx-auto max-w-7xl px-4 md:px-8 h-16 flex items-center justify-between">
        {/* Logo Section */}
        <div className="flex items-center gap-4 md:gap-8">
          <Link href="/" className="flex items-center gap-2 select-none group">
            <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-[#007AFF] to-[#34C759] shadow-sm flex items-center justify-center transition-transform group-hover:scale-110">
              <Sparkles size={10} className="text-white" />
            </span>
            <span className="font-semibold text-base md:text-lg tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
              Aether
            </span>
          </Link>

          {/* Navigation Links based on role */}
          {user && (
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-muted-foreground">
              {role === "business" ? (
                <>
                  <Link
                    href="/business/dashboard"
                    className={`px-3 py-1.5 rounded-full transition-all hover:text-foreground ${
                      pathname === "/business/dashboard" ? "bg-secondary text-foreground" : ""
                    }`}
                  >
                    {t("Dashboard")}
                  </Link>
                  <Link
                    href="/business/campaigns"
                    className={`px-3 py-1.5 rounded-full transition-all hover:text-foreground ${
                      pathname === "/business/campaigns" ? "bg-secondary text-foreground" : ""
                    }`}
                  >
                    {t("Campaigns")}
                  </Link>
                  <Link
                    href="/business/moderation"
                    className={`px-3 py-1.5 rounded-full transition-all hover:text-foreground ${
                      pathname === "/business/moderation" ? "bg-secondary text-foreground" : ""
                    }`}
                  >
                    {t("Clips")}
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/creator/dashboard"
                    className={`px-3 py-1.5 rounded-full transition-all hover:text-foreground ${
                      pathname === "/creator/dashboard" ? "bg-secondary text-foreground" : ""
                    }`}
                  >
                    {t("Work Center")}
                  </Link>
                  <Link
                    href="/creator/discover"
                    className={`px-3 py-1.5 rounded-full transition-all hover:text-foreground ${
                      pathname === "/creator/discover" ? "bg-secondary text-foreground" : ""
                    }`}
                  >
                    {t("Discover")}
                  </Link>
                  <Link
                    href="/creator/campaigns"
                    className={`px-3 py-1.5 rounded-full transition-all hover:text-foreground ${
                      pathname === "/creator/campaigns" ? "bg-secondary text-foreground" : ""
                    }`}
                  >
                    {t("My Campaigns")}
                  </Link>
                  <Link
                    href="/creator/clips"
                    className={`px-3 py-1.5 rounded-full transition-all hover:text-foreground ${
                      pathname === "/creator/clips" ? "bg-secondary text-foreground" : ""
                    }`}
                  >
                    {t("Clips & Earnings")}
                  </Link>
                </>
              )}
            </nav>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 md:gap-3">
          {user ? (
            <>
              {/* Language Selector */}
              <LanguageToggle />

              {/* Notification Bell Dropdown */}
              <NotificationCenter />

              {/* Profile Avatar Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="relative w-8 h-8 rounded-full overflow-hidden p-0 border border-border/20 hover:scale-105 active:scale-95 transition-all cursor-pointer bg-transparent block focus:outline-none">
                  {user.avatar_url ? (
                    <span
                      role="img"
                      aria-label={user.full_name}
                      className="block w-full h-full bg-center bg-cover"
                      style={{ backgroundImage: `url(${user.avatar_url})` }}
                    />
                  ) : (
                    <span className="w-full h-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                      {initials(user.full_name)}
                    </span>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 mt-1 rounded-2xl p-1.5 border border-border/40 bg-popover/90 backdrop-blur-md">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground">
                      {t("Welcome Back")}
                    </DropdownMenuLabel>
                    <div className="flex flex-col px-2 py-1">
                      <span className="text-sm font-semibold">{user.full_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {role === "business" ? user.company_name : user.social_handle}
                      </span>
                    </div>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="my-1 border-border/20" />
                  <DropdownMenuItem className="rounded-lg py-2 cursor-pointer gap-2" onClick={() => router.push(`/${role === "influencer" ? "creator" : "business"}/dashboard`)}>
                    <BarChart3 size={14} />
                    <span>{t("My Dashboard")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1 border-border/20" />
                  <DropdownMenuItem
                    className="rounded-lg py-2 cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive gap-2"
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
            </>
          ) : (
            <>
              <LanguageToggle />
              <Link href="/auth/login">
                <Button className="rounded-full px-5 py-1.5 font-semibold text-sm cursor-pointer shadow-sm hover:scale-[1.02] transition-transform">
                  {t("Sign In")}
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
