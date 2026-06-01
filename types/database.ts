import { z } from "zod";

// 1. Enum Definitions
export const UserRoleSchema = z.enum(["business", "influencer", "admin"]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const CampaignStatusSchema = z.enum([
  "draft",
  "open",
  "in_progress",
  "completed",
  "cancelled",
]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const ParticipationStatusSchema = z.enum([
  "applied",
  "offered",
  "accepted",
  "declined",
  "completed",
  "cancelled",
]);
export type ParticipationStatus = z.infer<typeof ParticipationStatusSchema>;

export const TransactionTypeSchema = z.enum([
  "escrow",
  "release",
  "bonus",
  "refund",
  "payout",
]);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const TransactionStatusSchema = z.enum([
  "pending",
  "succeeded",
  "failed",
  "refunded",
]);
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>;


// 2. Table Zod Schemas

// Users Schema
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: UserRoleSchema,
  created_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]),
});
export type DbUser = z.infer<typeof UserSchema>;

// Profiles Schema
export const ProfileSchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string(),
  avatar_url: z.string().url().nullable().optional(),
  bio: z.string().nullable().optional(),
  niches: z.array(z.string()).default([]),
  follower_count: z.number().int().nonnegative().default(0),
  engagement_rate: z.number().nonnegative().default(0.00),
  audience_demographics: z.record(z.string(), z.any()).default({}),
  social_handles: z.record(z.string(), z.any()).default({}),
  rate_card: z.record(z.string(), z.any()).default({}),
  authenticity_score: z.number().min(0).max(1).default(1.00),
  availability: z.record(z.string(), z.any()).default({}),
  embedding: z.array(z.number()).length(1536).nullable().optional(), // Vector embedding representation
  created_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]),
});
export type DbProfile = z.infer<typeof ProfileSchema>;

// Campaigns Schema
export const CampaignSchema = z.object({
  id: z.string().uuid(),
  business_id: z.string().uuid(),
  title: z.string().min(1, "Title is required"),
  description: z.string().nullable().optional(),
  budget_total: z.number().positive("Budget must be positive"),
  budget_allocated: z.number().nonnegative().default(0.00),
  target_niches: z.array(z.string()).default([]),
  target_audience: z.record(z.string(), z.any()).default({}),
  deliverables: z.array(z.any()).default([]),
  timeline: z.record(z.string(), z.any()).default({}),
  status: CampaignStatusSchema.default("draft"),
  embedding: z.array(z.number()).length(1536).nullable().optional(),
  created_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]),
});
export type DbCampaign = z.infer<typeof CampaignSchema>;

// Participations Schema
export const ParticipationSchema = z.object({
  id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  influencer_id: z.string().uuid(),
  status: ParticipationStatusSchema.default("applied"),
  proposed_payout: z.number().positive(),
  actual_payout: z.number().nonnegative().default(0.00),
  performance_data: z.record(z.string(), z.any()).default({}),
  applied_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]),
});
export type DbParticipation = z.infer<typeof ParticipationSchema>;

// Posts Schema
export const PostMetricsSchema = z.object({
  impressions: z.number().int().nonnegative().optional(),
  reach: z.number().int().nonnegative().optional(),
  likes: z.number().int().nonnegative().optional(),
  comments: z.number().int().nonnegative().optional(),
  shares: z.number().int().nonnegative().optional(),
  engagement_rate: z.number().nonnegative().optional(),
});
export type PostMetrics = z.infer<typeof PostMetricsSchema>;

export const PostSchema = z.object({
  id: z.string().uuid(),
  participation_id: z.string().uuid(),
  platform: z.string(),
  post_url: z.string().url("Must be a valid URL"),
  metrics: PostMetricsSchema.default({}),
  submitted_at: z.union([z.date(), z.string()]),
  approved_at: z.union([z.date(), z.string()]).nullable().optional(),
  created_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]),
});
export type DbPost = z.infer<typeof PostSchema>;

// Transactions Schema
export const TransactionSchema = z.object({
  id: z.string().uuid(),
  participation_id: z.string().uuid().nullable().optional(),
  amount: z.number().positive(),
  type: TransactionTypeSchema,
  stripe_payment_intent_id: z.string().nullable().optional(),
  status: TransactionStatusSchema.default("pending"),
  created_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]),
});
export type DbTransaction = z.infer<typeof TransactionSchema>;

// Notifications Schema
export const NotificationSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  content: z.string(),
  type: z.string(),
  is_read: z.boolean().default(false),
  created_at: z.union([z.date(), z.string()]),
});
export type DbNotification = z.infer<typeof NotificationSchema>;

// Ratings Schema
export const RatingSchema = z.object({
  id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  reviewer_id: z.string().uuid(),
  reviewee_id: z.string().uuid(),
  score: z.number().int().min(1).max(5),
  comment: z.string().nullable().optional(),
  created_at: z.union([z.date(), z.string()]),
});
export type DbRating = z.infer<typeof RatingSchema>;
