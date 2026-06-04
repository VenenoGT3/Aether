/**
 * Creator withdrawal constants + math (pure; shared by UI and server).
 *
 * A creator can withdraw once their AVAILABLE balance (approved earnings that
 * have cleared holdback) is >= WITHDRAWAL_MIN. The platform takes a flat
 * WITHDRAWAL_FEE_PCT (covers Stripe's transfer commission + platform revenue);
 * the creator receives the net.
 */

export const WITHDRAWAL_MIN = 10;
export const WITHDRAWAL_FEE_PCT = 0.07;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface WithdrawalBreakdown {
  gross: number; // available balance being withdrawn
  fee: number; // platform/Stripe fee retained
  net: number; // transferred to the creator
  feePct: number;
}

export function withdrawalBreakdown(
  gross: number,
  feePct: number = WITHDRAWAL_FEE_PCT
): WithdrawalBreakdown {
  const g = Math.max(Number(gross) || 0, 0);
  const fee = round2(g * feePct);
  return { gross: g, fee, net: round2(g - fee), feePct };
}

export function canWithdraw(available: number): boolean {
  return (Number(available) || 0) >= WITHDRAWAL_MIN;
}
