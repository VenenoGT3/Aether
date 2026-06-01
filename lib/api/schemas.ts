import { z } from "zod";

const uuid = z.string().uuid();
const url = z.string().url().max(2048);
const shortText = z.string().trim().min(1).max(500);
const mediumText = z.string().trim().min(1).max(5000);
const tone = z.enum(["professional", "energetic", "creative"]);

export const AiPitchBodySchema = z.object({
  campaign: z.object({
    title: shortText,
    description: mediumText.optional(),
    brandName: z.string().trim().max(200).optional(),
  }),
  creator: z.object({
    name: shortText,
    bio: mediumText.optional(),
    niches: z.array(z.string().trim().max(80)).max(20).optional(),
    niche: z.string().trim().max(80).optional(),
    followers: z.number().int().nonnegative().max(500_000_000).optional(),
    engagement: z.number().min(0).max(100).optional(),
  }),
  tone: tone.optional(),
});

export const AiDiscoverBodySchema = z.object({
  creator: z.object({
    name: shortText,
    bio: mediumText.optional(),
    niches: z.array(z.string().trim().max(80)).min(1).max(20),
    followers: z.number().int().nonnegative().max(500_000_000),
    engagement: z.number().min(0).max(100),
  }),
  campaigns: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        title: shortText,
        description: mediumText.optional(),
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
});

export const AiSafetyBodySchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  platform: z.string().trim().max(50).optional(),
  guidelines: z.array(z.string().trim().max(500)).max(30).optional(),
});

export const MetricsFetchBodySchema = z.object({
  post_url: url,
  participation_id: uuid.optional(),
  platform: z.enum(["instagram", "tiktok"]).optional(),
});

export type AiPitchBody = z.infer<typeof AiPitchBodySchema>;
export type AiDiscoverBody = z.infer<typeof AiDiscoverBodySchema>;
export type AiPredictBody = z.infer<typeof AiPredictBodySchema>;
export type AiSafetyBody = z.infer<typeof AiSafetyBodySchema>;
export type MetricsFetchBody = z.infer<typeof MetricsFetchBodySchema>;