import { describe, it, expect } from "vitest";
import {
  selectPayableCreators,
  sumReversibleAmount,
  round2,
} from "../payout-logic";

describe("worker/payout-logic selectPayableCreators", () => {
  it("groups earnings per creator and sums amounts", () => {
    const result = selectPayableCreators(
      [
        { creator_id: "a", amount: 10 },
        { creator_id: "a", amount: 15.5 },
        { creator_id: "b", amount: 40 },
      ],
      10
    );
    const a = result.find((r) => r.creatorId === "a");
    expect(a).toEqual({ creatorId: "a", total: 25.5, count: 2 });
  });

  it("excludes creators below the threshold", () => {
    const result = selectPayableCreators(
      [
        { creator_id: "a", amount: 5 },
        { creator_id: "b", amount: 12 },
      ],
      10
    );
    expect(result.map((r) => r.creatorId)).toEqual(["b"]);
  });

  it("includes a creator exactly at the threshold", () => {
    const result = selectPayableCreators([{ creator_id: "a", amount: 10 }], 10);
    expect(result).toHaveLength(1);
  });

  it("coerces string amounts (numeric columns from Supabase)", () => {
    const result = selectPayableCreators(
      [
        { creator_id: "a", amount: "7.25" },
        { creator_id: "a", amount: "3.00" },
      ],
      10
    );
    expect(result[0]?.total).toBe(10.25);
  });

  it("returns nothing when no creator meets the threshold", () => {
    expect(selectPayableCreators([{ creator_id: "a", amount: 1 }], 10)).toEqual([]);
  });
});

describe("worker/payout-logic sumReversibleAmount", () => {
  it("only sums 'accrued' (unpaid) earnings", () => {
    const total = sumReversibleAmount([
      { status: "accrued", amount: 10 },
      { status: "accrued", amount: 5.5 },
      { status: "approved", amount: 100 }, // in payout pipeline — not reversed
      { status: "paid", amount: 200 }, // already paid — never reversed
      { status: "reversed", amount: 7 }, // already reversed
    ]);
    expect(total).toBe(15.5);
  });

  it("returns 0 when there is nothing accrued", () => {
    expect(sumReversibleAmount([{ status: "paid", amount: 50 }])).toBe(0);
  });
});

describe("worker/payout-logic round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(1 / 3)).toBe(0.33);
  });
});
