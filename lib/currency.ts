/**
 * Platform currency — single source of truth.
 *
 * Aether is an EU platform: the default is EUR. Deployments whose Stripe
 * account settles in USD (e.g. the current US test account) must set
 * NEXT_PUBLIC_PLATFORM_CURRENCY=usd until EUR settlement is enabled —
 * Stripe transfers in a currency the platform balance doesn't hold fail.
 *
 * Dependency-free and runtime-agnostic on purpose: imported by client
 * components, server code, and the standalone worker.
 */

export const SUPPORTED_CURRENCIES = ["eur", "usd"] as const;
export type PlatformCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Deterministic locale per currency so server and client render identically (no hydration mismatch). */
const CURRENCY_LOCALES: Record<PlatformCurrency, string> = {
  eur: "it-IT",
  usd: "en-US",
};

export function getPlatformCurrency(): PlatformCurrency {
  const raw = process.env.NEXT_PUBLIC_PLATFORM_CURRENCY?.trim().toLowerCase();
  return raw === "usd" ? "usd" : "eur";
}

/** ISO code in the casing Stripe expects ("eur"/"usd"). */
export function getStripeCurrency(): string {
  return getPlatformCurrency();
}

export function formatMoney(
  value: number,
  options?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): string {
  const currency = getPlatformCurrency();
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency], {
    style: "currency",
    currency: currency.toUpperCase(),
    ...options,
  }).format(value);
}

/** Compact money for dashboards (no decimals): €1,234 / $1,234. */
export function formatMoneyCompact(value: number): string {
  return formatMoney(value, { maximumFractionDigits: 0 });
}
