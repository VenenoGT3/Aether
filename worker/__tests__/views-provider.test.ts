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
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("throws when AYRSHARE_API_KEY is missing (never fabricates views)", async () => {
    delete process.env.AYRSHARE_API_KEY;
    const { getViewsProvider } = await import("../views-provider");
    expect(() => getViewsProvider()).toThrow(/AYRSHARE_API_KEY/);
  });

  it("returns the live Ayrshare provider when a key is configured", async () => {
    process.env.AYRSHARE_API_KEY = "real-key";
    const { getViewsProvider } = await import("../views-provider");
    expect(getViewsProvider().name).toBe("ayrshare");
  });

  it("parses live Ayrshare analytics into ViewData", async () => {
    process.env.AYRSHARE_API_KEY = "real-key";
    // Mock the external Ayrshare HTTP call only — the parsing/mapping is real.
    vi.doMock("../fetch-utils", () => ({
      fetchWithRetry: vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          tiktok: {
            analytics: {
              views: 12_345,
              likeCount: 678,
              commentsCount: 90,
              shareCount: 12,
            },
          },
        }),
      })),
    }));

    const { getViewsProvider } = await import("../views-provider");
    const data = await getViewsProvider().fetchViews(clip);

    expect(data.source).toBe("ayrshare");
    expect(data.views).toBe(12_345);
    expect(data.likes).toBe(678);
    expect(data.comments).toBe(90);
    expect(data.shares).toBe(12);
  });

  it("keeps the last-known view count when Ayrshare returns a non-OK response", async () => {
    process.env.AYRSHARE_API_KEY = "real-key";
    vi.doMock("../fetch-utils", () => ({
      fetchWithRetry: vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({}),
      })),
    }));

    const { getViewsProvider } = await import("../views-provider");
    const data = await getViewsProvider().fetchViews(clip);

    // Degrades safely: no fabricated growth, keep the stored count.
    expect(data.source).toBe("ayrshare");
    expect(data.views).toBe(clip.current_views);
  });
});
