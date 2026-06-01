import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("lib/env", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  async function loadEnv() {
    return import("@/lib/env");
  }

  function setAllAppVars() {
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_APP_URL",
      "CRON_SECRET",
    ]) {
      process.env[key] = "test-value";
    }
  }

  it("isMockMode is true only when AETHER_MOCK_MODE=true", async () => {
    process.env.AETHER_MOCK_MODE = "true";
    const { isMockMode } = await loadEnv();
    expect(isMockMode).toBe(true);
  });

  it("isMockMode is false when flag is false even with placeholder Supabase URL", async () => {
    process.env.AETHER_MOCK_MODE = "false";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://your-project-id.supabase.co";
    const { isMockMode } = await loadEnv();
    expect(isMockMode).toBe(false);
  });

  it("isMockMode is false when AETHER_MOCK_MODE is unset", async () => {
    delete process.env.AETHER_MOCK_MODE;
    const { isMockMode } = await loadEnv();
    expect(isMockMode).toBe(false);
  });

  it("validateEnv throws when not in mock mode and keys are missing", async () => {
    process.env.AETHER_MOCK_MODE = "false";
    delete process.env.STRIPE_SECRET_KEY;
    const { validateEnv } = await loadEnv();
    expect(() => validateEnv()).toThrow(/Production mode requires/);
  });

  it("validateEnv passes with supabase handler without service role", async () => {
    process.env.AETHER_MOCK_MODE = "false";
    process.env.STRIPE_WEBHOOK_HANDLER = "supabase";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    setAllAppVars();
    const { validateEnv } = await loadEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("validateEnv requires service role when STRIPE_WEBHOOK_HANDLER=vercel", async () => {
    process.env.AETHER_MOCK_MODE = "false";
    process.env.STRIPE_WEBHOOK_HANDLER = "vercel";
    setAllAppVars();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { validateEnv } = await loadEnv();
    expect(() => validateEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("getStripeWebhookHandler defaults to supabase", async () => {
    delete process.env.STRIPE_WEBHOOK_HANDLER;
    const { getStripeWebhookHandler } = await loadEnv();
    expect(getStripeWebhookHandler()).toBe("supabase");
  });
});