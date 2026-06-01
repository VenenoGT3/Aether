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
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  const [isDark, setIsDark] = useState<boolean>(false);

  const updateDOM = (dark: boolean) => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="color-scheme"]');
    
    if (dark) {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
      if (meta) meta.setAttribute("content", "dark");
    } else {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
      if (meta) meta.setAttribute("content", "light");
    }
  };

  // Initialize theme status on mount
  useEffect(() => {
    try {
      const pinned = localStorage.getItem("aether-theme-pinned") === "true";
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const currentSystemDark = mediaQuery.matches;

      setIsPinned(pinned);
      setSystemTheme(currentSystemDark ? "dark" : "light");
      
      const resolvedDark = pinned ? !currentSystemDark : currentSystemDark;
      setIsDark(resolvedDark);

      // Apply initial theme classes (for hydration match support)
      updateDOM(resolvedDark);
    } catch (e) {
      console.error("Failed to read theme from localStorage", e);
    }
  }, []);

  // Listen to system changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    
    const handleChange = (e: MediaQueryListEvent) => {
      const currentSystemDark = e.matches;
      setSystemTheme(currentSystemDark ? "dark" : "light");
      
      // If NOT pinned, adapt to system change. If pinned, adapt opposite of new system.
      const resolvedDark = isPinned ? !currentSystemDark : currentSystemDark;
      setIsDark(resolvedDark);
      updateDOM(resolvedDark);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [isPinned]);

  const toggleTheme = () => {
    const newPinned = !isPinned;
    setIsPinned(newPinned);
    localStorage.setItem("aether-theme-pinned", newPinned ? "true" : "false");

    const resolvedDark = newPinned ? !window.matchMedia("(prefers-color-scheme: dark)").matches : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDark(resolvedDark);
    updateDOM(resolvedDark);
  };

  return (
    <ThemeContext.Provider value={{ isPinned, isDark, systemTheme, toggleTheme }}>
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
