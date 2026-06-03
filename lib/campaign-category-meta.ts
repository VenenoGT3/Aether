/**
 * Canonical validation + defaults for performance campaign category_meta.
 * Mirrors the DB trigger in 20260603040000_campaign_category_hardening.sql so
 * app-layer and database never disagree on UGC vs Clipping requirements.
 */

import { z } from "zod";
import type { CampaignCategory } from "@/lib/campaign-category";
import { isCampaignCategory } from "@/lib/campaign-category";

const metaText = z.string().trim().max(5000);
const optionalMetaText = z.string().trim().max(5000).optional().default("");

export const UgcCategoryMetaSchema = z.object({
  creative_direction: metaText.min(
    3,
    "Creative direction is required (at least 3 characters)."
  ),
  references: optionalMetaText,
  dos: optionalMetaText,
  donts: optionalMetaText,
});

export const ClippingCategoryMetaSchema = z
  .object({
    source_url: z
      .string()
      .trim()
      .url("Source URL must be a valid URL.")
      .max(2048),
    min_duration_sec: z.coerce.number().int().min(1).max(600),
    max_duration_sec: z.coerce.number().int().min(1).max(600),
    requirements: optionalMetaText,
  })
  .refine((d) => d.max_duration_sec >= d.min_duration_sec, {
    message: "Maximum clip duration must be greater than or equal to the minimum.",
    path: ["max_duration_sec"],
  });

export type UgcCategoryMeta = z.infer<typeof UgcCategoryMetaSchema>;
export type ClippingCategoryMeta = z.infer<typeof ClippingCategoryMetaSchema>;

export function categoryMetaSchema(category: CampaignCategory) {
  return category === "ugc" ? UgcCategoryMetaSchema : ClippingCategoryMetaSchema;
}

/** Hard cap on serialized category_meta — mirrors the DB CHECK (20 KB). */
export const MAX_CATEGORY_META_BYTES = 20000;

/** Normalize and validate category_meta for a performance campaign. */
export function validateCategoryMeta(
  category: string | null | undefined,
  meta: unknown
): { ok: true; category: CampaignCategory; meta: Record<string, unknown> } | { ok: false; error: string } {
  if (!isCampaignCategory(category)) {
    return {
      ok: false,
      error: "Performance campaigns require a category: ugc or clipping.",
    };
  }
  const schema = categoryMetaSchema(category);
  const parsed = schema.safeParse(meta ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Invalid category brief." };
  }
  // Defense in depth: Zod strips unknown keys, but guard the serialized size so
  // the app never attempts a write the DB CHECK would reject. TextEncoder is
  // universal (browser + Node), unlike Buffer — this module runs in both.
  const serializedBytes = new TextEncoder().encode(JSON.stringify(parsed.data)).length;
  if (serializedBytes > MAX_CATEGORY_META_BYTES) {
    return { ok: false, error: "Campaign brief is too large. Please shorten it." };
  }
  return { ok: true, category, meta: parsed.data as Record<string, unknown> };
}

/** Empty brief skeleton for the campaign creation form. */
export function defaultCategoryMeta(
  category: CampaignCategory
): Record<string, unknown> {
  if (category === "ugc") {
    return { creative_direction: "", references: "", dos: "", donts: "" };
  }
  return {
    source_url: "",
    min_duration_sec: 10,
    max_duration_sec: 60,
    requirements: "",
  };
}
