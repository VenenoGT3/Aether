/**
 * Feature flags — PURE definitions + resolution (client + server safe).
 *
 * No server-only imports here so the client hook (lib/use-feature-flags) can
 * reuse the types + defaults. The remote (Upstash) read lives in the server-only
 * resolver lib/feature-flags.server.
 *
 * Precedence (highest first):
 *   1. Remote store (Upstash key `flags:<name>`) — instant runtime kill-switch
 *   2. Deploy-time env var `FEATURE_<NAME>` (e.g. FEATURE_ENABLE_REFERRALS=false)
 *   3. Safe default below
 */

export type FeatureFlag =
  | "enable_referrals"
  | "enable_challenges"
  | "enable_first_clip_bonus";

/** Safe defaults applied when neither the remote store nor env overrides a flag. */
export const FEATURE_FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  enable_referrals: true,
  enable_challenges: true,
  enable_first_clip_bonus: true,
};

export type FeatureFlags = Record<FeatureFlag, boolean>;

export const FEATURE_FLAG_NAMES = Object.keys(FEATURE_FLAG_DEFAULTS) as FeatureFlag[];

/** Coerce a stored/env value to a boolean, or null when unset/unrecognized. */
export function parseFlagValue(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toLowerCase();
  if (s === "") return null;
  if (["1", "true", "on", "yes", "enabled"].includes(s)) return true;
  if (["0", "false", "off", "no", "disabled"].includes(s)) return false;
  return null;
}

/** Deploy-time override from `FEATURE_<NAME>` env (null when unset/unrecognized). */
export function envFlagOverride(flag: FeatureFlag): boolean | null {
  return parseFlagValue(process.env[`FEATURE_${flag.toUpperCase()}`] ?? null);
}

/** Resolve final flags: remote override → env override → default. */
export function resolveFlags(
  remote: Partial<Record<FeatureFlag, boolean>> = {}
): FeatureFlags {
  const out = {} as FeatureFlags;
  for (const name of FEATURE_FLAG_NAMES) {
    const r = remote[name];
    if (typeof r === "boolean") {
      out[name] = r;
      continue;
    }
    const e = envFlagOverride(name);
    out[name] = e !== null ? e : FEATURE_FLAG_DEFAULTS[name];
  }
  return out;
}
