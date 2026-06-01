"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { getMockUser, getMockRole } from "@/lib/supabase/client";
import { Profile } from "@/types";
import { LayoutDashboard, Compass, Layers, FileText } from "lucide-react";

export function MobileTabBar() {
  const pathname = usePathname();
  const [user, setUser] = useState<Profile | null>(null);
  const [role, setRole] = useState<"business" | "influencer">("business");

  useEffect(() => {
    // Initial load
    setUser(getMockUser());
    setRole(getMockRole());

    const handleRoleChange = () => {
      const updatedUser = getMockUser();
      setUser(updatedUser);
      setRole(updatedUser.role);
    };

    window.addEventListener("role-change", handleRoleChange);
    return () => window.removeEventListener("role-change", handleRoleChange);
  }, []);

  const isAuthPage = pathname?.startsWith("/auth");

  if (isAuthPage || !user) return null;

  const brandTabs = [
    {
      label: "Dashboard",
      href: "/business/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Campaigns",
      href: "/business/campaigns",
      icon: Layers,
    },
    {
      label: "Contracts",
      href: "/campaigns",
      icon: FileText,
    },
  ];

  const creatorTabs = [
    {
      label: "Work Center",
      href: "/influencer/dashboard",
      icon: LayoutDashboard,
    },
    {
      label: "Discover",
      href: "/influencer/discover",
      icon: Compass,
    },
    {
      label: "Campaigns",
      href: "/influencer/campaigns",
      icon: Layers,
    },
    {
      label: "Contracts",
      href: "/campaigns",
      icon: FileText,
    },
  ];

  const tabs = role === "business" ? brandTabs : creatorTabs;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-[420px] md:hidden">
      <nav className="glass-panel rounded-full py-2 px-3 flex items-center justify-around shadow-apple-lg border border-border/45">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="relative py-2 px-4 rounded-full flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer select-none"
            >
              {isActive && (
                <motion.div
                  layoutId="activeMobileTabIndicator"
                  className="absolute inset-0 bg-primary/10 dark:bg-primary/15 rounded-full z-0"
                  transition={{ type: "spring", stiffness: 350, damping: 28, mass: 0.8 }}
                />
              )}
              <Icon
                size={18}
                className={`relative z-10 transition-colors duration-250 ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              />
              <span
                className={`text-[9px] font-bold tracking-tight relative z-10 transition-colors duration-250 ${
                  isActive ? "text-primary font-extrabold" : "text-muted-foreground/80"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
