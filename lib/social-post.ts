export type SocialPlatform = "instagram" | "tiktok" | "youtube";

export type TrustedViewProviderName =
  | "youtube_official"
  | "tiktok_official"
  | "ayrshare";

export const BETA_CLIP_PLATFORM: SocialPlatform = "youtube";
export const PAYOUT_VIEW_BLOCK_SIZE = 1000;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

const TIKTOK_HOST_SUFFIX = "tiktok.com";

export function detectSocialPlatform(
  postUrl: string,
  explicit?: SocialPlatform
): SocialPlatform {
  if (explicit) return explicit;
  const lower = postUrl.toLowerCase();
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  return "instagram";
}

export function isYoutubePostUrl(postUrl: string): boolean {
  return detectSocialPlatform(postUrl) === BETA_CLIP_PLATFORM &&
    extractYoutubeVideoId(postUrl) !== null;
}

export function defaultViewProviderForPlatform(
  platform: SocialPlatform
): TrustedViewProviderName | null {
  if (platform === "youtube") return "youtube_official";
  if (platform === "tiktok") return "tiktok_official";
  return null;
}

export function extractPlatformPostId(
  platform: SocialPlatform | string,
  postUrl: string
): string | null {
  if (platform === "youtube") return extractYoutubeVideoId(postUrl);
  if (platform === "tiktok") return extractTikTokVideoId(postUrl);
  return null;
}

export function extractYoutubeVideoId(postUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(postUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;

  const fromQuery = cleanYoutubeId(url.searchParams.get("v"));
  if (fromQuery) return fromQuery;

  const segments = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return cleanYoutubeId(segments[0]);

  for (const marker of ["shorts", "embed", "live", "v"]) {
    const idx = segments.indexOf(marker);
    const id = idx >= 0 ? cleanYoutubeId(segments[idx + 1]) : null;
    if (id) return id;
  }

  return null;
}

export function extractTikTokVideoId(postUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(postUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  if (!host.endsWith(TIKTOK_HOST_SUFFIX)) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  for (const marker of ["video", "v"]) {
    const idx = segments.indexOf(marker);
    const id = idx >= 0 ? cleanTikTokId(segments[idx + 1]) : null;
    if (id) return id;
  }

  // Some TikTok canonical URLs place the numeric ID as the final path segment.
  for (let i = segments.length - 1; i >= 0; i--) {
    const id = cleanTikTokId(segments[i]);
    if (id) return id;
  }

  return null;
}

function cleanYoutubeId(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim().split(/[?&#/]/)[0] ?? "";
  return /^[A-Za-z0-9_-]{6,64}$/.test(candidate) ? candidate : null;
}

function cleanTikTokId(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.trim().split(/[?&#/]/)[0] ?? "";
  return /^\d{8,32}$/.test(candidate) ? candidate : null;
}
