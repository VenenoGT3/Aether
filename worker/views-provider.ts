import {
  getAyrshareApiKey,
  getConfiguredViewProviderNames,
  getSocialTokenEncryptionKey,
  getTiktokClientKey,
  getTiktokClientSecret,
  getViewProviderMinIntervalMs,
  getYoutubeDataApiKey,
  isAyrshareConfigured,
  isTiktokConfigured,
  isTrustedViewSourceConfigured,
  isYoutubeConfigured,
} from "./env";
import {
  decryptToken,
  encryptToken,
} from "../supabase/functions/_shared/token-crypto";
import { log, errMessage } from "./logger";
import { recordProviderError } from "./metrics";
import { fetchWithRetry } from "./fetch-utils";
import { getServiceClient } from "./supabase";
import { extractPlatformPostId } from "../lib/social-post";
import type { ClipRow, ViewData, ViewProviderName } from "./types";

/**
 * View-provider abstraction.
 *
 * Aether is a performance platform: every billable view must come from a real,
 * verifiable source. The router prefers official first-party APIs for platforms
 * where we can use them directly:
 *   - YouTube Data API v3 (`videos.list?part=statistics`)
 *   - TikTok Display API (`/v2/video/query/`, creator OAuth `video.list`)
 *
 * Ayrshare remains as a configured fallback/aggregator. Provider failures return
 * last-known metrics with `trusted=false`, so the sync can record visibility but
 * the earnings pipeline will not accrue from stale or unverified data.
 */

export interface ViewsProvider {
  readonly name: "router";
  fetchViews(clip: ClipRow): Promise<ViewData>;
}

type SocialAccountRow = {
  id: string;
  user_id: string;
  platform: string;
  provider: string;
  external_account_id: string;
  access_token: string | null;
  refresh_token: string | null;
  scopes: string[] | null;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  status: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const throttleChains = new Map<ViewProviderName, Promise<unknown>>();

/** Serializes provider calls with a provider-specific minimum gap. */
function rateLimited<T>(
  provider: ViewProviderName,
  fn: () => Promise<T>
): Promise<T> {
  const gap = getViewProviderMinIntervalMs(provider);
  const previous = throttleChains.get(provider) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  throttleChains.set(
    provider,
    run.then(
      () => sleep(gap),
      () => sleep(gap)
    )
  );
  return run as Promise<T>;
}

function lastKnown(clip: ClipRow, source: ViewProviderName): ViewData {
  return {
    views: clip.current_views,
    likes: 0,
    comments: 0,
    shares: 0,
    source,
    trusted: false,
  };
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

class YoutubeOfficialViewsProvider {
  readonly name = "youtube_official" as const;

  async fetchViews(clip: ClipRow): Promise<ViewData> {
    const apiKey = getYoutubeDataApiKey();
    if (!apiKey) return lastKnown(clip, this.name);

    const videoId =
      clip.external_post_id ?? extractPlatformPostId("youtube", clip.post_url);
    if (!videoId) {
      recordProviderError();
      log.warn("views.youtube.missing_video_id", {
        clipId: clip.id,
        postUrl: clip.post_url,
      });
      return lastKnown(clip, this.name);
    }

    const account = await loadYouTubeAccountForClip(clip);
    if (!account) {
      log.warn("views.youtube.account_missing", {
        clipId: clip.id,
        creatorId: clip.creator_id,
        note: "creator must submit with a connected YouTube channel before payout-grade polling",
      });
      return lastKnown(clip, this.name);
    }

    const params = new URLSearchParams({
      part: "snippet,statistics",
      id: videoId,
      key: apiKey,
      fields:
        "items(id,snippet(channelId),statistics(viewCount,likeCount,commentCount))",
    });

    try {
      const res = await rateLimited(this.name, () =>
        fetchWithRetry(
          `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
          { method: "GET" },
          { attempts: 3, timeoutMs: 10_000, baseDelayMs: 500, maxDelayMs: 4_000 }
        )
      );

      if (!res.ok) {
        recordProviderError();
        log.warn("views.youtube.http_error", {
          clipId: clip.id,
          status: res.status,
          note: "keeping last-known views",
        });
        return lastKnown(clip, this.name);
      }

      const json = (await res.json()) as {
        items?: Array<{
          snippet?: {
            channelId?: string;
          };
          statistics?: {
            viewCount?: string;
            likeCount?: string;
            commentCount?: string;
          };
        }>;
      };
      const item = json.items?.[0];
      const stats = item?.statistics;
      if (!item?.snippet?.channelId || !stats) {
        recordProviderError();
        log.warn("views.youtube.video_missing", {
          clipId: clip.id,
          videoId,
          note: "keeping last-known views",
        });
        return lastKnown(clip, this.name);
      }
      if (item.snippet.channelId !== account.external_account_id) {
        recordProviderError();
        log.alert("views.youtube.channel_mismatch", {
          clipId: clip.id,
          accountId: account.id,
          expectedChannelId: account.external_account_id,
          actualChannelId: item.snippet.channelId,
        });
        return lastKnown(clip, this.name);
      }

      return {
        views: num(stats.viewCount),
        likes: num(stats.likeCount),
        comments: num(stats.commentCount),
        shares: 0,
        source: this.name,
        trusted: true,
      };
    } catch (err) {
      recordProviderError();
      log.error("views.youtube.fetch_error", {
        clipId: clip.id,
        note: "keeping last-known views",
        error: errMessage(err),
      });
      return lastKnown(clip, this.name);
    }
  }
}

async function loadYouTubeAccountForClip(
  clip: ClipRow
): Promise<SocialAccountRow | null> {
  if (!clip.creator_social_account_id) return null;

  const { data, error } = await getServiceClient()
    .from("creator_social_accounts")
    .select("id, user_id, platform, provider, access_token, refresh_token, scopes, token_expires_at, refresh_expires_at, status, external_account_id")
    .eq("id", clip.creator_social_account_id)
    .eq("user_id", clip.creator_id)
    .eq("platform", "youtube")
    .eq("provider", "youtube_official")
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    log.warn("views.youtube.account_lookup_error", {
      clipId: clip.id,
      accountId: clip.creator_social_account_id,
      error: error.message,
    });
    return null;
  }

  return (data as SocialAccountRow | null) ?? null;
}

class TikTokOfficialViewsProvider {
  readonly name = "tiktok_official" as const;

  async fetchViews(clip: ClipRow): Promise<ViewData> {
    if (!isTiktokConfigured()) return lastKnown(clip, this.name);

    const videoId =
      clip.external_post_id ?? extractPlatformPostId("tiktok", clip.post_url);
    if (!videoId) {
      recordProviderError();
      log.warn("views.tiktok.missing_video_id", {
        clipId: clip.id,
        postUrl: clip.post_url,
      });
      return lastKnown(clip, this.name);
    }

    const account = await loadTikTokAccountForClip(clip);
    if (!account) {
      log.warn("views.tiktok.account_missing", {
        clipId: clip.id,
        creatorId: clip.creator_id,
        note: "creator must connect TikTok with video.list scope before direct polling",
      });
      return lastKnown(clip, this.name);
    }

    if (account.scopes && !account.scopes.includes("video.list")) {
      log.warn("views.tiktok.scope_missing", {
        clipId: clip.id,
        accountId: account.id,
        scopes: account.scopes,
        note: "creator must grant video.list before direct polling",
      });
      return lastKnown(clip, this.name);
    }

    const accessToken = await getFreshTikTokAccessToken(account);
    if (!accessToken) {
      recordProviderError();
      log.warn("views.tiktok.token_missing", {
        clipId: clip.id,
        accountId: account.id,
        note: "keeping last-known views",
      });
      return lastKnown(clip, this.name);
    }

    const params = new URLSearchParams({
      fields: "id,view_count,like_count,comment_count,share_count,share_url",
    });

    try {
      const res = await rateLimited(this.name, () =>
        fetchWithRetry(
          `https://open.tiktokapis.com/v2/video/query/?${params.toString()}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ filters: { video_ids: [videoId] } }),
          },
          { attempts: 3, timeoutMs: 10_000, baseDelayMs: 500, maxDelayMs: 4_000 }
        )
      );

      if (!res.ok) {
        recordProviderError();
        log.warn("views.tiktok.http_error", {
          clipId: clip.id,
          status: res.status,
          note: "keeping last-known views",
        });
        return lastKnown(clip, this.name);
      }

      const json = (await res.json()) as {
        data?: {
          videos?: Array<{
            id?: string;
            view_count?: number;
            like_count?: number;
            comment_count?: number;
            share_count?: number;
          }>;
        };
        error?: { code?: string; message?: string };
      };
      const video = json.data?.videos?.find((v) => v.id === videoId);
      if (!video || (json.error?.code && json.error.code !== "ok")) {
        recordProviderError();
        log.warn("views.tiktok.video_missing", {
          clipId: clip.id,
          videoId,
          providerCode: json.error?.code,
          note: "keeping last-known views",
        });
        return lastKnown(clip, this.name);
      }

      return {
        views: num(video.view_count),
        likes: num(video.like_count),
        comments: num(video.comment_count),
        shares: num(video.share_count),
        source: this.name,
        trusted: true,
      };
    } catch (err) {
      recordProviderError();
      log.error("views.tiktok.fetch_error", {
        clipId: clip.id,
        note: "keeping last-known views",
        error: errMessage(err),
      });
      return lastKnown(clip, this.name);
    }
  }
}

class AyrshareViewsProvider {
  readonly name = "ayrshare" as const;

  async fetchViews(clip: ClipRow): Promise<ViewData> {
    const apiKey = getAyrshareApiKey();
    if (!apiKey) return lastKnown(clip, this.name);

    try {
      const res = await rateLimited(this.name, () =>
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
        return lastKnown(clip, this.name);
      }

      return parseAyrshare(await res.json(), clip.platform);
    } catch (err) {
      recordProviderError();
      log.error("views.ayrshare.fetch_error", {
        clipId: clip.id,
        note: "keeping last-known views",
        error: errMessage(err),
      });
      return lastKnown(clip, this.name);
    }
  }
}

class RoutingViewsProvider implements ViewsProvider {
  readonly name = "router" as const;
  private readonly youtube = new YoutubeOfficialViewsProvider();
  private readonly tiktok = new TikTokOfficialViewsProvider();
  private readonly ayrshare = new AyrshareViewsProvider();

  async fetchViews(clip: ClipRow): Promise<ViewData> {
    const candidates = this.candidatesFor(clip);
    let last: ViewData | null = null;

    for (const provider of candidates) {
      const data = await provider.fetchViews(clip);
      if (data.trusted) return data;
      last = data;
    }

    return last ?? lastKnown(clip, fallbackSourceFor(clip));
  }

  private candidatesFor(clip: ClipRow): Array<{
    fetchViews(clip: ClipRow): Promise<ViewData>;
  }> {
    const preferred = clip.view_provider;
    const providers: Array<{
      name: ViewProviderName;
      configured: boolean;
      provider: { fetchViews(clip: ClipRow): Promise<ViewData> };
    }> = [
      {
        name: "youtube_official",
        configured: isYoutubeConfigured(),
        provider: this.youtube,
      },
      {
        name: "tiktok_official",
        configured: isTiktokConfigured(),
        provider: this.tiktok,
      },
      {
        name: "ayrshare",
        configured: isAyrshareConfigured(),
        provider: this.ayrshare,
      },
    ];

    const platformDefault =
      clip.platform === "youtube"
        ? "youtube_official"
        : clip.platform === "tiktok"
          ? "tiktok_official"
          : null;

    const orderedNames = [preferred, platformDefault].filter(Boolean) as ViewProviderName[];

    const ordered = new Set<ViewProviderName>(orderedNames);
    return providers
      .filter((p) => p.configured && ordered.has(p.name))
      .sort((a, b) => {
        const ai = orderedNames.indexOf(a.name);
        const bi = orderedNames.indexOf(b.name);
        return ai - bi;
      })
      .map((p) => p.provider);
  }
}

async function loadTikTokAccountForClip(
  clip: ClipRow
): Promise<SocialAccountRow | null> {
  const supabase = getServiceClient();
  const columns =
    "id, user_id, platform, provider, external_account_id, access_token, refresh_token, scopes, token_expires_at, refresh_expires_at, status";

  if (clip.creator_social_account_id) {
    const { data, error } = await supabase
      .from("creator_social_accounts")
      .select(columns)
      .eq("id", clip.creator_social_account_id)
      .eq("platform", "tiktok")
      .eq("provider", "tiktok_official")
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      log.warn("views.tiktok.account_lookup_error", {
        clipId: clip.id,
        accountId: clip.creator_social_account_id,
        error: error.message,
      });
      return null;
    }
    return (data as SocialAccountRow | null) ?? null;
  }

  const { data, error } = await supabase
    .from("creator_social_accounts")
    .select(columns)
    .eq("user_id", clip.creator_id)
    .eq("platform", "tiktok")
    .eq("provider", "tiktok_official")
    .eq("status", "active")
    .order("last_verified_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.warn("views.tiktok.account_lookup_error", {
      clipId: clip.id,
      creatorId: clip.creator_id,
      error: error.message,
    });
    return null;
  }
  return (data as SocialAccountRow | null) ?? null;
}

/** Stored tokens may be enc:v1 (AES-GCM) or legacy plaintext. Decrypt failures degrade to "token unavailable" — never to a garbage token. */
async function readStoredToken(
  value: string | null,
  accountId: string,
  kind: "access" | "refresh"
): Promise<string | null> {
  if (!value) return null;
  try {
    return await decryptToken(value, getSocialTokenEncryptionKey());
  } catch (err) {
    log.warn("views.token.decrypt_error", {
      accountId,
      kind,
      error: errMessage(err),
    });
    return null;
  }
}

async function getFreshTikTokAccessToken(
  account: SocialAccountRow
): Promise<string | null> {
  const storedAccessToken = await readStoredToken(account.access_token, account.id, "access");
  if (
    storedAccessToken &&
    (!account.token_expires_at ||
      new Date(account.token_expires_at).getTime() > Date.now() + 5 * 60_000)
  ) {
    return storedAccessToken;
  }

  const refreshToken = await readStoredToken(account.refresh_token, account.id, "refresh");
  if (!refreshToken) return null;
  const clientKey = getTiktokClientKey();
  const clientSecret = getTiktokClientSecret();
  if (!clientKey || !clientSecret) return null;

  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await rateLimited("tiktok_official", () =>
    fetchWithRetry(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
        body,
      },
      { attempts: 3, timeoutMs: 10_000, baseDelayMs: 500, maxDelayMs: 4_000 }
    )
  );

  if (!res.ok) {
    recordProviderError();
    log.warn("views.tiktok.refresh_http_error", {
      accountId: account.id,
      status: res.status,
    });
    return null;
  }

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!json.access_token || json.error) {
    recordProviderError();
    log.warn("views.tiktok.refresh_error", {
      accountId: account.id,
      error: json.error,
      description: json.error_description,
    });
    return null;
  }

  const now = Date.now();
  const tokenExpiresAt =
    typeof json.expires_in === "number"
      ? new Date(now + json.expires_in * 1000).toISOString()
      : null;
  const refreshExpiresAt =
    typeof json.refresh_expires_in === "number"
      ? new Date(now + json.refresh_expires_in * 1000).toISOString()
      : null;

  // Persist new tokens encrypted when the key is configured. A rotated refresh
  // token is encrypted fresh; absent rotation, the stored value is kept as-is
  // (it is already in its at-rest form — re-encrypting would double-wrap it).
  const encryptionKey = getSocialTokenEncryptionKey();
  const persistedAccessToken = encryptionKey
    ? await encryptToken(json.access_token, encryptionKey)
    : json.access_token;
  const persistedRefreshToken = json.refresh_token
    ? encryptionKey
      ? await encryptToken(json.refresh_token, encryptionKey)
      : json.refresh_token
    : account.refresh_token;

  const { error } = await getServiceClient()
    .from("creator_social_accounts")
    .update({
      access_token: persistedAccessToken,
      refresh_token: persistedRefreshToken,
      scopes: json.scope ? json.scope.split(",").map((s) => s.trim()) : account.scopes ?? [],
      token_expires_at: tokenExpiresAt,
      refresh_expires_at: refreshExpiresAt,
      last_verified_at: new Date(now).toISOString(),
      status: "active",
    })
    .eq("id", account.id);
  if (error) {
    log.warn("views.tiktok.refresh_persist_error", {
      accountId: account.id,
      error: error.message,
    });
  }

  return json.access_token;
}

/** Robustly parse an Ayrshare analytics payload into ViewData. */
function parseAyrshare(json: unknown, platform: string): ViewData {
  const root = (json ?? {}) as Record<string, unknown>;
  const platformData = (root[platform] ?? root) as Record<string, unknown>;
  const analytics = (platformData.analytics ?? platformData) as Record<string, unknown>;

  return {
    views: num(analytics.views ?? analytics.playCount ?? analytics.impressions),
    likes: num(analytics.likeCount ?? analytics.likes),
    comments: num(analytics.commentsCount ?? analytics.comments),
    shares: num(analytics.shareCount ?? analytics.shares),
    source: "ayrshare",
    trusted: true,
  };
}

function fallbackSourceFor(clip: ClipRow): ViewProviderName {
  if (clip.platform === "youtube") return "youtube_official";
  if (clip.platform === "tiktok") return "tiktok_official";
  return "ayrshare";
}

let cachedProvider: ViewsProvider | null = null;

/**
 * Returns the active provider router. Throws when no trusted view source is
 * configured; the worker must never run the earnings pipeline without at least
 * one verifiable metrics source.
 */
export function getViewsProvider(): ViewsProvider {
  if (cachedProvider) return cachedProvider;

  if (!isTrustedViewSourceConfigured()) {
    throw new Error(
      "[worker] Configure YOUTUBE_DATA_API_KEY before running the YouTube-only earnings pipeline."
    );
  }

  cachedProvider = new RoutingViewsProvider();
  log.info("views.provider", {
    providers: getConfiguredViewProviderNames(),
    note: "REAL — earnings based on trusted live views only",
  });
  return cachedProvider;
}

/** @deprecated Use getViewsProvider().fetchViews(clip). Kept for callers/tests. */
export function fetchClipViews(clip: ClipRow): Promise<ViewData> {
  return getViewsProvider().fetchViews(clip);
}
