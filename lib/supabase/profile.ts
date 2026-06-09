import type { UserRole } from "@/types";
import type { DbProfile } from "@/types/database";
import type { Profile } from "@/types";

/**
 * Primary key column on public.profiles.
 * profiles.user_id is the FK to auth.users.id — there is no profiles.id column.
 */
export const PROFILE_PK_COLUMN = "user_id" as const;

export type ProfileRow = DbProfile & {
  onboarded?: boolean;
  company_name?: string | null;
  website?: string | null;
  industry?: string | null;
  company_size?: string | null;
  stripe_connect_id?: string | null;
  stripe_onboarding_completed?: boolean;
};

/** Merge a profiles row with role/email from public.users / auth.users */
export function mergeProfileWithUser(
  profile: ProfileRow,
  role: UserRole | string | undefined,
  email?: string | null
): Profile {
  return {
    user_id: profile.user_id,
    role: (role as UserRole) || "influencer",
    full_name: profile.full_name ?? "",
    avatar_url: profile.avatar_url ?? "",
    onboarded: profile.onboarded ?? false,
    email: email ?? undefined,
    company_name: profile.company_name ?? undefined,
    website: profile.website ?? undefined,
    industry: profile.industry ?? undefined,
    company_size: profile.company_size ?? undefined,
    stripe_connect_id: profile.stripe_connect_id ?? undefined,
    stripe_onboarding_completed:
      profile.stripe_onboarding_completed ?? undefined,
    bio: profile.bio ?? undefined,
    niche: profile.niches?.[0],
    followers: profile.follower_count,
    engagement_rate: profile.engagement_rate
      ? Number(profile.engagement_rate)
      : undefined,
    social_links: profile.social_handles as Profile["social_links"],
    rate_card: profile.rate_card as Profile["rate_card"],
    created_at:
      typeof profile.created_at === "string"
        ? profile.created_at
        : profile.created_at?.toString(),
  };
}
