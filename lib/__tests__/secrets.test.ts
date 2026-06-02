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

  it("service role disabled on Next when handler is supabase and not mock", async () => {
    process.env.AETHER_MOCK_MODE = "false";
    process.env.STRIPE_WEBHOOK_HANDLER = "supabase";
    const { canUseServiceRoleInNextRuntime } = await import("@/lib/env");
    expect(canUseServiceRoleInNextRuntime()).toBe(false);
  });

  it("service role allowed on Next for mock mode", async () => {
    process.env.AETHER_MOCK_MODE = "true";
    const { canUseServiceRoleInNextRuntime } = await import("@/lib/env");
    expect(canUseServiceRoleInNextRuntime()).toBe(true);
  });

  it("service role allowed on Next when STRIPE_WEBHOOK_HANDLER=vercel", async () => {
    process.env.AETHER_MOCK_MODE = "false";
    process.env.STRIPE_WEBHOOK_HANDLER = "vercel";
    const { canUseServiceRoleInNextRuntime } = await import("@/lib/env");
    expect(canUseServiceRoleInNextRuntime()).toBe(true);
  });

});