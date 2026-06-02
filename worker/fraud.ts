/**
 * View-fraud heuristics for the performance (pay-per-view) model. Earnings are
 * tied to view counts, so implausible growth = stolen budget.
 *
 * Everything here is PURE (no Redis / Supabase / env) so it's cheap to unit-test.
 * The worker fetches the data (current view count + recent snapshots) and passes
 * it in; env-driven thresholds are resolved in worker/env.ts (getFraudConfig).
 *
 * A flagged clip is set to 'disqualified' by the worker, which stops it accruing
 * (record_clip_earning only pays 'tracking' clips). Defaults are deliberately
 * conservative to avoid blocking legitimately viral creators — tune via env.
 *
 * Checks (cheapest / most certain first):
 *   1. velocity   — single-sync absolute + multiplicative caps (platform-aware)
 *   2. spike      — latest jump is wildly above the clip's own recent average
 *   3. botPattern — unnaturally uniform per-sync growth (a counter being farmed)
 */

// ---- Default thresholds (overridable via env in worker/env.ts) ----

/** A single sync may not multiply views by more than this factor. */
export const MAX_GROWTH_FACTOR = 50;
/** A single sync may not add more than this many absolute views. */
export const MAX_ABSOLUTE_JUMP = 5_000_000;
/** Below this baseline the factor check is skipped (small early counts are noisy). */
export const FACTOR_CHECK_MIN_BASELINE = 1_000;

/** Latest delta this many times the recent average delta counts as a spike. */
export const SPIKE_MULTIPLIER = 10;
/** Ignore the spike check unless the latest delta is at least this large. */
export const SPIKE_MIN_DELTA = 100_000;
/** Need at least this many prior per-sync deltas for a meaningful average. */
export const SPIKE_MIN_HISTORY = 3;

/** Need at least this many per-sync deltas before judging "too uniform". */
export const BOT_MIN_SNAPSHOTS = 6;
/** Coefficient of variation below this across deltas = suspiciously uniform. */
export const BOT_CV_THRESHOLD = 0.05;
/** Only judge uniformity when the average delta is at least this (skip stagnant clips). */
export const BOT_MIN_DELTA = 1_000;

/** How many recent snapshots the worker loads for history-based checks. */
export const FRAUD_HISTORY_SNAPSHOTS = 12;

/**
 * Relative growth profiles per platform: a TikTok can go viral far faster than
 * an Instagram post, so the single-sync caps scale per platform (multiplier on
 * the base config). Unknown platforms use 1.0.
 */
export const PLATFORM_MULTIPLIERS: Record<string, number> = {
  tiktok: 1.6,
  youtube: 1.0,
  instagram: 0.8,
};

export interface FraudConfig {
  maxGrowthFactor: number;
  maxAbsoluteJump: number;
  factorCheckMinBaseline: number;
  spikeMultiplier: number;
  spikeMinDelta: number;
  spikeMinHistory: number;
  botMinSnapshots: number;
  botCvThreshold: number;
  botMinDelta: number;
  historyWindow: number;
}

/** Baseline config (env getters in worker/env.ts override individual fields). */
export function defaultFraudConfig(): FraudConfig {
  return {
    maxGrowthFactor: MAX_GROWTH_FACTOR,
    maxAbsoluteJump: MAX_ABSOLUTE_JUMP,
    factorCheckMinBaseline: FACTOR_CHECK_MIN_BASELINE,
    spikeMultiplier: SPIKE_MULTIPLIER,
    spikeMinDelta: SPIKE_MIN_DELTA,
    spikeMinHistory: SPIKE_MIN_HISTORY,
    botMinSnapshots: BOT_MIN_SNAPSHOTS,
    botCvThreshold: BOT_CV_THRESHOLD,
    botMinDelta: BOT_MIN_DELTA,
    historyWindow: FRAUD_HISTORY_SNAPSHOTS,
  };
}

export interface VelocityResult {
  suspicious: boolean;
  reason?: string;
}

interface VelocityThresholds {
  maxGrowthFactor: number;
  maxAbsoluteJump: number;
  factorCheckMinBaseline: number;
}

/** Resolve platform-scaled single-sync caps from the base config. */
export function platformThresholds(
  platform: string | null | undefined,
  config: FraudConfig
): VelocityThresholds {
  const m = PLATFORM_MULTIPLIERS[(platform ?? "").toLowerCase()] ?? 1;
  return {
    maxGrowthFactor: Math.round(config.maxGrowthFactor * m),
    maxAbsoluteJump: Math.round(config.maxAbsoluteJump * m),
    factorCheckMinBaseline: config.factorCheckMinBaseline,
  };
}

/**
 * Single-sync velocity check. Backward-compatible: callable as
 * checkVelocity(prev, new) with the default (global, platform-agnostic) caps,
 * or with explicit platform-scaled thresholds.
 */
export function checkVelocity(
  previousViews: number,
  newViews: number,
  thresholds: VelocityThresholds = {
    maxGrowthFactor: MAX_GROWTH_FACTOR,
    maxAbsoluteJump: MAX_ABSOLUTE_JUMP,
    factorCheckMinBaseline: FACTOR_CHECK_MIN_BASELINE,
  }
): VelocityResult {
  const delta = newViews - previousViews;

  // Counts should never decrease materially; a large drop signals a bad read.
  if (delta < 0) {
    return { suspicious: false, reason: "view count decreased; ignoring" };
  }

  if (delta > thresholds.maxAbsoluteJump) {
    return {
      suspicious: true,
      reason: `absolute view jump ${delta.toLocaleString()} exceeds ${thresholds.maxAbsoluteJump.toLocaleString()}`,
    };
  }

  if (
    previousViews >= thresholds.factorCheckMinBaseline &&
    newViews > previousViews * thresholds.maxGrowthFactor
  ) {
    return {
      suspicious: true,
      reason: `views grew ${(newViews / previousViews).toFixed(1)}x in one sync (max ${thresholds.maxGrowthFactor}x)`,
    };
  }

  return { suspicious: false };
}

// ---- history helpers ----

/** Positive per-step deltas from a view-count series (ascending by time). */
function positiveDeltas(series: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const d = series[i] - series[i - 1];
    if (d > 0) out.push(d);
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

function stddev(xs: number[], avg: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((s, x) => s + (x - avg) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/**
 * Spike check: the latest jump is wildly larger than the clip's own recent
 * average growth (e.g. steady +2k/sync, then suddenly +500k = injected views).
 * Catches abuse that stays under the single-sync factor cap.
 */
export function checkSpike(
  previousViews: number,
  newViews: number,
  priorViews: number[],
  config: FraudConfig
): VelocityResult {
  const latest = newViews - previousViews;
  if (latest < config.spikeMinDelta) return { suspicious: false };

  const hist = positiveDeltas(priorViews);
  if (hist.length < config.spikeMinHistory) return { suspicious: false };

  const avg = mean(hist);
  if (avg <= 0) return { suspicious: false };

  if (latest > avg * config.spikeMultiplier) {
    return {
      suspicious: true,
      reason: `view spike: +${latest.toLocaleString()} this sync is ${(latest / avg).toFixed(1)}x the recent average (+${Math.round(avg).toLocaleString()}/sync)`,
    };
  }
  return { suspicious: false };
}

/**
 * Bot-pattern check: organic growth is bursty, but a farmed counter incremented
 * at a near-constant rate has a very low coefficient of variation across syncs.
 * Skips stagnant/low-volume clips (avg delta below the floor).
 */
export function checkBotPattern(
  previousViews: number,
  newViews: number,
  priorViews: number[],
  config: FraudConfig
): VelocityResult {
  const deltas = positiveDeltas([...priorViews, newViews]);
  if (deltas.length < config.botMinSnapshots) return { suspicious: false };

  const avg = mean(deltas);
  if (avg < config.botMinDelta) return { suspicious: false };

  const cv = stddev(deltas, avg) / avg;
  if (cv < config.botCvThreshold) {
    return {
      suspicious: true,
      reason: `bot-like uniform growth: ${deltas.length} syncs within ${(cv * 100).toFixed(1)}% of a constant +${Math.round(avg).toLocaleString()}/sync`,
    };
  }
  return { suspicious: false };
}

export interface FraudInput {
  platform: string | null | undefined;
  previousViews: number;
  newViews: number;
  /** Recent snapshot view counts, oldest→newest (excludes the incoming read). */
  priorViews: number[];
  config?: FraudConfig;
}

/** Run all fraud heuristics (cheapest / most certain first); returns the first hit. */
export function evaluateClipFraud(input: FraudInput): VelocityResult {
  const config = input.config ?? defaultFraudConfig();
  const { platform, previousViews, newViews, priorViews } = input;

  const velocity = checkVelocity(
    previousViews,
    newViews,
    platformThresholds(platform, config)
  );
  if (velocity.suspicious) return velocity;

  const spike = checkSpike(previousViews, newViews, priorViews, config);
  if (spike.suspicious) return spike;

  const bot = checkBotPattern(previousViews, newViews, priorViews, config);
  if (bot.suspicious) return bot;

  return { suspicious: false };
}
