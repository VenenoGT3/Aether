import { getAyrshareApiKey, shouldSimulateViews } from "./env";
import type { ClipRow, ViewData } from "./types";

/**
 * View provider abstraction. In mock mode (or when AYRSHARE_API_KEY is unset)
 * we generate deterministic-ish growing view counts so the full
 * views -> snapshot -> earnings pipeline can be exercised without Ayrshare.
 */

/**
 * Simulate organic growth from the clip's current view count. Growth is a small
 * percentage plus a base, so repeated syncs produce a believable upward curve.
 */
export function simulateViewGrowth(currentViews: number): ViewData {
  const base = currentViews > 0 ? currentViews : 2_000 + Math.floor(Math.random() * 8_000);
  const growthPct = 0.05 + Math.random() * 0.15; // +5%..+20%
  const flat = 300 + Math.floor(Math.random() * 1_500);
  const views = Math.round(base * (1 + growthPct) + flat);

  return {
    views,
    likes: Math.round(views * 0.08),
    comments: Math.round(views * 0.01),
    shares: Math.round(views * 0.005),
    source: "simulated",
  };
}

/**
 * Fetch live metrics for a clip from Ayrshare's analytics endpoint.
 * Stubbed for Phase 4 — real linkage (profile keys / post ids) lands with the
 * Ayrshare account-connect flow. Falls back to simulated data on any failure.
 */
async function fetchAyrshareViews(clip: ClipRow): Promise<ViewData> {
  const apiKey = getAyrshareApiKey();
  if (!apiKey) return simulateViewGrowth(clip.current_views);

  try {
    const res = await fetch("https://api.ayrshare.com/api/analytics/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        id: clip.external_post_id ?? clip.post_url,
        platforms: [clip.platform],
      }),
    });

    if (!res.ok) {
      console.warn(
        `[views-provider] Ayrshare ${res.status} for clip ${clip.id}; using last-known views`
      );
      return {
        views: clip.current_views,
        likes: 0,
        comments: 0,
        shares: 0,
        source: "ayrshare",
      };
    }

    const json = (await res.json()) as Record<string, unknown>;
    const platformData = (json[clip.platform] ?? json) as Record<string, unknown>;
    const analytics = (platformData.analytics ?? platformData) as Record<
      string,
      unknown
    >;

    const num = (v: unknown): number =>
      typeof v === "number" && Number.isFinite(v) ? v : 0;

    return {
      views: num(analytics.views ?? analytics.playCount ?? analytics.impressions),
      likes: num(analytics.likeCount ?? analytics.likes),
      comments: num(analytics.commentsCount ?? analytics.comments),
      shares: num(analytics.shareCount ?? analytics.shares),
      source: "ayrshare",
    };
  } catch (err) {
    console.error(`[views-provider] Ayrshare fetch failed for clip ${clip.id}:`, err);
    return {
      views: clip.current_views,
      likes: 0,
      comments: 0,
      shares: 0,
      source: "ayrshare",
    };
  }
}

export async function fetchClipViews(clip: ClipRow): Promise<ViewData> {
  if (shouldSimulateViews()) {
    return simulateViewGrowth(clip.current_views);
  }
  return fetchAyrshareViews(clip);
}
