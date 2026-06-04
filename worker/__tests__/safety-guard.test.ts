import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The real-money safety guard. Aether is a performance platform: earnings accrue
 * and creators get paid on VERIFIED views only. The worker requires at least one
 * trusted live view source. Without one, earnings accrual + payouts are blocked
 * (defense-in-depth, on top of the hard startup failure) so real money never
 * moves on unverified views.
 */
describe("worker/env payout safety guard", () => {
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
  });

  const loadEnv = () => import("../env");

  it("BLOCKS earnings/payouts when no trusted provider is configured", async () => {
    delete process.env.AYRSHARE_API_KEY;
    delete process.env.YOUTUBE_DATA_API_KEY;
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
    const env = await loadEnv();
    expect(env.isAyrshareConfigured()).toBe(false);
    expect(env.getConfiguredViewProviderNames()).toEqual([]);
    expect(env.payoutSafetyBlocked()).toBe(true);
  });

  it("does NOT block when YouTube official views are configured", async () => {
    process.env.YOUTUBE_DATA_API_KEY = "youtube-key";
    const env = await loadEnv();
    expect(env.isYoutubeConfigured()).toBe(true);
    expect(env.getConfiguredViewProviderNames()).toEqual(["youtube_official"]);
    expect(env.payoutSafetyBlocked()).toBe(false);
  });

  it("does NOT block when Ayrshare is configured as fallback", async () => {
    process.env.AYRSHARE_API_KEY = "real-key";
    const env = await loadEnv();
    expect(env.isAyrshareConfigured()).toBe(true);
    expect(env.getConfiguredViewProviderNames()).toEqual(["ayrshare"]);
    expect(env.payoutSafetyBlocked()).toBe(false);
  });

  it("treats blank/whitespace provider keys as missing (still blocks)", async () => {
    process.env.AYRSHARE_API_KEY = "   ";
    process.env.YOUTUBE_DATA_API_KEY = "   ";
    const env = await loadEnv();
    expect(env.isAyrshareConfigured()).toBe(false);
    expect(env.isYoutubeConfigured()).toBe(false);
    expect(env.payoutSafetyBlocked()).toBe(true);
  });

  it("validateWorkerEnv reports a hard error when no provider is configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    delete process.env.AYRSHARE_API_KEY;
    delete process.env.YOUTUBE_DATA_API_KEY;
    const env = await loadEnv();
    const { errors } = env.validateWorkerEnv();
    expect(errors.some((e) => /trusted view provider/.test(e))).toBe(true);
  });

  it("validateWorkerEnv requires TikTok credentials to be paired", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.TIKTOK_CLIENT_KEY = "client-key";
    delete process.env.TIKTOK_CLIENT_SECRET;
    const env = await loadEnv();
    const { errors } = env.validateWorkerEnv();
    expect(errors.some((e) => /TIKTOK_CLIENT_KEY/.test(e))).toBe(true);
  });

  it("validateWorkerEnv has no errors when fully configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.YOUTUBE_DATA_API_KEY = "youtube-key";
    const env = await loadEnv();
    const { errors } = env.validateWorkerEnv();
    expect(errors).toHaveLength(0);
  });
});
