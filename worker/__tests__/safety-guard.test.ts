import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The real-money safety guard: in REAL mode with SIMULATED views (no Ayrshare
 * key), earnings accrual + payouts must be blocked so we never pay real money
 * for fake views. Mock mode is unaffected (simulated views are expected and
 * Stripe transfers are mocked). `isMockMode` is read at module load, so each
 * case re-imports the worker env with a fresh process.env.
 */
describe("worker/env simulated-views safety guard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.AYRSHARE_API_KEY;
    delete process.env.ALLOW_SIMULATED_PAYOUTS_IN_REAL_MODE;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  const loadEnv = () => import("../env");

  it("does NOT block in mock mode (simulated views expected, Stripe mocked)", async () => {
    process.env.AETHER_MOCK_MODE = "true";
    const env = await loadEnv();
    expect(env.isRealModeSimulatingViews()).toBe(false);
    expect(env.simulatedEarningsBlocked()).toBe(false);
  });

  it("BLOCKS in real mode when views are simulated (no Ayrshare key)", async () => {
    process.env.AETHER_MOCK_MODE = "false";
    const env = await loadEnv();
    expect(env.isRealModeSimulatingViews()).toBe(true);
    expect(env.simulatedEarningsBlocked()).toBe(true);
  });

  it("does NOT block in real mode with a real Ayrshare key (real views)", async () => {
    process.env.AETHER_MOCK_MODE = "false";
    process.env.AYRSHARE_API_KEY = "real-key";
    const env = await loadEnv();
    expect(env.isRealModeSimulatingViews()).toBe(false);
    expect(env.simulatedEarningsBlocked()).toBe(false);
  });

  it("override lets real-mode simulated payouts through (testing escape hatch)", async () => {
    process.env.AETHER_MOCK_MODE = "false";
    process.env.ALLOW_SIMULATED_PAYOUTS_IN_REAL_MODE = "true";
    const env = await loadEnv();
    // Still the dangerous state...
    expect(env.isRealModeSimulatingViews()).toBe(true);
    // ...but explicitly unblocked by the override.
    expect(env.simulatedEarningsBlocked()).toBe(false);
  });
});
