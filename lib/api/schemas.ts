import { z } from "zod";

export const uuid = z.string().uuid({ message: "Invalid ID format." });
const url = z.string().url({ message: "Must be a valid URL." }).max(2048);
const shortText = z.string().trim().min(1, "Cannot be empty.").max(500);
const mediumText = z.string().trim().min(1).max(5000);
const optionalMediumText = z.string().trim().max(5000).optional();
const tone = z.enum(["professional", "energetic", "creative"]);

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
      })
    )
    .min(1)
    .max(50),
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
  post_url: url,
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
  pitch: z.string().trim().max(5000).optional(),
  _hp: honeypot,
});

export const PostSubmitBodySchema = z.object({
  post_url: url,
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

export const CampaignSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  niche: z.string().trim().max(80).optional().default(""),
  page: z.coerce.number().int().min(1).max(100).optional().default(1),
  limit: z.coerce.number().int().min(1).max(30).optional().default(20),
});

export type AiPitchBody = z.infer<typeof AiPitchBodySchema>;
export type AiDiscoverBody = z.infer<typeof AiDiscoverBodySchema>;
export type CampaignApplyBody = z.infer<typeof CampaignApplyBodySchema>;
export type PostSubmitBody = z.infer<typeof PostSubmitBodySchema>;
export type CampaignSearchQuery = z.infer<typeof CampaignSearchQuerySchema>;