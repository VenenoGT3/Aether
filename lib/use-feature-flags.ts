"use client";

import { useEffect, useState } from "react";
import { FEATURE_FLAG_DEFAULTS, type FeatureFlags } from "@/lib/feature-flags";

/**
 * Client hook for feature flags. Starts from the (typically enabled) defaults so
 * gated UI never flickers/hides on first paint, then reconciles with /api/flags.
 * Fails open: on any fetch error it keeps the defaults.
 */
export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>(FEATURE_FLAG_DEFAULTS);

  useEffect(() => {
    let active = true;
    fetch("/api/flags")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { flags?: FeatureFlags } | null) => {
        if (active && data?.flags) setFlags(data.flags);
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      active = false;
    };
  }, []);

  return flags;
}
