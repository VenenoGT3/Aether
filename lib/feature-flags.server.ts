/**
 * Server-only feature-flag resolver. Reads runtime overrides from Upstash (the
 * same REST client used for caching/rate-limiting) and layers them over env +
 * defaults. Process-cached for a short TTL so we don't MGET on every request,
 * and fail-open: any Redis trouble falls back to env/defaults.
 *
 * To flip a flag at runtime without a redeploy, set the Upstash key, e.g.:
 *   SET flags:enable_referrals false
 */

import "server-only";
import { isRedisConfigured, redisCommand } from "@/lib/redis/rest-client";
import {
  FEATURE_FLAG_NAMES,
  parseFlagValue,
  resolveFlags,
  type FeatureFlag,
  type FeatureFlags,
} from "@/lib/feature-flags";

const TTL_MS = 30_000;
let cache: { flags: FeatureFlags; expires: number } | null = null;

async function remoteOverrides(): Promise<Partial<Record<FeatureFlag, boolean>>> {
  const out: Partial<Record<FeatureFlag, boolean>> = {};
  if (!isRedisConfigured()) return out;
  try {
    const keys = FEATURE_FLAG_NAMES.map((f) => `flags:${f}`);
    const res = await redisCommand(["MGET", ...keys]);
    if (res.ok && Array.isArray(res.result)) {
      res.result.forEach((val, i) => {
        const parsed = parseFlagValue(val);
        if (parsed !== null) out[FEATURE_FLAG_NAMES[i]] = parsed;
      });
    }
  } catch {
    /* fail open → env/defaults */
  }
  return out;
}

/** Resolved flags (remote → env → default), cached per-process for {@link TTL_MS}. */
export async function getFeatureFlags(force = false): Promise<FeatureFlags> {
  if (!force && cache && cache.expires > Date.now()) return cache.flags;
  const flags = resolveFlags(await remoteOverrides());
  cache = { flags, expires: Date.now() + TTL_MS };
  return flags;
}

export async function isFeatureEnabled(flag: FeatureFlag): Promise<boolean> {
  return (await getFeatureFlags())[flag];
}
