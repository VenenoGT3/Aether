import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ClipRow } from "../types";

const clip: ClipRow = {
  id: "clip1",
  campaign_id: "camp1",
  participation_id: "part1",
  creator_id: "creator1",
  platform: "tiktok",
  post_url: "https://www.tiktok.com/@x/video/1",
  external_post_id: "p1",
  view_provider: null,
  creator_social_account_id: null,
  status: "approved",
  counted_views: 100,
  current_views: 100,
  last_synced_at: null,
  submitted_at: null,
  fraud_score: 0,
  fraud_score_updated_at: null,
  fraud_overridden: false,
};

describe("worker/views-provider getViewsProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.AYRSHARE_API_KEY;
    delete process.env.YOUTUBE_DATA_API_KEY;
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
    vi.restoreAllMocks();
    vi.doUnmock("../fetch-utils");
    vi.doUnmock("../supabase");
  });

  it("throws when no trusted view provider is configured", async () => {
    delete process.env.AYRSHARE_API_KEY;
    delete process.env.YOUTUBE_DATA_API_KEY;
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
    const { getViewsProvider } = await import("../views-provider");
    expect(() => getViewsProvider()).toThrow(/YOUTUBE_DATA_API_KEY/);
  });

  it("returns the routing provider when an official key is configured", async () => {
    process.env.YOUTUBE_DATA_API_KEY = "youtube-key";
    const { getViewsProvider } = await import("../views-provider");
    expect(getViewsProvider().name).toBe("router");
  });

  it("parses official YouTube statistics into trusted ViewData", async () => {
    process.env.YOUTUBE_DATA_API_KEY = "youtube-key";
    vi.doMock("../supabase", () => ({
      getServiceClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      maybeSingle: async () => ({
                        data: {
                          id: "account1",
                          user_id: "creator1",
                          platform: "youtube",
                          provider: "youtube_official",
                          external_account_id: "channel1",
                          access_token: null,
                          refresh_token: null,
                          scopes: [],
                          token_expires_at: null,
                          refresh_expires_at: null,
                          status: "active",
                        },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));
    vi.doMock("../fetch-utils", () => ({
      fetchWithRetry: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              snippet: {
                channelId: "channel1",
              },
              statistics: {
                viewCount: "12345",
                likeCount: "678",
                commentCount: "90",
              },
            },
          ],
        }),
      })),
    }));

    const { getViewsProvider } = await import("../views-provider");
    const data = await getViewsProvider().fetchViews({
      ...clip,
      platform: "youtube",
      post_url: "https://www.youtube.com/shorts/abc123xyz99",
      external_post_id: "abc123xyz99",
      creator_social_account_id: "account1",
      view_provider: "youtube_official",
    });

    expect(data.source).toBe("youtube_official");
    expect(data.trusted).toBe(true);
    expect(data.views).toBe(12_345);
    expect(data.likes).toBe(678);
    expect(data.comments).toBe(90);
    expect(data.shares).toBe(0);
  });

  it("does not treat Ayrshare alone as trusted during YouTube-only beta", async () => {
    process.env.AYRSHARE_API_KEY = "real-key";
    const { getViewsProvider } = await import("../views-provider");
    expect(() => getViewsProvider()).toThrow(/YOUTUBE_DATA_API_KEY|trusted view provider/);
  });
});
