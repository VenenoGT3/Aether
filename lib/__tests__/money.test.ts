import { describe, expect, it } from "vitest";
import { centsEqual, centsGte, fromCents, sumMoney, toCents } from "@/lib/money";

describe("money helpers", () => {
  it("converts major currency units to integer cents, absorbing float artifacts", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1999.99)).toBe(199999);
    expect(fromCents(1999)).toBe(19.99);
  });

  it("compares at cent precision without tolerance hacks", () => {
    expect(centsEqual(10.0, 10.004)).toBe(true);
    expect(centsEqual(10.0, 10.01)).toBe(false);
    expect(centsGte(100.0, 99.999999999)).toBe(true);
    expect(centsGte(99.98, 99.99)).toBe(false);
  });

  it("sums without accumulating drift", () => {
    // 0.1 added 10 times drifts as floats (0.9999999999999999) but not in cents.
    expect(sumMoney(Array(10).fill(0.1))).toBe(1);
    expect(sumMoney([19.99, 0.01, 30])).toBe(50);
    expect(sumMoney([])).toBe(0);
  });

  it("propagates NaN for non-finite input instead of silently coercing", () => {
    expect(toCents(NaN)).toBeNaN();
    expect(toCents(Infinity)).toBeNaN();
    expect(sumMoney([10, NaN])).toBe(10);
  });
});
