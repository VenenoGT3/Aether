import { describe, expect, it } from "vitest";
import { billableViewsForPayout, payoutForViews } from "@/lib/earnings";

describe("earnings payout blocks", () => {
  it("only unlocks payouts in full 1,000-view blocks", () => {
    expect(billableViewsForPayout(999)).toBe(0);
    expect(billableViewsForPayout(1000)).toBe(1000);
    expect(billableViewsForPayout(1992)).toBe(1000);
    expect(billableViewsForPayout(2001)).toBe(2000);
  });

  it("pays CPM only for unlocked view blocks", () => {
    expect(payoutForViews(1992, 3)).toBe(3);
    expect(payoutForViews(2001, 3)).toBe(6);
    expect(payoutForViews(999, 3)).toBe(0);
  });
});
