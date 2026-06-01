import { useEffect, useState, useCallback } from "react";
import { supabase, isMockMode } from "./client";

export interface CampaignMetrics {
  clicks: number;
  impressions: number;
  conversions: number;
  attributed_value: number; // conversions * order value, or manually entered
  budget_spent: number; // total budget spent
}

export interface TransactionRecord {
  id: string;
  participation_id?: string;
  amount: number;
  type: "escrow" | "release" | "bonus" | "refund" | "payout";
  status: "pending" | "succeeded" | "failed" | "refunded";
  stripe_payment_intent_id?: string;
  campaignTitle?: string; // helper for display
  created_at: string;
}

export interface PostRecord {
  id: string;
  participation_id: string;
  platform: string;
  post_url: string;
  metrics: {
    impressions?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    engagement_rate?: number;
  };
  submitted_at: string;
  approved_at?: string | null;
  campaignTitle?: string;
}

// Key definitions for localStorage
const METRICS_LS_KEY = "aether-campaign-metrics";
const TRANSACTIONS_LS_KEY = "aether-mock-transactions";
const POSTS_LS_KEY = "aether-mock-posts";

// Default Seed Metrics for campaigns (in Mock Mode)
const DEFAULT_SEED_METRICS: Record<string, CampaignMetrics> = {
  camp_1: {
    clicks: 450,
    impressions: 12000,
    conversions: 65,
    attributed_value: 8500,
    budget_spent: 2500
  },
  camp_2: {
    clicks: 820,
    impressions: 25000,
    conversions: 110,
    attributed_value: 14400,
    budget_spent: 4500
  },
  camp_3: {
    clicks: 210,
    impressions: 6000,
    conversions: 32,
    attributed_value: 4200,
    budget_spent: 1200
  }
};

// Default Seed Transactions (in Mock Mode)
const DEFAULT_SEED_TRANSACTIONS: TransactionRecord[] = [
  {
    id: "tx_mock_1",
    participation_id: "p1p07384-d113-4a11-9a74-d4b998cf0005",
    amount: 1200,
    type: "release",
    status: "succeeded",
    stripe_payment_intent_id: "tr_3Mxt82LkdIwHu7ix3b4t",
    campaignTitle: "Minimalist Workspace Review",
    created_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    id: "tx_mock_2",
    participation_id: "p1p07384-d113-4a11-9a74-d4b998cf0005",
    amount: 1200,
    type: "escrow",
    status: "succeeded",
    stripe_payment_intent_id: "pi_3Mxt82LkdIwHu7ix1a2s",
    campaignTitle: "Minimalist Workspace Review",
    created_at: new Date(Date.now() - 86400000 * 12).toISOString()
  },
  {
    id: "tx_mock_3",
    participation_id: "p1p07384-d113-4a11-9a74-d4b998cf0003",
    amount: 4500,
    type: "escrow",
    status: "succeeded",
    stripe_payment_intent_id: "pi_3Mxt82LkdIwHu7ix4c8r",
    campaignTitle: "Aether Lifestyle Launch",
    created_at: new Date(Date.now() - 86400000 * 7).toISOString()
  },
  // Add some historical transactions from Jan to May 2026 to populate charts beautifully
  {
    id: "tx_hist_1",
    amount: 4000,
    type: "release",
    status: "succeeded",
    campaignTitle: "Q1 Campaign Launch",
    created_at: "2026-01-15T10:00:00Z"
  },
  {
    id: "tx_hist_2",
    amount: 5500,
    type: "release",
    status: "succeeded",
    campaignTitle: "Spring Apparel Collab",
    created_at: "2026-02-20T12:00:00Z"
  },
  {
    id: "tx_hist_3",
    amount: 8200,
    type: "release",
    status: "succeeded",
    campaignTitle: "Workspace Overhaul v2",
    created_at: "2026-03-18T15:30:00Z"
  },
  {
    id: "tx_hist_4",
    amount: 7000,
    type: "release",
    status: "succeeded",
    campaignTitle: "Tech Setup Review Series",
    created_at: "2026-04-22T09:15:00Z"
  },
  {
    id: "tx_hist_5",
    amount: 12500,
    type: "release",
    status: "succeeded",
    campaignTitle: "Lifestyle Gear Campaign",
    created_at: "2026-05-05T14:20:00Z"
  }
];

// Default Seed Posts (in Mock Mode)
const DEFAULT_SEED_POSTS: PostRecord[] = [
  {
    id: "post_mock_1",
    participation_id: "p1p07384-d113-4a11-9a74-d4b998cf0005",
    platform: "instagram",
    post_url: "https://instagram.com/p/C7X892-boost",
    metrics: {
      likes: 1100,
      reach: 15000,
      shares: 45,
      comments: 85,
      impressions: 18000,
      engagement_rate: 4.8
    },
    submitted_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    approved_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    campaignTitle: "Minimalist Workspace Review"
  },
  {
    id: "post_mock_2",
    participation_id: "p1p07384-d113-4a11-9a74-d4b998cf0003",
    platform: "tiktok",
    post_url: "https://tiktok.com/@sofiac/video/7392813",
    metrics: {
      likes: 3400,
      reach: 32000,
      shares: 120,
      comments: 290,
      impressions: 38000,
      engagement_rate: 5.1
    },
    submitted_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    approved_at: null,
    campaignTitle: "Aether Lifestyle Launch"
  }
];

// Helper to initialize local storage seeds in mock mode
function initLocalStorageMock() {
  if (typeof window === "undefined") return;

  if (!localStorage.getItem(METRICS_LS_KEY)) {
    localStorage.setItem(METRICS_LS_KEY, JSON.stringify(DEFAULT_SEED_METRICS));
  }
  if (!localStorage.getItem(TRANSACTIONS_LS_KEY)) {
    localStorage.setItem(TRANSACTIONS_LS_KEY, JSON.stringify(DEFAULT_SEED_TRANSACTIONS));
  }
  if (!localStorage.getItem(POSTS_LS_KEY)) {
    localStorage.setItem(POSTS_LS_KEY, JSON.stringify(DEFAULT_SEED_POSTS));
  }
}

/**
 * Fetch Campaign Metrics Action
 */
export async function getCampaignMetricsAction(campaignId: string): Promise<{ success: boolean; metrics: CampaignMetrics; error?: string }> {
  if (isMockMode) {
    initLocalStorageMock();
    const allMetrics = JSON.parse(localStorage.getItem(METRICS_LS_KEY) || "{}");
    const metrics = allMetrics[campaignId] || {
      clicks: 0,
      impressions: 0,
      conversions: 0,
      attributed_value: 0,
      budget_spent: 0
    };
    return { success: true, metrics };
  }

  try {
    // In real mode, we fetch metrics from participations (performance_data column)
    const { data, error } = await supabase
      .from("participations")
      .select("performance_data, proposed_payout, actual_payout")
      .eq("campaign_id", campaignId);

    if (error) throw error;

    // Aggregate metrics across all participations
    const aggregated: CampaignMetrics = {
      clicks: 0,
      impressions: 0,
      conversions: 0,
      attributed_value: 0,
      budget_spent: 0
    };

    data?.forEach((part: any) => {
      const perf = part.performance_data || {};
      aggregated.clicks += Number(perf.clicks || 0);
      aggregated.impressions += Number(perf.impressions || 0);
      aggregated.conversions += Number(perf.conversions || 0);
      aggregated.attributed_value += Number(perf.attributed_value || 0);
      // Budget spent = actual payout or proposed payout if escrow funded/released
      aggregated.budget_spent += Number(perf.budget_spent || part.actual_payout || 0);
    });

    return { success: true, metrics: aggregated };
  } catch (err: any) {
    console.error("Error fetching campaign metrics:", err);
    return {
      success: false,
      metrics: { clicks: 0, impressions: 0, conversions: 0, attributed_value: 0, budget_spent: 0 },
      error: err.message
    };
  }
}

/**
 * Update Campaign Metrics Action
 */
export async function updateCampaignMetricsAction(
  campaignId: string,
  updated: Partial<CampaignMetrics>
): Promise<{ success: boolean; metrics?: CampaignMetrics; error?: string }> {
  if (isMockMode) {
    initLocalStorageMock();
    const allMetrics = JSON.parse(localStorage.getItem(METRICS_LS_KEY) || "{}");
    const current = allMetrics[campaignId] || {
      clicks: 0,
      impressions: 0,
      conversions: 0,
      attributed_value: 0,
      budget_spent: 0
    };

    const next = { ...current, ...updated };
    allMetrics[campaignId] = next;
    localStorage.setItem(METRICS_LS_KEY, JSON.stringify(allMetrics));

    // Dispatch global events for instant reactivity in other page segments
    window.dispatchEvent(new Event("aether-metrics-update"));
    window.dispatchEvent(new Event("storage"));

    return { success: true, metrics: next };
  }

  try {
    // In real mode, we write metrics back to the primary participation's performance_data column.
    // Fetch participations for the campaign
    const { data: participations, error: partError } = await supabase
      .from("participations")
      .select("id, performance_data")
      .eq("campaign_id", campaignId);

    if (partError) throw partError;
    if (!participations || participations.length === 0) {
      throw new Error("No participation agreement exists for this campaign yet to store metrics.");
    }

    // Update the first active/accepted agreement
    const primaryPart = participations[0];
    const newPerf = {
      ...(primaryPart.performance_data || {}),
      ...updated
    };

    const { error: updateError } = await supabase
      .from("participations")
      .update({ performance_data: newPerf })
      .eq("id", primaryPart.id);

    if (updateError) throw updateError;

    // Trigger calculation aggregate
    const aggregateRes = await getCampaignMetricsAction(campaignId);
    return { success: true, metrics: aggregateRes.metrics };
  } catch (err: any) {
    console.error("Error updating campaign metrics:", err);
    return { success: false, error: err.message };
  }
}

/**
 * React Hook: useCampaignMetrics
 * Returns reactive metric values for a campaign, keeping track of updates
 */
export function useCampaignMetrics(campaignId: string) {
  const [metrics, setMetrics] = useState<CampaignMetrics>({
    clicks: 0,
    impressions: 0,
    conversions: 0,
    attributed_value: 0,
    budget_spent: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    const res = await getCampaignMetricsAction(campaignId);
    if (res.success) {
      setMetrics(res.metrics);
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    fetchMetrics();

    // Listen to changes
    if (isMockMode) {
      const handleUpdate = () => {
        fetchMetrics();
      };
      window.addEventListener("aether-metrics-update", handleUpdate);
      window.addEventListener("storage", handleUpdate);
      return () => {
        window.removeEventListener("aether-metrics-update", handleUpdate);
        window.removeEventListener("storage", handleUpdate);
      };
    } else {
      // Supabase Realtime channel subscription
      const channel = supabase
        .channel(`realtime-metrics-${campaignId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "participations", filter: `campaign_id=eq.${campaignId}` },
          () => {
            fetchMetrics();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [campaignId, fetchMetrics]);

  const updateMetrics = async (newVal: Partial<CampaignMetrics>) => {
    const res = await updateCampaignMetricsAction(campaignId, newVal);
    if (res.success && res.metrics) {
      setMetrics(res.metrics);
    }
    return res;
  };

  return { metrics, loading, updateMetrics, refresh: fetchMetrics };
}

/**
 * React Hook: useTransactions
 * Returns all transactions dynamically, supporting real-time updates
 */
export function useTransactions() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [balances, setBalances] = useState({ available: 0, pending: 0 });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    if (isMockMode) {
      initLocalStorageMock();
      const list: TransactionRecord[] = JSON.parse(localStorage.getItem(TRANSACTIONS_LS_KEY) || "[]");
      setTransactions(list);

      // Compute balances dynamically for the active role
      let available = 0;
      let pending = 0;
      const role = localStorage.getItem("aether-mock-role") || "business";

      list.forEach((tx) => {
        if (tx.status !== "succeeded") return;
        const amt = tx.amount;

        if (role === "influencer") {
          if (tx.type === "release" || tx.type === "bonus") {
            available += amt;
          } else if (tx.type === "payout") {
            available -= amt;
          } else if (tx.type === "escrow") {
            // Pending until released
            const released = list.some(
              (r) => r.participation_id === tx.participation_id && r.type === "release"
            );
            if (!released) {
              pending += amt;
            }
          }
        } else {
          // Business view
          if (tx.type === "escrow") {
            const released = list.some(
              (r) => r.participation_id === tx.participation_id && r.type === "release"
            );
            if (!released) {
              pending += amt;
            }
          } else if (tx.type === "release") {
            available += amt; // tracks total paid out
          }
        }
      });

      setBalances({ available, pending });
      setLoading(false);
    } else {
      // Real Mode query
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) {
          setLoading(false);
          return;
        }

        supabase
          .from("transactions")
          .select(`
            *,
            participation:participation_id (
              *,
              campaign:campaign_id (*)
            )
          `)
          .order("created_at", { ascending: false })
          .then(({ data, error }) => {
            if (error) {
              console.error(error);
              setLoading(false);
              return;
            }

            const formatted: TransactionRecord[] = (data || []).map((t: any) => ({
              id: t.id,
              participation_id: t.participation_id,
              amount: Number(t.amount),
              type: t.type,
              status: t.status,
              stripe_payment_intent_id: t.stripe_payment_intent_id,
              campaignTitle: t.participation?.campaign?.title || "Platform Transfer",
              created_at: t.created_at
            }));

            setTransactions(formatted);

            // Compute balances
            let available = 0;
            let pending = 0;
            const isInfluencer = user.app_metadata?.role === "influencer" || user.user_metadata?.role === "influencer";

            formatted.forEach((tx) => {
              if (tx.status !== "succeeded") return;
              const amt = tx.amount;

              if (isInfluencer) {
                if (tx.type === "release" || tx.type === "bonus") {
                  available += amt;
                } else if (tx.type === "payout") {
                  available -= amt;
                } else if (tx.type === "escrow") {
                  const released = formatted.some(
                    (r) => r.participation_id === tx.participation_id && r.type === "release"
                  );
                  if (!released) {
                    pending += amt;
                  }
                }
              } else {
                if (tx.type === "escrow") {
                  const released = formatted.some(
                    (r) => r.participation_id === tx.participation_id && r.type === "release"
                  );
                  if (!released) {
                    pending += amt;
                  }
                } else if (tx.type === "release") {
                  available += amt;
                }
              }
            });

            setBalances({ available, pending });
            setLoading(false);
          });
      });
    }
  }, []);

  useEffect(() => {
    loadData();

    if (isMockMode) {
      const handleUpdate = () => {
        loadData();
      };
      window.addEventListener("aether-transactions-update", handleUpdate);
      window.addEventListener("storage", handleUpdate);
      window.addEventListener("role-change", handleUpdate);
      return () => {
        window.removeEventListener("aether-transactions-update", handleUpdate);
        window.removeEventListener("storage", handleUpdate);
        window.removeEventListener("role-change", handleUpdate);
      };
    } else {
      const channel = supabase
        .channel("realtime-transactions")
        .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
          loadData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loadData]);

  return { transactions, balances, loading, refresh: loadData };
}

/**
 * React Hook: usePosts
 * Returns posts and aggregates views/impressions/reach for influencer metrics
 */
export function usePosts() {
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [aggregateMetrics, setAggregateMetrics] = useState({
    impressions: 0,
    likes: 0,
    comments: 0,
    reach: 0,
    engagement_rate: 0
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    if (isMockMode) {
      initLocalStorageMock();
      const list: PostRecord[] = JSON.parse(localStorage.getItem(POSTS_LS_KEY) || "[]");
      setPosts(list);

      let imp = 0, lk = 0, cm = 0, rch = 0, erSum = 0, erCount = 0;
      list.forEach((p) => {
        imp += p.metrics.impressions || 0;
        lk += p.metrics.likes || 0;
        cm += p.metrics.comments || 0;
        rch += p.metrics.reach || 0;
        if (p.metrics.engagement_rate) {
          erSum += p.metrics.engagement_rate;
          erCount++;
        }
      });

      setAggregateMetrics({
        impressions: imp,
        likes: lk,
        comments: cm,
        reach: rch,
        engagement_rate: erCount > 0 ? parseFloat((erSum / erCount).toFixed(2)) : 0
      });
      setLoading(false);
    } else {
      supabase
        .from("posts")
        .select(`
          *,
          participation:participation_id (
            *,
            campaign:campaign_id (*)
          )
        `)
        .order("submitted_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.error(error);
            setLoading(false);
            return;
          }

          const formatted: PostRecord[] = (data || []).map((p: any) => ({
            id: p.id,
            participation_id: p.participation_id,
            platform: p.platform,
            post_url: p.post_url,
            metrics: {
              impressions: p.views ?? p.metrics?.impressions ?? 0,
              likes: p.likes ?? p.metrics?.likes ?? 0,
              comments: p.comments ?? p.metrics?.comments ?? 0,
              shares: p.shares ?? p.metrics?.shares ?? 0,
              reach: p.views ? Math.round(p.views * 0.8) : p.metrics?.reach ?? 0,
              engagement_rate: p.engagement_rate ?? p.metrics?.engagement_rate ?? 0
            },
            submitted_at: p.submitted_at,
            approved_at: p.approved_at,
            campaignTitle: p.participation?.campaign?.title || "Campaign Collab"
          }));

          setPosts(formatted);

          let imp = 0, lk = 0, cm = 0, rch = 0, erSum = 0, erCount = 0;
          formatted.forEach((p) => {
            imp += p.metrics.impressions || 0;
            lk += p.metrics.likes || 0;
            cm += p.metrics.comments || 0;
            rch += p.metrics.reach || 0;
            if (p.metrics.engagement_rate) {
              erSum += p.metrics.engagement_rate;
              erCount++;
            }
          });

          setAggregateMetrics({
            impressions: imp,
            likes: lk,
            comments: cm,
            reach: rch,
            engagement_rate: erCount > 0 ? parseFloat((erSum / erCount).toFixed(2)) : 0
          });
          setLoading(false);
        });
    }
  }, []);

  useEffect(() => {
    loadData();

    if (isMockMode) {
      const handleUpdate = () => {
        loadData();
      };
      window.addEventListener("aether-posts-update", handleUpdate);
      window.addEventListener("storage", handleUpdate);
      return () => {
        window.removeEventListener("aether-posts-update", handleUpdate);
        window.removeEventListener("storage", handleUpdate);
      };
    } else {
      const channel = supabase
        .channel("realtime-posts")
        .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
          loadData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loadData]);

  return { posts, aggregateMetrics, loading, refresh: loadData };
}

/**
 * ROI Projection Calculation Utility
 * Projects campaign final performance statistics with confidence intervals
 */
export interface ROIProjection {
  currentROI: number;
  projectedROI: number;
  lowerBound: number;
  upperBound: number;
  confidence: number;
}

export function calculateROIProjection(
  budget: number,
  metrics: CampaignMetrics,
  engagementRate = 4.8,
  followers = 48500
): ROIProjection {
  const spend = metrics.budget_spent || budget || 1000;
  const currentROI = metrics.budget_spent > 0 ? metrics.attributed_value / metrics.budget_spent : 0;
  
  // Standard conversion metrics
  const averageOrderValue = 85; // AOV
  let estimatedConversionRate = 0.02; // 2% baseline

  if (metrics.clicks > 0) {
    estimatedConversionRate = metrics.conversions > 0 ? metrics.conversions / metrics.clicks : 0.015;
  }

  // Calculate expected total clicks based on followers reach and engagement if actual clicks are low
  const expectedTotalClicks = Math.max(
    metrics.clicks,
    Math.round(followers * (engagementRate / 100) * 0.12)
  );

  // Calculate expected total conversions based on clicks
  const expectedConversions = Math.max(
    metrics.conversions,
    Math.round(expectedTotalClicks * estimatedConversionRate)
  );

  // Projected value = actual value or expected conversions * AOV
  const projectedValue = Math.max(metrics.attributed_value, expectedConversions * averageOrderValue);
  const projectedROI = projectedValue / spend;

  // Margin of error decays as actual conversions increase (uncertainty shrinks)
  const dataWeight = Math.min(1.0, metrics.conversions / 80); // max certainty around 80 conversions
  const maxMargin = 1.8; // Wide confidence range initially
  const minMargin = 0.15; // Narrow range when many conversions are tracked
  const margin = maxMargin - (maxMargin - minMargin) * dataWeight;

  const lowerBound = Math.max(0.1, parseFloat((projectedROI - margin).toFixed(1)));
  const upperBound = parseFloat((projectedROI + margin).toFixed(1));

  return {
    currentROI: parseFloat(currentROI.toFixed(1)),
    projectedROI: parseFloat(projectedROI.toFixed(1)),
    lowerBound,
    upperBound,
    confidence: 90
  };
}
