import { describe, it, expect } from "vitest";
import { simulateViewGrowth, getViewsProvider } from "../views-provider";

describe("worker/views-provider simulateViewGrowth", () => {
  it("grows above the current view count", () => {
    const r = simulateViewGrowth(10_000);
    expect(r.views).toBeGreaterThan(10_000);
    expect(r.source).toBe("simulated");
  });

  it("seeds a baseline when starting from zero", () => {
    expect(simulateViewGrowth(0).views).toBeGreaterThan(0);
  });

  it("derives engagement counts from views (and never exceeds them)", () => {
    const r = simulateViewGrowth(50_000);
    expect(r.likes).toBeGreaterThan(0);
    expect(r.likes).toBeLessThan(r.views);
    expect(r.comments).toBeLessThanOrEqual(r.likes);
  });
});

describe("worker/views-provider getViewsProvider", () => {
  it("falls back to the simulated provider without a key / in mock mode", () => {
    // Vitest runs with AETHER_MOCK_MODE=true → useAyrshare() is false.
    expect(getViewsProvider().name).toBe("simulated");
  });
});
