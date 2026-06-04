import {
  getAyrshareApiKey,
  getAyrshareMinIntervalMs,
  isAyrshareConfigured,
} from "./env";
import { log, errMessage } from "./logger";
import { recordProviderError } from "./metrics";
import { fetchWithRetry } from "./fetch-utils";
import type { ClipRow, ViewData } from "./types";

/**
 * View-provider abstraction.
 *
 * Aether is a performance platform: every billable view must come from a real,
 * verifiable source. The single provider is Ayrshare (live analytics), which
 * requires AYRSHARE_API_KEY. The worker hard-fails at startup without it
 * (see validateWorkerEnv) and the payout safety guard refuses to move money if
 * the key is ever removed at runtime — so earnings never accrue on unverified
 * views.
 *
 * Account linking note: Ayrshare scopes analytics to a creator via a
 * "Profile-Key" (stored on profiles.ayrshare_profile_key) and a per-post id
 * (stored on clips.external_post_id / clips.ayrshare_ref). The provider reads
 * clip.external_post_id and forwards the creator's profile key once the
 * account-linking flow captures it.
 */

export interface ViewsProvider {
  readonly name: "ayrshare";
  fetchViews(clip: ClipRow): Promise<ViewData>;
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
    // Provider selection guards this; stay defensive — never fabricate views.
    if (!apiKey) {
      throw new Error(
        "[worker] AYRSHARE_API_KEY is required for live view tracking."
      );
    }

    const lastKnown: ViewData = {
      views: clip.current_views,
      likes: 0,
      comments: 0,
      shares: 0,
      source: "ayrshare",
    };

    try {
      // Timeout (10s) so a hung Ayrshare can't stall view-sync, plus retry on
      // 429 (Retry-After honored) / 5xx / network blips with backoff + jitter.
      // The analytics query is read-only, so retrying is safe.
      const res = await rateLimited(() =>
        fetchWithRetry(
          "https://api.ayrshare.com/api/analytics/post",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              id: clip.external_post_id ?? clip.post_url,
              platforms: [clip.platform],
            }),
          },
          { attempts: 3, timeoutMs: 10_000, baseDelayMs: 500, maxDelayMs: 4_000 }
        )
      );

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
 * Returns the active views provider (Ayrshare), logging the selection once. Throws
 * a clear error if AYRSHARE_API_KEY is missing — the worker must never run the
 * earnings pipeline without a verifiable view source.
 */
export function getViewsProvider(): ViewsProvider {
  if (cachedProvider) return cachedProvider;

  if (!isAyrshareConfigured()) {
    throw new Error(
      "[worker] AYRSHARE_API_KEY is required for live view tracking — refusing to run the earnings pipeline on unverified views."
    );
  }

  cachedProvider = new AyrshareViewsProvider();
  log.info("views.provider", {
    provider: "ayrshare",
    note: "REAL — earnings based on live views",
  });
  return cachedProvider;
}

/** @deprecated Use getViewsProvider().fetchViews(clip). Kept for callers/tests. */
export function fetchClipViews(clip: ClipRow): Promise<ViewData> {
  return getViewsProvider().fetchViews(clip);
}
