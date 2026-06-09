import { afterEach, describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneyCompact,
  getPlatformCurrency,
  getStripeCurrency,
} from "@/lib/currency";

describe("platform currency", () => {
  const original = process.env.NEXT_PUBLIC_PLATFORM_CURRENCY;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_PLATFORM_CURRENCY;
    else process.env.NEXT_PUBLIC_PLATFORM_CURRENCY = original;
  });

  it("defaults to EUR (EU-first platform)", () => {
    delete process.env.NEXT_PUBLIC_PLATFORM_CURRENCY;
    expect(getPlatformCurrency()).toBe("eur");
    expect(getStripeCurrency()).toBe("eur");
    expect(formatMoney(1234.5)).toContain("€");
  });

  it("supports USD via env for USD-settled Stripe accounts", () => {
    process.env.NEXT_PUBLIC_PLATFORM_CURRENCY = "usd";
    expect(getPlatformCurrency()).toBe("usd");
    expect(formatMoney(1234.5)).toContain("$");
  });

  it("falls back to EUR on unknown values", () => {
    process.env.NEXT_PUBLIC_PLATFORM_CURRENCY = "gbp";
    expect(getPlatformCurrency()).toBe("eur");
  });

  it("formats compact amounts without decimals", () => {
    delete process.env.NEXT_PUBLIC_PLATFORM_CURRENCY;
    expect(formatMoneyCompact(1500.75)).not.toContain(",75");
  });
});
