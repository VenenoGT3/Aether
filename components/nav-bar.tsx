"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";
import { LanguageToggle } from "./language-toggle";
import { useTranslation } from "@/lib/translations";
import { NotificationCenter } from "./notification-center";
import { motion } from "framer-motion";
import { 
  getMockUser, 
  setMockUserRole, 
  getMockRole, 
  signOutClient 
} from "@/lib/supabase/client";
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
import { Sparkles, BarChart3, Users, Briefcase, DollarSign, LogOut, Shield, Compass } from "lucide-react";

export function NavBar() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<Profile | null>(null);
  const [role, setRole] = useState<"business" | "influencer">("business");

  useEffect(() => {
    // Initial fetch
    setUser(getMockUser());
    setRole(getMockRole());

    // Listen to custom role-change event
    const handleRoleChange = () => {
      const updatedUser = getMockUser();
      setUser(updatedUser);
      setRole(updatedUser.role);
    };

    window.addEventListener("role-change", handleRoleChange);
    return () => window.removeEventListener("role-change", handleRoleChange);
  }, []);

  const handleRoleToggle = (newRole: "business" | "influencer") => {
    if (newRole === role) return;
    setMockUserRole(newRole);
    setRole(newRole);
    toast.success(`Switched role to ${newRole === "business" ? "Business / Brand" : "Influencer"}`, {
      description: `Viewing ${newRole === "business" ? "brand campaign manager" : "influencer work center"}.`,
    });
    
    // Redirect to the appropriate dashboard
    router.push(`/${newRole}/dashboard`);
  };

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
                    href="#"
                    className="px-3 py-1.5 rounded-full transition-all hover:text-foreground"
                  >
                    {t("Discover")}
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/influencer/dashboard"
                    className={`px-3 py-1.5 rounded-full transition-all hover:text-foreground ${
                      pathname === "/influencer/dashboard" ? "bg-secondary text-foreground" : ""
                    }`}
                  >
                    {t("Work Center")}
                  </Link>
                  <Link
                    href="/influencer/discover"
                    className={`px-3 py-1.5 rounded-full transition-all hover:text-foreground ${
                      pathname === "/influencer/discover" ? "bg-secondary text-foreground" : ""
                    }`}
                  >
                    {t("Discover")}
                  </Link>
                  <Link
                    href="/influencer/campaigns"
                    className={`px-3 py-1.5 rounded-full transition-all hover:text-foreground ${
                      pathname === "/influencer/campaigns" ? "bg-secondary text-foreground" : ""
                    }`}
                  >
                    {t("My Campaigns")}
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
              {/* Role Switcher Pill Selector (Apple iOS style) */}
              <div className="bg-secondary/60 p-[3px] rounded-full flex items-center border border-border/20 text-xs font-semibold select-none relative">
                <button
                  onClick={() => handleRoleToggle("business")}
                  className={`px-3 py-1.5 rounded-full transition-all cursor-pointer relative z-10 ${
                    role === "business"
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground/80 hover:text-foreground"
                  }`}
                >
                  {t("Brand")}
                  {role === "business" && (
                    <motion.div
                      layoutId="activeRoleTab"
                      className="absolute inset-0 bg-background rounded-full shadow-sm z-0 border border-border/10"
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    />
                  )}
                </button>
                <button
                  onClick={() => handleRoleToggle("influencer")}
                  className={`px-3 py-1.5 rounded-full transition-all cursor-pointer relative z-10 ${
                    role === "influencer"
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground/80 hover:text-foreground"
                  }`}
                >
                  {t("Creator")}
                  {role === "influencer" && (
                    <motion.div
                      layoutId="activeRoleTab"
                      className="absolute inset-0 bg-background rounded-full shadow-sm z-0 border border-border/10"
                      transition={{ type: "spring", stiffness: 350, damping: 25 }}
                    />
                  )}
                </button>
              </div>

              {/* Language Selector */}
              <LanguageToggle />

              {/* Theme Selector */}
              <ThemeToggle />

              {/* Notification Bell Dropdown */}
              <NotificationCenter />

              {/* Profile Avatar Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="relative w-8 h-8 rounded-full overflow-hidden p-0 border border-border/20 hover:scale-105 active:scale-95 transition-all cursor-pointer bg-transparent block focus:outline-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={user.avatar_url}
                    alt={user.full_name}
                    className="w-full h-full object-cover"
                  />
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
                  <DropdownMenuItem className="rounded-lg py-2 cursor-pointer gap-2" onClick={() => router.push(`/${role}/dashboard`)}>
                    <BarChart3 size={14} />
                    <span>{t("My Dashboard")}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-lg py-2 cursor-pointer gap-2" onClick={() => handleRoleToggle(role === "business" ? "influencer" : "business")}>
                    <Shield size={14} />
                    <span>{t("Switch Workspace")}</span>
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
              <ThemeToggle />
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
