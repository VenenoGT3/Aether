import { supabase } from "./client";
import { CampaignStatus, CampaignStatusSchema } from "@/types/database";
import { PLATFORM_FEE_PCT, feeBreakdown } from "@/lib/campaign-budget";
import { isCampaignCategory } from "@/lib/campaign-category";
import { z } from "zod";
import { safeParse, uuidField } from "@/lib/validate";
import { validateCategoryMeta } from "@/lib/campaign-category-meta";
import { apiLog } from "@/lib/api/trace-log";

/**
 * Core campaign-payload shape (UX + defense-in-depth). The authoritative
 * integrity boundary is the database (RLS + the brand_cpm_rate / category_meta /
 * budget triggers); this catches malformed input early with a clear message.
 */
const CampaignCreateSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200, "Title is too long."),
  description: z.string().max(10_000, "Description is too long.").optional(),
  budget_total: z
    .number()
    .finite("Budget must be a number.")
    .positive("Budget must be greater than 0.")
    .max(10_000_000, "Budget is too large."),
  campaign_type: z.enum(["fixed", "performance"]).optional(),
  brand_cpm_rate: z.number().finite().nonnegative().max(100_000).nullable().optional(),
  cpm_rate: z.number().finite().nonnegative().max(100_000).nullable().optional(),
  budget_pool: z.number().finite().nonnegative().max(10_000_000).nullable().optional(),
  min_payout_threshold: z.number().finite().nonnegative().max(1_000_000).optional(),
  max_payout_per_clip: z.number().finite().positive().max(1_000_000).nullable().optional(),
  min_payout_per_clip: z.number().finite().positive().max(1_000_000).nullable().optional(),
}).refine(
  (data) =>
    data.max_payout_per_clip == null ||
    data.min_payout_per_clip == null ||
    data.min_payout_per_clip <= data.max_payout_per_clip,
  { message: "Per-clip minimum payout cannot exceed the per-clip maximum." }
);

/** Fields read off the campaign-creation payload (extra keys are passed through). */
interface CampaignInput {
  title?: string;
  description?: string;
  budget_total?: number;
  budget_pool?: number;
  /** Brand-set $ per 1,000 views (single source of truth for performance). */
  brand_cpm_rate?: number | null;
  campaign_type?: string;
  campaign_category?: string;
  category_meta?: Record<string, unknown>;
  content_rules?: Record<string, unknown>;
  cpm_rate?: number | null;
  max_payout_per_creator?: number | null;
  min_payout_threshold?: number | null;
  /** Per-clip ceiling (CR-style per-video max payout). */
  max_payout_per_clip?: number | null;
  /** Per-clip qualification floor (clip pays retroactively once reached). */
  min_payout_per_clip?: number | null;
  view_holdback_hours?: number;
  platforms?: string[];
  target_niches?: string[];
  target_audience?: Record<string, unknown>;
  deliverables?: unknown[];
  timeline?: Record<string, unknown>;
  status?: string;
  [key: string]: unknown;
}

/** Narrow an unknown thrown value to a human-readable message. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Fetch all campaigns for the current business. */
export async function getCampaignsAction() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("business_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return { success: true, campaigns: data };
  } catch (error) {
    console.error("Error in getCampaignsAction:", error);
    return { success: false, error: errorMessage(error) };
  }
}

/** Get campaign by ID. */
export async function getCampaignByIdAction(id: string) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    const { data: userRow } = user
      ? await supabase.from("users").select("role").eq("id", user.id).maybeSingle()
      : { data: null };
    const isCrossBrandBusiness =
      userRow?.role === "business" && data.business_id !== user?.id;

    if (isCrossBrandBusiness) {
      const publicCampaign = { ...data };
      delete publicCampaign.funding_payment_intent_id;
      delete publicCampaign.budget_reserved;
      delete publicCampaign.budget_paid;
      delete publicCampaign.available_pool;
      delete publicCampaign.funded_at;
      return { success: true, campaign: publicCampaign };
    }

    return { success: true, campaign: data };
  } catch (error) {
    console.error("Error in getCampaignByIdAction:", error);
    return { success: false, error: errorMessage(error) };
  }
}

/** Create a new campaign. */
export async function createCampaignAction(campaignData: CampaignInput) {
  // Reject malformed payloads early with a clear, safe message.
  const baseCheck = safeParse(CampaignCreateSchema, campaignData);
  if (!baseCheck.ok) {
    return { success: false, error: baseCheck.error };
  }

  // Brand-set CPM: performance campaigns MUST carry a positive brand rate. We
  // derive it from brand_cpm_rate (preferred) or the legacy cpm_rate, and write
  // BOTH columns to the same value so legacy reads stay correct.
  const isPerformance = campaignData.campaign_type === "performance";
  const brandCpm = isPerformance
    ? Number(campaignData.brand_cpm_rate ?? campaignData.cpm_rate ?? 0)
    : null;
  if (isPerformance && (!Number.isFinite(brandCpm) || (brandCpm ?? 0) <= 0)) {
    return {
      success: false,
      error: "A performance campaign requires a brand CPM rate greater than 0.",
    };
  }

  let normalizedCategory: "ugc" | "clipping" | null = null;
  let normalizedMeta: Record<string, unknown> = {};
  if (isPerformance) {
    const categoryRaw = campaignData.campaign_category;
    if (!isCampaignCategory(categoryRaw)) {
      apiLog("alert", "campaign.create.category_missing", {
        campaignType: campaignData.campaign_type,
        category: categoryRaw,
      });
      return {
        success: false,
        error: "Choose UGC or Clipping for this performance campaign.",
      };
    }
    const metaCheck = validateCategoryMeta(categoryRaw, campaignData.category_meta);
    if (!metaCheck.ok) {
      apiLog("alert", "campaign.create.category_meta_invalid", {
        category: categoryRaw,
        error: metaCheck.error,
      });
      return { success: false, error: metaCheck.error };
    }
    normalizedCategory = metaCheck.category;
    normalizedMeta = metaCheck.meta;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data, error } = await supabase
      .from("campaigns")
      .insert({
        business_id: user.id,
        title: campaignData.title,
        description: campaignData.description,
        budget_total: campaignData.budget_total,
        target_niches: campaignData.target_niches || [],
        target_audience: campaignData.target_audience || {},
        deliverables: campaignData.deliverables || [],
        timeline: campaignData.timeline || {},
        // Performance campaigns must be funded before going live → always 'draft' here.
        status: isPerformance ? "draft" : campaignData.status || "draft",
        campaign_type: campaignData.campaign_type || "fixed",
        // UGC vs Clipping sub-type (performance only); fixed campaigns stay NULL.
        campaign_category: normalizedCategory,
        category_meta: isPerformance ? normalizedMeta : {},
        // Brand-set CPM is the single source of truth; cpm_rate kept in sync.
        brand_cpm_rate: isPerformance ? brandCpm : null,
        cpm_rate: isPerformance ? brandCpm : null,
        budget_pool: isPerformance
          ? campaignData.budget_pool ?? campaignData.budget_total
          : null,
        // Platform fee model: 10% retained; creators earn from available_pool (90%).
        platform_fee_pct: isPerformance ? PLATFORM_FEE_PCT : null,
        available_pool: isPerformance
          ? feeBreakdown(Number(campaignData.budget_pool ?? campaignData.budget_total)).creators
          : null,
        max_payout_per_creator: isPerformance
          ? campaignData.max_payout_per_creator ?? null
          : null,
        min_payout_threshold: isPerformance
          ? campaignData.min_payout_threshold ?? 10
          : 10,
        max_payout_per_clip: isPerformance
          ? campaignData.max_payout_per_clip ?? null
          : null,
        min_payout_per_clip: isPerformance
          ? campaignData.min_payout_per_clip ?? null
          : null,
        platforms: campaignData.platforms || [],
        view_holdback_hours: campaignData.view_holdback_hours ?? 48,
        content_rules: campaignData.content_rules || {},
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, campaign: data };
  } catch (error) {
    console.error("Error in createCampaignAction:", error);
    return { success: false, error: errorMessage(error) };
  }
}

/** Update campaign status. */
export async function updateCampaignStatusAction(id: string, status: CampaignStatus) {
  const statusCheck = safeParse(CampaignStatusSchema, status);
  if (!statusCheck.ok) return { success: false, error: statusCheck.error };
  const idCheck = safeParse(uuidField, id);
  if (!idCheck.ok) return { success: false, error: idCheck.error };

  try {
    const { data, error } = await supabase
      .from("campaigns")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, campaign: data };
  } catch (error) {
    console.error("Error in updateCampaignStatusAction:", error);
    return { success: false, error: errorMessage(error) };
  }
}

/** Subscribe to campaign changes (Supabase Realtime). */
export function subscribeToCampaignChanges(callback: (payload: unknown) => void) {
  const channel = supabase
    .channel("custom-campaigns-channel")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "campaigns" },
      (payload) => {
        callback(payload);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
