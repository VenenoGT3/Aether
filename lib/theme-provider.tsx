"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "system" | "pinned";

interface ThemeContextType {
  isPinned: boolean;
  isDark: boolean;
  systemTheme: "light" | "dark";
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isPinned, setIsPinned] = useState<boolean>(false);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("dark");
  const [isDark, setIsDark] = useState<boolean>(true);

  // Initialize theme status on mount
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    root.style.colorScheme = "dark";
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.setAttribute("content", "dark");
  }, []);

  const toggleTheme = () => {
    // Permanent dark theme
  };

  return (
    <ThemeContext.Provider value={{ isPinned: false, isDark: true, systemTheme: "dark", toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
