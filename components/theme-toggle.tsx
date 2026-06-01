"use client";

import { useTheme } from "@/lib/theme-provider";
import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon, Laptop } from "lucide-react";

export function ThemeToggle() {
  const { isPinned, isDark, toggleTheme, systemTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative flex items-center justify-between p-1 bg-secondary/80 backdrop-blur-md border border-border/40 rounded-full w-16 h-8 cursor-pointer overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95"
      aria-label="Toggle Color Scheme"
    >
      <div className="absolute inset-y-1 left-1 right-1 flex items-center justify-between px-1 text-muted-foreground/60 z-0 pointer-events-none">
        <Sun size={14} className={isDark ? "opacity-100" : "opacity-0"} />
        <Moon size={14} className={!isDark ? "opacity-100" : "opacity-0"} />
      </div>

      <motion.div
        className="flex items-center justify-center w-6 h-6 bg-background rounded-full shadow-sm z-10 border border-border/10"
        layout
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 25,
          mass: 0.8
        }}
        animate={{
          x: isDark ? 32 : 0
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.div
              key="moon"
              initial={{ scale: 0.5, rotate: -45, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0.5, rotate: 45, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Moon size={12} className="text-[#007AFF] fill-[#007AFF]/10" />
            </motion.div>
          ) : (
            <motion.div
              key="sun"
              initial={{ scale: 0.5, rotate: 45, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0.5, rotate: -45, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Sun size={12} className="text-[#FF9500] fill-[#FF9500]/10" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Tiny marker at the bottom/top showing if we are in System mode */}
      {!isPinned && (
        <span className="absolute bottom-[2px] left-[50%] translate-x-[-50%] w-1 h-1 bg-[#34C759] rounded-full" title="Following System Preferences" />
      )}
    </button>
  );
}
