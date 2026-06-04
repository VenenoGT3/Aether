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
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_APP_URL",
      "CRON_SECRET",
    ]) {
      process.env[key] = "test-value";
    }
  }

  it("validateEnv throws when required app vars are missing", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { validateEnv } = await loadEnv();
    expect(() => validateEnv()).toThrow(/Missing required environment variables/);
  });

  it("validateEnv passes with supabase handler without service role", async () => {
    process.env.STRIPE_WEBHOOK_HANDLER = "supabase";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    setAllAppVars();
    const { validateEnv } = await loadEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("validateEnv does not require STRIPE_WEBHOOK_SECRET when handler is supabase", async () => {
    process.env.STRIPE_WEBHOOK_HANDLER = "supabase";
    setAllAppVars();
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { validateEnv } = await loadEnv();
    expect(() => validateEnv()).not.toThrow();
  });

  it("validateEnv requires service role and webhook secret when STRIPE_WEBHOOK_HANDLER=vercel", async () => {
    process.env.STRIPE_WEBHOOK_HANDLER = "vercel";
    setAllAppVars();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { validateEnv } = await loadEnv();
    expect(() => validateEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("validateProductionSafety allows the default supabase handler on Vercel Production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_WEBHOOK_HANDLER = "supabase";
    const { validateProductionSafety } = await loadEnv();
    expect(() => validateProductionSafety()).not.toThrow();
  });

  it("validateProductionSafety rejects vercel webhook handler on Vercel Production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.STRIPE_WEBHOOK_HANDLER = "vercel";
    const { validateProductionSafety } = await loadEnv();
    expect(() => validateProductionSafety()).toThrow(/STRIPE_WEBHOOK_HANDLER=vercel is forbidden/);
  });

  it("getStripeWebhookHandler defaults to supabase", async () => {
    delete process.env.STRIPE_WEBHOOK_HANDLER;
    const { getStripeWebhookHandler } = await loadEnv();
    expect(getStripeWebhookHandler()).toBe("supabase");
  });
});