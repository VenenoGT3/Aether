/**
 * Shared constants for the performance campaign category (UGC vs Clipping).
 * Pure (no React) so both brand and creator UIs import the same labels/copy and
 * stay consistent. `campaign_category` is only set on performance campaigns.
 */

export type CampaignCategory = "ugc" | "clipping";

export const CAMPAIGN_CATEGORIES: CampaignCategory[] = ["ugc", "clipping"];

export const CAMPAIGN_CATEGORY_LABELS: Record<CampaignCategory, string> = {
  ugc: "UGC",
  clipping: "Clipping",
};

/** Short one-liner shown under each option when a brand picks a category. */
export const CAMPAIGN_CATEGORY_DESCRIPTIONS: Record<CampaignCategory, string> = {
  ugc: "Creators produce original content from your brief — creative direction, references, do's & don'ts.",
  clipping: "Creators cut short clips from your source footage to spec — source link, duration limits, rules.",
};

/** Type guard for campaign_category column values. */
export function isCampaignCategory(
  value: string | null | undefined
): value is CampaignCategory {
  return value === "ugc" || value === "clipping";
}

/** Returns the display label for a category value, or null when not categorized. */
export function campaignCategoryLabel(category?: string | null): string | null {
  return isCampaignCategory(category) ? CAMPAIGN_CATEGORY_LABELS[category] : null;
}
