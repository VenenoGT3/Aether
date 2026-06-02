import { describe, it, expect } from "vitest";
import {
  checkVelocity,
  checkSpike,
  checkBotPattern,
  evaluateClipFraud,
  platformThresholds,
  defaultFraudConfig,
  MAX_GROWTH_FACTOR,
  MAX_ABSOLUTE_JUMP,
} from "../fraud";

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

describe("worker/fraud platformThresholds", () => {
  const config = defaultFraudConfig();

  it("scales caps higher for TikTok and lower for Instagram", () => {
    const tiktok = platformThresholds("tiktok", config);
    const instagram = platformThresholds("instagram", config);
    expect(tiktok.maxAbsoluteJump).toBeGreaterThan(config.maxAbsoluteJump);
    expect(instagram.maxAbsoluteJump).toBeLessThan(config.maxAbsoluteJump);
  });

  it("falls back to the base config for unknown platforms", () => {
    const t = platformThresholds("snapchat", config);
    expect(t.maxAbsoluteJump).toBe(config.maxAbsoluteJump);
    expect(t.maxGrowthFactor).toBe(config.maxGrowthFactor);
  });
});

describe("worker/fraud checkSpike", () => {
  const config = defaultFraudConfig();
  // Steady ~+2k/sync history.
  const steady = [100_000, 102_000, 104_000, 106_000, 108_000];

  it("flags a sudden jump far above the recent average", () => {
    const r = checkSpike(108_000, 108_000 + 500_000, steady, config);
    expect(r.suspicious).toBe(true);
    expect(r.reason).toContain("spike");
  });

  it("allows growth in line with the recent trend", () => {
    expect(checkSpike(108_000, 110_500, steady, config).suspicious).toBe(false);
  });

  it("ignores spikes below the absolute floor", () => {
    // 20x the average but only +40k — under SPIKE_MIN_DELTA.
    expect(checkSpike(108_000, 148_000, steady, config).suspicious).toBe(false);
  });

  it("skips when there isn't enough history", () => {
    expect(checkSpike(1_000, 1_000 + 500_000, [1_000], config).suspicious).toBe(false);
  });
});

describe("worker/fraud checkBotPattern", () => {
  const config = defaultFraudConfig();

  it("flags unnaturally uniform per-sync growth", () => {
    // Exactly +5000 every sync = a farmed counter.
    const uniform = [0, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000];
    const r = checkBotPattern(30_000, 35_000, uniform, config);
    expect(r.suspicious).toBe(true);
    expect(r.reason).toContain("bot-like");
  });

  it("allows bursty organic growth", () => {
    const bursty = [0, 800, 6_200, 7_000, 25_000, 26_500, 60_000];
    expect(checkBotPattern(60_000, 64_000, bursty, config).suspicious).toBe(false);
  });

  it("does not flag stagnant/low-volume clips", () => {
    const tiny = [0, 5, 10, 15, 20, 25, 30]; // uniform but below the delta floor
    expect(checkBotPattern(30, 35, tiny, config).suspicious).toBe(false);
  });
});

describe("worker/fraud evaluateClipFraud", () => {
  it("passes clean organic growth with no history", () => {
    const r = evaluateClipFraud({
      platform: "tiktok",
      previousViews: 10_000,
      newViews: 13_000,
      priorViews: [],
    });
    expect(r.suspicious).toBe(false);
  });

  it("catches an injected spike that stays under the single-sync caps", () => {
    const r = evaluateClipFraud({
      platform: "instagram",
      previousViews: 108_000,
      newViews: 108_000 + 400_000, // ~4.7x, under the 50x factor cap
      priorViews: [100_000, 102_000, 104_000, 106_000, 108_000],
    });
    expect(r.suspicious).toBe(true);
  });
});
