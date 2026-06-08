import { PAYOUT_VIEW_BLOCK_SIZE } from "@/lib/social-post";

export function billableViewsForPayout(
  viewDelta: number,
  blockSize = PAYOUT_VIEW_BLOCK_SIZE
): number {
  if (!Number.isFinite(viewDelta) || !Number.isFinite(blockSize) || blockSize <= 0) {
    return 0;
  }
  const safeDelta = Math.max(0, Math.trunc(viewDelta));
  const safeBlockSize = Math.trunc(blockSize);
  return Math.floor(safeDelta / safeBlockSize) * safeBlockSize;
}

export function payoutForViews(
  viewDelta: number,
  cpmRate: number,
  blockSize = PAYOUT_VIEW_BLOCK_SIZE
): number {
  if (!Number.isFinite(cpmRate) || cpmRate <= 0) return 0;
  const billableViews = billableViewsForPayout(viewDelta, blockSize);
  return Math.round(((billableViews / blockSize) * cpmRate) * 100) / 100;
}
