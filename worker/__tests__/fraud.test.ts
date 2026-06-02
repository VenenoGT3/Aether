import { describe, it, expect } from "vitest";
import {
  checkVelocity,
  checkSpike,
  checkBotPattern,
  checkLowEngagement,
  checkVelocityAnomaly,
  scoreClipFraud,
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

describe("checkLowEngagement (fake-account signal)", () => {
  const cfg = defaultFraudConfig();

  it("ignores small clips (below the min-views floor)", () => {
    expect(checkLowEngagement(5_000, 0, 0, 0, cfg).suspicious).toBe(false);
  });

  it("flags high views with near-zero engagement", () => {
    const r = checkLowEngagement(100_000, 10, 2, 0, cfg); // 0.012% << 0.5%
    expect(r.suspicious).toBe(true);
  });

  it("does not flag a healthy engagement ratio", () => {
    const r = checkLowEngagement(100_000, 4_000, 800, 200, cfg); // 5%
    expect(r.suspicious).toBe(false);
  });
});

describe("checkVelocityAnomaly (too fast after submission)", () => {
  const cfg = defaultFraudConfig();

  it("flags thousands of views minutes after submission", () => {
    const r = checkVelocityAnomaly(8_000, 3, cfg);
    expect(r.suspicious).toBe(true);
  });

  it("does not flag the same views once the post has aged", () => {
    expect(checkVelocityAnomaly(8_000, 600, cfg).suspicious).toBe(false);
  });

  it("is inert without an age (null)", () => {
    expect(checkVelocityAnomaly(8_000, null, cfg).suspicious).toBe(false);
  });
});

describe("scoreClipFraud (0–100 scoring)", () => {
  it("scores a clean steady clip near zero (no action)", () => {
    const r = scoreClipFraud({
      platform: "youtube",
      previousViews: 100_000,
      newViews: 104_000,
      priorViews: [88_000, 92_000, 97_000, 100_000],
      likes: 5_000,
      comments: 600,
      shares: 300,
      ageMinutes: 5_000,
    });
    expect(r.score).toBe(0);
    expect(r.disqualify).toBe(false);
    expect(r.flag).toBe(false);
  });

  it("auto-disqualifies on a hard velocity-cap breach alone", () => {
    const r = scoreClipFraud({
      platform: "youtube",
      previousViews: 1_000,
      newViews: 1_000 + MAX_ABSOLUTE_JUMP + 1,
      priorViews: [],
    });
    expect(r.disqualify).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it("does not disqualify a lone spike — only flags when corroborated", () => {
    const spikeOnly = scoreClipFraud({
      platform: "instagram",
      previousViews: 108_000,
      newViews: 108_000 + 400_000,
      priorViews: [100_000, 102_000, 104_000, 106_000, 108_000],
      // healthy engagement, well-aged → no other signal fires
      likes: 25_000,
      comments: 3_000,
      shares: 1_500,
      ageMinutes: 5_000,
    });
    expect(spikeOnly.disqualify).toBe(false);

    // Same spike but with no engagement → score crosses the flag band.
    const spikePlusBadEngagement = scoreClipFraud({
      platform: "instagram",
      previousViews: 108_000,
      newViews: 108_000 + 400_000,
      priorViews: [100_000, 102_000, 104_000, 106_000, 108_000],
      likes: 5,
      comments: 0,
      shares: 0,
      ageMinutes: 5_000,
    });
    expect(spikePlusBadEngagement.flag || spikePlusBadEngagement.disqualify).toBe(true);
  });

  it("treats a cross-campaign duplicate as a strong signal", () => {
    const r = scoreClipFraud({
      platform: "tiktok",
      previousViews: 50_000,
      newViews: 52_000,
      priorViews: [40_000, 44_000, 48_000, 50_000],
      likes: 3_000,
      comments: 400,
      shares: 200,
      ageMinutes: 5_000,
      crossCampaignDuplicate: true,
    });
    expect(r.flag || r.disqualify).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/cross-campaign/i);
  });
});
