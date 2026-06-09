/**
 * Integer-cent money helpers.
 *
 * Monetary amounts arrive as floats (NUMERIC columns deserialize to number,
 * Stripe amounts are dollars in our API surface). Comparing or summing those
 * floats directly needs ±0.01 tolerance hacks; converting to integer cents at
 * the boundary makes equality and ordering exact.
 */

/** Dollars → integer cents. 19.999999999999998 → 2000. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return NaN;
  return Math.round(amount * 100);
}

/** Integer cents → dollars (exact: cents/100 is representable enough for 2dp). */
export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) return NaN;
  return Math.round(cents) / 100;
}

/** Exact equality at cent precision. */
export function centsEqual(a: number, b: number): boolean {
  return toCents(a) === toCents(b);
}

/** a >= b at cent precision (replaces `a + 0.01 < b` tolerance checks). */
export function centsGte(a: number, b: number): boolean {
  return toCents(a) >= toCents(b);
}

/** Sum dollar amounts without accumulating float drift (adds in cents). */
export function sumMoney(amounts: Iterable<number>): number {
  let cents = 0;
  for (const amount of amounts) {
    const c = toCents(amount);
    if (Number.isFinite(c)) cents += c;
  }
  return fromCents(cents);
}
