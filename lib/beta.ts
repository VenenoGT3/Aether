import type { SocialPlatform } from "./social-post";

/**
 * Single source of truth for which platforms the beta accepts.
 *
 * Defaults to the YouTube-only beta. Expanding (e.g. re-enabling TikTok) is a
 * config change — BETA_PLATFORMS=youtube,tiktok — plus whatever verification
 * the new platform needs in clip-submit; nothing else should hardcode the set.
 *
 * Imported by both the Next.js app and the worker (plain relative import — no
 * "server-only", no path alias), so keep it dependency-free.
 */

const KNOWN_PLATFORMS: readonly SocialPlatform[] = ["youtube", "tiktok", "instagram"];
const DEFAULT_BETA_PLATFORMS: readonly SocialPlatform[] = ["youtube"];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  youtube: "YouTube Shorts",
  tiktok: "TikTok",
  instagram: "Instagram Reels",
};

export function getBetaPlatforms(): SocialPlatform[] {
  const raw = process.env.BETA_PLATFORMS?.trim();
  if (!raw) return [...DEFAULT_BETA_PLATFORMS];
  const parsed = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is SocialPlatform =>
      (KNOWN_PLATFORMS as readonly string[]).includes(value)
    );
  return parsed.length > 0 ? [...new Set(parsed)] : [...DEFAULT_BETA_PLATFORMS];
}

export function isPlatformInBeta(platform: string): boolean {
  return (getBetaPlatforms() as string[]).includes(platform);
}

/** Human-readable list for user-facing copy, e.g. "YouTube Shorts". */
export function betaPlatformsLabel(): string {
  return getBetaPlatforms()
    .map((platform) => PLATFORM_LABELS[platform])
    .join(", ");
}
