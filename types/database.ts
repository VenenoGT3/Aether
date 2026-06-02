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
  // Performance-clipping open-join states (Phase 2)
  "active",
  "banned",
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

// Profiles Schema — PK is user_id (FK to public.users.id), not id
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
  onboarded: z.boolean().default(false).optional(),
  trusted_creator: z.boolean().default(false).optional(),
  company_name: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  company_size: z.string().nullable().optional(),
  stripe_connect_id: z.string().nullable().optional(),
  stripe_onboarding_completed: z.boolean().default(false).optional(),
  // Ayrshare account linking for view tracking (NULL = not linked)
  ayrshare_profile_key: z.string().nullable().optional(),
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
  // Performance-clipping fields (Phase 1, additive — fixed campaigns leave these unset)
  campaign_type: z.enum(["fixed", "performance"]).default("fixed").optional(),
  // Performance sub-type: ugc (original from a brief) vs clipping (cut from source).
  campaign_category: z.enum(["ugc", "clipping"]).nullable().optional(),
  category_meta: z.record(z.string(), z.any()).default({}).optional(),
  content_rules: z.record(z.string(), z.any()).default({}).optional(),
  cpm_rate: z.number().nonnegative().nullable().optional(),
  budget_pool: z.number().nonnegative().nullable().optional(),
  budget_reserved: z.number().nonnegative().default(0).optional(),
  budget_paid: z.number().nonnegative().default(0).optional(),
  max_payout_per_creator: z.number().nonnegative().nullable().optional(),
  min_payout_threshold: z.number().nonnegative().default(10).optional(),
  platforms: z.array(z.string()).default([]).optional(),
  view_holdback_hours: z.number().int().nonnegative().default(48).optional(),
  funding_payment_intent_id: z.string().nullable().optional(),
  funded_at: z.union([z.date(), z.string()]).nullable().optional(),
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
  // Nullable for performance/open-join campaigns (no negotiated fee).
  proposed_payout: z.number().nonnegative().nullable().default(0).optional(),
  actual_payout: z.number().nonnegative().default(0.00),
  performance_data: z.record(z.string(), z.any()).default({}),
  // Performance-clipping rollups (Phase 1, additive)
  total_views: z.number().int().nonnegative().default(0).optional(),
  total_earned: z.number().nonnegative().default(0).optional(),
  total_paid: z.number().nonnegative().default(0).optional(),
  // Creator's chosen $ per 1,000 views (NULL => campaign base CPM).
  creator_cpm_rate: z.number().nonnegative().nullable().optional(),
  joined_at: z.union([z.date(), z.string()]).optional(),
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
  views: z.number().int().nonnegative().default(0).optional(),
  likes: z.number().int().nonnegative().default(0).optional(),
  comments: z.number().int().nonnegative().default(0).optional(),
  shares: z.number().int().nonnegative().default(0).optional(),
  saves: z.number().int().nonnegative().default(0).optional(),
  engagement_rate: z.number().nonnegative().default(0.00).optional(),
  fetched_at: z.union([z.date(), z.string()]).nullable().optional(),
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


// ---------------------------------------------------------------------------
// Performance-Clipping schemas (Phase 1)
// ---------------------------------------------------------------------------

export const ClipStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "tracking",
  "disqualified",
]);
export type ClipStatus = z.infer<typeof ClipStatusSchema>;

export const EarningStatusSchema = z.enum([
  "accrued",
  "approved",
  "paid",
  "reversed",
]);
export type EarningStatus = z.infer<typeof EarningStatusSchema>;

export const PayoutStatusSchema = z.enum([
  "pending",
  "processing",
  "paid",
  "failed",
]);
export type PayoutStatus = z.infer<typeof PayoutStatusSchema>;

// Clips Schema — individual content submissions (many per participation)
export const ClipSchema = z.object({
  id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  participation_id: z.string().uuid(),
  creator_id: z.string().uuid(),
  platform: z.string(),
  post_url: z.string().url("Must be a valid URL"),
  external_post_id: z.string().nullable().optional(),
  ayrshare_ref: z.record(z.string(), z.any()).default({}),
  status: ClipStatusSchema.default("pending"),
  counted_views: z.number().int().nonnegative().default(0),
  current_views: z.number().int().nonnegative().default(0),
  last_synced_at: z.union([z.date(), z.string()]).nullable().optional(),
  // Brand moderation metadata (Phase 3)
  reviewed_at: z.union([z.date(), z.string()]).nullable().optional(),
  reviewed_by: z.string().uuid().nullable().optional(),
  review_note: z.string().nullable().optional(),
  created_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]),
});
export type DbClip = z.infer<typeof ClipSchema>;

// View Snapshots Schema — append-only time series for deltas + fraud detection
export const ViewSnapshotSchema = z.object({
  id: z.union([z.number(), z.string()]),
  clip_id: z.string().uuid(),
  views: z.number().int().nonnegative().default(0),
  likes: z.number().int().nonnegative().default(0),
  comments: z.number().int().nonnegative().default(0),
  shares: z.number().int().nonnegative().default(0),
  source: z.string().default("ayrshare"),
  captured_at: z.union([z.date(), z.string()]),
});
export type DbViewSnapshot = z.infer<typeof ViewSnapshotSchema>;

// Earnings Schema — immutable record of each views -> money accrual
export const EarningSchema = z.object({
  id: z.string().uuid(),
  clip_id: z.string().uuid(),
  participation_id: z.string().uuid(),
  campaign_id: z.string().uuid(),
  creator_id: z.string().uuid(),
  billable_views: z.number().int().nonnegative(),
  effective_cpm: z.number().nonnegative(),
  amount: z.number().nonnegative(),
  status: EarningStatusSchema.default("accrued"),
  payout_id: z.string().uuid().nullable().optional(),
  accrued_at: z.union([z.date(), z.string()]),
});
export type DbEarning = z.infer<typeof EarningSchema>;

// Payouts Schema — batched transfers to a creator
export const PayoutSchema = z.object({
  id: z.string().uuid(),
  creator_id: z.string().uuid(),
  amount: z.number().positive(),
  status: PayoutStatusSchema.default("pending"),
  stripe_transfer_id: z.string().nullable().optional(),
  idempotency_key: z.string(),
  created_at: z.union([z.date(), z.string()]),
  updated_at: z.union([z.date(), z.string()]),
});
export type DbPayout = z.infer<typeof PayoutSchema>;
