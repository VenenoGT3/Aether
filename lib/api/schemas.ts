import { z } from "zod";
import {
  isAllowedPostUrl,
  isSuspiciousSearchQuery,
  sanitizeSearchQuery,
} from "@/lib/api/abuse";

export const uuid = z.string().uuid({ message: "Invalid ID format." });

const socialPostUrl = z
  .string()
  .url({ message: "Must be a valid URL." })
  .max(2048)
  .refine(isAllowedPostUrl, {
    message: "Post URL must be from Instagram, TikTok, or YouTube.",
  });

const shortText = z.string().trim().min(1, "Cannot be empty.").max(500);
const mediumText = z.string().trim().min(1).max(5000);
const optionalMediumText = z.string().trim().max(5000).optional();
const pitchText = z
  .string()
  .trim()
  .min(10, "Pitch must be at least 10 characters.")
  .max(5000, "Pitch is too long (max 5000 characters).")
  .optional();
const tone = z.enum(["professional", "energetic", "creative"]);

const searchQuery = z
  .string()
  .trim()
  .max(200, "Search query is too long.")
  .optional()
  .default("")
  .transform(sanitizeSearchQuery)
  .refine((q) => !isSuspiciousSearchQuery(q), {
    message: "Search query contains invalid characters.",
  });

/** Honeypot — hidden field must stay empty */
const honeypot = z
  .string()
  .optional()
  .refine((v) => v === undefined || v === "", {
    message: "Invalid submission.",
  });

// --- AI routes ---

export const AiPitchBodySchema = z.object({
  campaign: z.object({
    title: shortText,
    description: optionalMediumText,
    brandName: z.string().trim().max(200).optional(),
    budget: z.number().nonnegative().max(100_000_000).optional(),
    niches: z.array(z.string().trim().max(80)).max(20).optional(),
  }),
  creator: z.object({
    name: shortText,
    bio: optionalMediumText,
    niches: z.array(z.string().trim().max(80)).max(20).optional(),
    niche: z.string().trim().max(80).optional(),
    followers: z.number().int().nonnegative().max(500_000_000).optional(),
    engagement: z.number().min(0).max(100).optional(),
  }),
  tone: tone.optional(),
  _hp: honeypot,
});

export const AiDiscoverBodySchema = z.object({
  creator: z.object({
    name: shortText,
    bio: optionalMediumText,
    niches: z.array(z.string().trim().max(80)).min(1).max(20),
    followers: z.number().int().nonnegative().max(500_000_000),
    engagement: z.number().min(0).max(100),
  }),
  campaigns: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        title: shortText,
        description: optionalMediumText,
        businessName: z.string().trim().max(200).optional(),
        budget_total: z.number().nonnegative().max(100_000_000),
        target_niches: z.array(z.string().trim().max(80)).max(20),
        deliverables: z.array(z.unknown()).max(50).optional(),
        timeline: z.record(z.string(), z.unknown()).optional(),
        payout_speed: z.string().trim().max(50).optional(),
        days_left: z.number().int().optional(),
        image_url: z.string().max(2048).optional(),
        // Preserve performance-model fields through AI re-ranking (Zod strips
        // unknown keys, so they must be declared to survive the round-trip).
        campaign_type: z.enum(["fixed", "performance"]).optional(),
        campaign_category: z.enum(["ugc", "clipping"]).nullable().optional(),
        cpm_rate: z.number().nonnegative().nullable().optional(),
        budget_pool: z.number().nonnegative().nullable().optional(),
      })
    )
    .min(1)
    .max(25),
  _hp: honeypot,
});

export const AiPredictBodySchema = z.object({
  campaign: z.object({
    title: shortText,
    budget: z.number().positive().max(100_000_000),
    brief: z
      .object({
        objectives: z.array(z.string().trim().max(500)).max(20).optional(),
        guidelines: z.array(z.string().trim().max(500)).max(20).optional(),
      })
      .optional(),
  }),
  metrics: z.object({
    views: z.number().int().nonnegative().max(10_000_000_000),
    likes: z.number().int().nonnegative().max(10_000_000_000),
    comments: z.number().int().nonnegative().max(10_000_000_000),
    shares: z.number().int().nonnegative().max(10_000_000_000),
    clicks: z.number().int().nonnegative().max(10_000_000_000),
    conversions: z.number().int().nonnegative().max(10_000_000_000),
    budget_spent: z.number().nonnegative().max(100_000_000),
    attributed_value: z.number().nonnegative().max(100_000_000),
  }),
  creator: z
    .object({
      followers: z.number().int().nonnegative().optional(),
      engagement: z.number().min(0).max(100).optional(),
      niches: z.array(z.string().trim().max(80)).max(20).optional(),
    })
    .optional(),
  _hp: honeypot,
});

export const AiSafetyBodySchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  platform: z.string().trim().max(50).optional(),
  guidelines: z.array(z.string().trim().max(500)).max(30).optional(),
  _hp: honeypot,
});

export const MetricsFetchBodySchema = z.object({
  post_url: socialPostUrl,
  participation_id: uuid.optional(),
  platform: z.enum(["instagram", "tiktok"]).optional(),
  _hp: honeypot,
});

// --- Campaign apply / search / post submit ---

export const CampaignApplyBodySchema = z.object({
  proposed_payout: z
    .number()
    .positive("Proposed payout must be greater than zero.")
    .max(100_000_000, "Proposed payout is too large."),
  pitch: pitchText,
  _hp: honeypot,
});

export const PostSubmitBodySchema = z.object({
  post_url: socialPostUrl,
  platform: z.enum(["instagram", "tiktok", "youtube"]).optional(),
  caption: z.string().trim().max(2200).optional(),
  metrics: z
    .object({
      views: z.number().int().nonnegative().max(10_000_000_000).optional(),
      likes: z.number().int().nonnegative().max(10_000_000_000).optional(),
      comments: z.number().int().nonnegative().max(10_000_000_000).optional(),
      shares: z.number().int().nonnegative().max(10_000_000_000).optional(),
      saves: z.number().int().nonnegative().max(10_000_000_000).optional(),
      engagement_rate: z.number().min(0).max(100).optional(),
    })
    .optional(),
  _hp: honeypot,
});

// --- Performance clipping: open join + clip submission (Phase 2) ---

/**
 * Joining a performance campaign needs no pitch/fee. The creator may optionally
 * propose their own CPM (pay per 1,000 views); the service clamps it to the
 * campaign's offered rate. Omitted => the campaign's base CPM is used.
 */
export const CampaignJoinBodySchema = z.object({
  creator_cpm_rate: z.number().nonnegative().max(100_000).optional(),
  _hp: honeypot,
});

/** Pool-funding admin actions (reconcile / cancel) take no body fields. */
export const CampaignFundingBodySchema = z.object({
  _hp: honeypot,
});

export const ClipSubmitBodySchema = z.object({
  campaign_id: uuid,
  post_url: socialPostUrl,
  platform: z.enum(["instagram", "tiktok", "youtube"]).optional(),
  _hp: honeypot,
});

// Brand moderation (Phase 3 + quality control)
export const ApproveClipBodySchema = z.object({
  // Optional 1–10 quality rating recorded on approval.
  quality_score: z.number().int().min(1).max(10).optional(),
  _hp: honeypot,
});

export const RejectClipBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .max(1000, "Reason is too long (max 1000 characters).")
    .optional(),
  _hp: honeypot,
});

/** Request changes: the brand MUST say what to fix so the creator can resubmit. */
export const RequestChangesClipBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Tell the creator what to change.")
    .max(1000, "Feedback is too long (max 1000 characters)."),
  quality_score: z.number().int().min(1).max(10).optional(),
  _hp: honeypot,
});

export const CampaignSearchQuerySchema = z.object({
  q: searchQuery,
  niche: z
    .string()
    .trim()
    .max(80)
    .optional()
    .default("")
    .transform(sanitizeSearchQuery),
  page: z.coerce.number().int().min(1).max(100).optional().default(1),
  limit: z.coerce.number().int().min(1).max(30).optional().default(20),
});

export type AiPitchBody = z.infer<typeof AiPitchBodySchema>;
export type AiDiscoverBody = z.infer<typeof AiDiscoverBodySchema>;
export type CampaignApplyBody = z.infer<typeof CampaignApplyBodySchema>;
export type PostSubmitBody = z.infer<typeof PostSubmitBodySchema>;
export type CampaignJoinBody = z.infer<typeof CampaignJoinBodySchema>;
export type CampaignFundingBody = z.infer<typeof CampaignFundingBodySchema>;
export type ClipSubmitBody = z.infer<typeof ClipSubmitBodySchema>;
export type ApproveClipBody = z.infer<typeof ApproveClipBodySchema>;
export type RejectClipBody = z.infer<typeof RejectClipBodySchema>;
export type RequestChangesClipBody = z.infer<typeof RequestChangesClipBodySchema>;
export type CampaignSearchQuery = z.infer<typeof CampaignSearchQuerySchema>;