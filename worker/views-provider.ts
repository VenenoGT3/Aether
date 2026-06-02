import {
  getAyrshareApiKey,
  getAyrshareMinIntervalMs,
  isAyrshareEnabled,
  isMockMode,
} from "./env";
import { log, errMessage } from "./logger";
import { recordProviderError } from "./metrics";
import type { ClipRow, ViewData } from "./types";

/**
 * View-provider abstraction.
 *
 * CURRENT STATE: the SimulatedViewsProvider is the active default. It produces
 * believable growing view counts so the full views -> snapshot -> earnings
 * pipeline runs without any external API (mock mode, or no AYRSHARE_API_KEY).
 *
 * The AyrshareViewsProvider is REAL but UNVERIFIED — it is wired to Ayrshare's
 * analytics endpoint and only activates when isAyrshareEnabled() is true
 * (AYRSHARE_API_KEY set + AETHER_MOCK_MODE off). Switching to real tracking is
 * intended to be a single env change; no worker code changes required.
 *
 * Account linking note: real Ayrshare scopes analytics to a creator via a
 * "Profile-Key" (stored on profiles.ayrshare_profile_key) and a per-post id
 * (stored on clips.external_post_id / clips.ayrshare_ref). Those are captured by
 * the account-linking flow (placeholder today); the AyrshareViewsProvider reads
 * clip.external_post_id and will forward the creator's profile key once linking
 * is implemented.
 */

export interface ViewsProvider {
  readonly name: "ayrshare" | "simulated";
  fetchViews(clip: ClipRow): Promise<ViewData>;
}

/** Simulate organic growth from the clip's current view count. */
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

class SimulatedViewsProvider implements ViewsProvider {
  readonly name = "simulated" as const;
  async fetchViews(clip: ClipRow): Promise<ViewData> {
    return simulateViewGrowth(clip.current_views);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serializes Ayrshare calls with a minimum gap (basic client-side rate limiting). */
let throttleChain: Promise<unknown> = Promise.resolve();
function rateLimited<T>(fn: () => Promise<T>): Promise<T> {
  const gap = getAyrshareMinIntervalMs();
  const run = throttleChain.then(fn, fn);
  throttleChain = run.then(
    () => sleep(gap),
    () => sleep(gap)
  );
  return run as Promise<T>;
}

class AyrshareViewsProvider implements ViewsProvider {
  readonly name = "ayrshare" as const;

  async fetchViews(clip: ClipRow): Promise<ViewData> {
    const apiKey = getAyrshareApiKey();
    // Should not happen (provider selection guards this), but stay safe.
    if (!apiKey) return simulateViewGrowth(clip.current_views);

    const lastKnown: ViewData = {
      views: clip.current_views,
      likes: 0,
      comments: 0,
      shares: 0,
      source: "ayrshare",
    };

    try {
      const res = await rateLimited(() =>
        fetch("https://api.ayrshare.com/api/analytics/post", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            id: clip.external_post_id ?? clip.post_url,
            platforms: [clip.platform],
          }),
        })
      );

      // Honor rate limiting with a single backoff retry.
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after")) || 2;
        log.warn("views.ayrshare.rate_limited", { clipId: clip.id, retryAfterSec: retryAfter });
        await sleep(retryAfter * 1000);
        const retry = await rateLimited(() =>
          fetch("https://api.ayrshare.com/api/analytics/post", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              id: clip.external_post_id ?? clip.post_url,
              platforms: [clip.platform],
            }),
          })
        );
        if (!retry.ok) {
          recordProviderError();
          log.warn("views.ayrshare.http_error", {
            clipId: clip.id,
            status: retry.status,
            note: "retry failed; keeping last-known views",
          });
          return lastKnown;
        }
        return parseAyrshare(await retry.json(), clip.platform);
      }

      if (!res.ok) {
        recordProviderError();
        log.warn("views.ayrshare.http_error", {
          clipId: clip.id,
          status: res.status,
          note: "keeping last-known views",
        });
        return lastKnown;
      }

      return parseAyrshare(await res.json(), clip.platform);
    } catch (err) {
      recordProviderError();
      log.error("views.ayrshare.fetch_error", {
        clipId: clip.id,
        note: "keeping last-known views",
        error: errMessage(err),
      });
      return lastKnown;
    }
  }
}

/** Robustly parse an Ayrshare analytics payload into ViewData. */
function parseAyrshare(json: unknown, platform: string): ViewData {
  const root = (json ?? {}) as Record<string, unknown>;
  const platformData = (root[platform] ?? root) as Record<string, unknown>;
  const analytics = (platformData.analytics ?? platformData) as Record<string, unknown>;
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;

  return {
    views: num(analytics.views ?? analytics.playCount ?? analytics.impressions),
    likes: num(analytics.likeCount ?? analytics.likes),
    comments: num(analytics.commentsCount ?? analytics.comments),
    shares: num(analytics.shareCount ?? analytics.shares),
    source: "ayrshare",
  };
}

let cachedProvider: ViewsProvider | null = null;

/**
 * Returns the active views provider, logging the selection once so it's obvious
 * in the worker logs whether earnings are based on real or simulated views.
 */
export function getViewsProvider(): ViewsProvider {
  if (cachedProvider) return cachedProvider;

  if (isAyrshareEnabled()) {
    cachedProvider = new AyrshareViewsProvider();
    log.info("views.provider", {
      provider: "ayrshare",
      note: "REAL — earnings based on live views",
    });
  } else {
    cachedProvider = new SimulatedViewsProvider();
    log.info("views.provider", {
      provider: "simulated",
      reason: isMockMode ? "AETHER_MOCK_MODE=true" : "no AYRSHARE_API_KEY",
      note: "earnings based on simulated growth, NOT real views",
    });
  }
  return cachedProvider;
}

/** @deprecated Use getViewsProvider().fetchViews(clip). Kept for callers/tests. */
export function fetchClipViews(clip: ClipRow): Promise<ViewData> {
  return getViewsProvider().fetchViews(clip);
}
