import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("secret runtime boundaries", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  it("service role disabled on Next when handler is supabase (default)", async () => {
    process.env.STRIPE_WEBHOOK_HANDLER = "supabase";
    const { canUseServiceRoleInNextRuntime } = await import("@/lib/env");
    expect(canUseServiceRoleInNextRuntime()).toBe(false);
  });

  it("service role disabled on Next when handler is unset (defaults to supabase)", async () => {
    delete process.env.STRIPE_WEBHOOK_HANDLER;
    const { canUseServiceRoleInNextRuntime } = await import("@/lib/env");
    expect(canUseServiceRoleInNextRuntime()).toBe(false);
  });

  it("service role allowed on Next when STRIPE_WEBHOOK_HANDLER=vercel", async () => {
    process.env.STRIPE_WEBHOOK_HANDLER = "vercel";
    const { canUseServiceRoleInNextRuntime } = await import("@/lib/env");
    expect(canUseServiceRoleInNextRuntime()).toBe(true);
  });

});