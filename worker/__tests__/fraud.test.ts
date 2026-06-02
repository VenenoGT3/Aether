import { describe, it, expect } from "vitest";
import { checkVelocity, MAX_GROWTH_FACTOR, MAX_ABSOLUTE_JUMP } from "../fraud";

describe("worker/fraud checkVelocity", () => {
  it("allows normal organic growth", () => {
    expect(checkVelocity(10_000, 12_500).suspicious).toBe(false);
  });

  it("does not flag a decreasing read (noisy provider, not fraud)", () => {
    expect(checkVelocity(10_000, 9_000).suspicious).toBe(false);
  });

  it("flags an absolute jump beyond the cap", () => {
    const r = checkVelocity(1_000_000, 1_000_000 + MAX_ABSOLUTE_JUMP + 1);
    expect(r.suspicious).toBe(true);
    expect(r.reason).toContain("absolute");
  });

  it("flags growth beyond the factor cap above the baseline", () => {
    const r = checkVelocity(10_000, 10_000 * (MAX_GROWTH_FACTOR + 1));
    expect(r.suspicious).toBe(true);
  });

  it("does not apply the factor cap to tiny baselines", () => {
    // 10 -> 900 is a 90x jump, but the baseline is below the factor-check floor.
    expect(checkVelocity(10, 900).suspicious).toBe(false);
  });
});
