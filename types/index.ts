export type UserRole = "business" | "influencer";

export interface SocialLinks {
  tiktok?: string;
  instagram?: string;
  youtube?: string;
}

export interface RateCard {
  post?: number;
  video?: number;
  story?: number;
}

export interface PortfolioItem {
  title: string;
  description: string;
  url: string;
}

export interface Profile {
  /** FK to auth.users.id — matches profiles.user_id in the database */
  user_id: string;
  role: UserRole;
  full_name: string;
  avatar_url: string;
  onboarded: boolean;
  /** Trusted creators have their clips auto-approved on submit. */
  trusted_creator?: boolean;
  email?: string;
  
  // Business fields
  company_name?: string;
  website?: string;
  industry?: string;
  company_size?: string;
  stripe_connect_id?: string;
  stripe_onboarding_completed?: boolean;
  
  // Influencer fields
  social_handle?: string; // Backwards compatibility for mock
  bio?: string;
  niche?: string;
  followers?: number;
  engagement_rate?: number;
  social_links?: SocialLinks;
  rate_card?: RateCard;
  portfolio?: PortfolioItem[];
  
  created_at?: string;
}
