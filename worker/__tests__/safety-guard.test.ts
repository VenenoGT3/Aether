import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The real-money safety guard. Aether is a performance platform: earnings accrue
 * and creators get paid on VERIFIED views only. The worker requires a live view
 * source (Ayrshare). Without AYRSHARE_API_KEY, earnings accrual + payouts are
 * blocked (defense-in-depth, on top of the hard startup failure) so real money
 * never moves on unverified views.
 */
describe("worker/env payout safety guard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.AYRSHARE_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  const loadEnv = () => import("../env");

  it("BLOCKS earnings/payouts when AYRSHARE_API_KEY is missing", async () => {
    delete process.env.AYRSHARE_API_KEY;
    const env = await loadEnv();
    expect(env.isAyrshareConfigured()).toBe(false);
    expect(env.payoutSafetyBlocked()).toBe(true);
  });

  it("does NOT block when AYRSHARE_API_KEY is configured (live views)", async () => {
    process.env.AYRSHARE_API_KEY = "real-key";
    const env = await loadEnv();
    expect(env.isAyrshareConfigured()).toBe(true);
    expect(env.payoutSafetyBlocked()).toBe(false);
  });

  it("treats a blank/whitespace key as missing (still blocks)", async () => {
    process.env.AYRSHARE_API_KEY = "   ";
    const env = await loadEnv();
    expect(env.isAyrshareConfigured()).toBe(false);
    expect(env.payoutSafetyBlocked()).toBe(true);
  });

  it("validateWorkerEnv reports a hard error when AYRSHARE_API_KEY is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    delete process.env.AYRSHARE_API_KEY;
    const env = await loadEnv();
    const { errors } = env.validateWorkerEnv();
    expect(errors.some((e) => /AYRSHARE_API_KEY/.test(e))).toBe(true);
  });

  it("validateWorkerEnv has no errors when fully configured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.AYRSHARE_API_KEY = "real-key";
    const env = await loadEnv();
    const { errors } = env.validateWorkerEnv();
    expect(errors).toHaveLength(0);
  });
});
