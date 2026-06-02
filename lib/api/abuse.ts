/** Hostnames allowed for deliverable / metrics post URLs */
export const ALLOWED_POST_HOSTS = [
  "instagram.com",
  "www.instagram.com",
  "instagr.am",
  "ig.me",
  "tiktok.com",
  "www.tiktok.com",
  "vm.tiktok.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "m.youtube.com",
] as const;

export function isAllowedPostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_POST_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

/** Strip characters that are risky in ilike / log injection */
export function sanitizeSearchQuery(q: string): string {
  return q.replace(/[%_\\<>{}]/g, "").trim();
}

/** Block obvious bot payloads in free-text search */
export function isSuspiciousSearchQuery(q: string): boolean {
  if (!q) return false;
  if (q.length > 200) return true;
  if (/(\bselect\b|\bunion\b|\bdrop\b|javascript:|data:)/i.test(q)) return true;
  return false;
}