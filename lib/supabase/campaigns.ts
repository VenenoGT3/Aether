import { supabase, isMockMode, getMockUser } from "./client";
import { CampaignStatus } from "@/types/database";
import { PLATFORM_FEE_PCT, feeBreakdown } from "@/lib/campaign-budget";

const LOCAL_STORAGE_KEY = "aether-campaigns";

/** A campaign as stored in mock localStorage / accepted by create. Loosely typed
 * (extra performance fields vary) but free of `any`. */
type CampaignRecord = Record<string, unknown>;

/** Fields read off the campaign-creation payload (extra keys are passed through). */
interface CampaignInput {
  title?: string;
  description?: string;
  budget_total?: number;
  budget_pool?: number;
  campaign_type?: string;
  campaign_category?: string;
  category_meta?: Record<string, unknown>;
  content_rules?: Record<string, unknown>;
  cpm_rate?: number | null;
  max_payout_per_creator?: number | null;
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

// Pre-seeded mock campaigns for initial development
const DEFAULT_MOCK_CAMPAIGNS = [
  {
    id: "camp_1",
    business_id: "mock-business-uuid",
    title: "Summer Tech Capsule",
    description: "Looking for minimal design and aesthetic creators to review the Aether mechanical keyboard and desk mat capsule collection.",
    budget_total: 2500,
    budget_allocated: 2500,
    target_niches: ["Tech", "Design", "Minimal"],
    target_audience: {
      location: "United States",
      ageRange: "18-34",
      gender: "All",
      minimumFollowers: 15000
    },
    deliverables: [
      { type: "post", quantity: 1, details: "Instagram carousel showing desk setup aesthetics" },
      { type: "video", quantity: 1, details: "15s TikTok showcasing keyboard sound profile" }
    ],
    timeline: {
      startDate: "2026-06-01",
      endDate: "2026-06-15",
      draftDueDate: "2026-06-08"
    },
    status: "in_progress" as CampaignStatus,
    campaign_type: "fixed",
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    influencer: {
      name: "Marcus Vance",
      handle: "@marcusv",
      avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
    }
  },
  {
    id: "camp_2",
    business_id: "mock-business-uuid",
    title: "Aether Lifestyle Launch",
    description: "Launch campaign for the new Aether workspace organization application. Emphasize digital productivity and mindfulness.",
    budget_total: 4500,
    budget_allocated: 0,
    target_niches: ["Lifestyle", "Design", "Wellness"],
    target_audience: {
      location: "Global",
      ageRange: "21-45",
      gender: "All",
      minimumFollowers: 30000
    },
    deliverables: [
      { type: "video", quantity: 1, details: "YouTube integration (60s dedicated review section)" },
      { type: "story", quantity: 3, details: "Instagram stories with links to sign up page" }
    ],
    timeline: {
      startDate: "2026-06-15",
      endDate: "2026-06-30",
      draftDueDate: "2026-06-22"
    },
    status: "open" as CampaignStatus,
    campaign_type: "fixed",
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    id: "camp_3",
    business_id: "mock-business-uuid",
    title: "Minimalist Workspace Review",
    description: "Review of aesthetic workspace desk setups and recommendations for minimalist organizer trays.",
    budget_total: 1200,
    budget_allocated: 1200,
    target_niches: ["Minimal", "Design"],
    target_audience: {
      location: "Europe",
      ageRange: "18-30",
      gender: "All",
      minimumFollowers: 8000
    },
    deliverables: [
      { type: "post", quantity: 2, details: "High-resolution photos showcasing organizer tray placement" }
    ],
    timeline: {
      startDate: "2026-05-10",
      endDate: "2026-05-25",
      draftDueDate: "2026-05-18"
    },
    status: "completed" as CampaignStatus,
    campaign_type: "fixed",
    created_at: new Date(Date.now() - 86400000 * 15).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    influencer: {
      name: "Dave Miller",
      handle: "@davem",
      avatar_url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
    }
  },
  {
    id: "camp_perf_1",
    business_id: "mock-business-uuid",
    title: "Aether Clip Challenge — Earn Per View",
    description: "Open clipping campaign. Cut short-form clips from our launch footage and earn for every view. No application needed — join, post, get paid per 1,000 views.",
    budget_total: 10000,
    budget_pool: 10000,
    platform_fee_pct: 0.1,
    available_pool: 9000,
    budget_reserved: 1840,
    budget_paid: 920,
    cpm_rate: 2.5,
    max_payout_per_creator: 1500,
    view_holdback_hours: 48,
    platforms: ["tiktok", "instagram", "youtube"],
    campaign_category: "clipping",
    category_meta: {
      source_url: "https://drive.google.com/aether-launch-footage",
      min_duration_sec: 10,
      max_duration_sec: 60,
      requirements: "Hook in first 2s, vertical 9:16, tag @aether.",
    },
    content_rules: { notes: "Hook in first 2s, tag @aether, no competing brands, keep it vertical." },
    target_niches: ["Tech", "Design", "Lifestyle"],
    target_audience: { location: "Global", ageRange: "18-34", gender: "All", minimumFollowers: 0 },
    deliverables: [],
    timeline: { startDate: "2026-05-25", endDate: "2026-06-30", draftDueDate: "2026-06-30" },
    status: "open" as CampaignStatus,
    campaign_type: "performance",
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString()
  }
];

// Helper to load mock campaigns from localStorage
function getMockCampaigns(): CampaignRecord[] {
  if (typeof window === "undefined") return DEFAULT_MOCK_CAMPAIGNS;
  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!stored) {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(DEFAULT_MOCK_CAMPAIGNS));
    return DEFAULT_MOCK_CAMPAIGNS;
  }
  try {
    return JSON.parse(stored);
  } catch {
    return DEFAULT_MOCK_CAMPAIGNS;
  }
}

// Helper to save mock campaigns to localStorage
function saveMockCampaigns(campaigns: CampaignRecord[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(campaigns));
    window.dispatchEvent(new Event("campaigns-update"));
  }
}

/**
 * Fetch all campaigns for the current business
 */
export async function getCampaignsAction() {
  if (isMockMode) {
    const campaigns = getMockCampaigns();
    return { success: true, campaigns };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Fetch campaigns created by this business
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

/**
 * Get campaign by ID
 */
export async function getCampaignByIdAction(id: string) {
  if (isMockMode) {
    const campaigns = getMockCampaigns();
    const campaign = campaigns.find((c) => c.id === id);
    if (!campaign) return { success: false, error: "Campaign not found" };
    return { success: true, campaign };
  }

  try {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return { success: true, campaign: data };
  } catch (error) {
    console.error("Error in getCampaignByIdAction:", error);
    return { success: false, error: errorMessage(error) };
  }
}

/**
 * Create a new campaign
 */
export async function createCampaignAction(campaignData: CampaignInput) {
  const mockUser = getMockUser();
  
  if (isMockMode) {
    const campaigns = getMockCampaigns();
    const isPerformance = campaignData.campaign_type === "performance";
    const mockPool = campaignData.budget_pool ?? campaignData.budget_total;
    const mockFee = feeBreakdown(Number(mockPool));
    const newCampaign = {
      ...campaignData,
      id: "camp_" + Math.random().toString(36).substring(2, 9),
      business_id: mockUser.user_id,
      budget_allocated: 0,
      campaign_type: campaignData.campaign_type || "fixed",
      // Performance pool accounting (starts empty). Platform retains 10%; creators
      // earn from available_pool (90%).
      ...(isPerformance
        ? {
            budget_pool: mockPool,
            platform_fee_pct: PLATFORM_FEE_PCT,
            available_pool: mockFee.creators,
            budget_reserved: 0,
            budget_paid: 0,
            funded_at: null,
          }
        : {}),
      // Performance campaigns must be funded before going live → always 'draft' here.
      status: isPerformance ? "draft" : campaignData.status || "draft",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    campaigns.unshift(newCampaign);
    saveMockCampaigns(campaigns);
    return { success: true, campaign: newCampaign };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const isPerformance = campaignData.campaign_type === "performance";
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
        // Performance-clipping fields (Phase 6)
        campaign_type: campaignData.campaign_type || "fixed",
        // UGC vs Clipping sub-type (performance only); fixed campaigns stay NULL.
        campaign_category: isPerformance
          ? campaignData.campaign_category ?? "clipping"
          : null,
        category_meta: isPerformance ? campaignData.category_meta ?? {} : {},
        cpm_rate: isPerformance ? campaignData.cpm_rate ?? null : null,
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

/**
 * Update campaign status
 */
export async function updateCampaignStatusAction(id: string, status: CampaignStatus) {
  if (isMockMode) {
    const campaigns = getMockCampaigns();
    const index = campaigns.findIndex((c) => c.id === id);
    if (index === -1) return { success: false, error: "Campaign not found" };
    
    campaigns[index] = {
      ...campaigns[index],
      status,
      updated_at: new Date().toISOString()
    };
    
    saveMockCampaigns(campaigns);
    return { success: true, campaign: campaigns[index] };
  }

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

/**
 * Helper to subscribe to campaign changes (Realtime)
 */
export function subscribeToCampaignChanges(callback: (payload: unknown) => void) {
  if (isMockMode) {
    // Client-side local storage event triggers
    const handleUpdate = () => {
      const campaigns = getMockCampaigns();
      callback({ new: campaigns });
    };
    window.addEventListener("campaigns-update", handleUpdate);
    return () => window.removeEventListener("campaigns-update", handleUpdate);
  }

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
