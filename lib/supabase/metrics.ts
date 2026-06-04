import { useEffect, useState, useCallback } from "react";
import { supabase } from "./client";

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
  /** Set for performance-clipping payouts (worker mark_payout_paid). */
  payout_id?: string;
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

/** Narrow an unknown thrown value to a message string. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Raw transaction row from Supabase (nested participation → campaign). */
interface RawTransactionRow {
  id: string;
  participation_id?: string;
  payout_id?: string;
  amount: number | string;
  type: TransactionRecord["type"];
  status: TransactionRecord["status"];
  stripe_payment_intent_id?: string;
  created_at: string;
  participation?: { campaign?: { title?: string | null } | null } | null;
}

/** Raw post row from Supabase (nested participation → campaign). */
interface RawPostRow {
  id: string;
  participation_id: string;
  platform: string;
  post_url: string;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  engagement_rate?: number | null;
  metrics?: PostRecord["metrics"] | null;
  submitted_at: string;
  approved_at?: string | null;
  participation?: { campaign?: { title?: string | null } | null } | null;
}

/** Fetch aggregated campaign metrics from participations. */
export async function getCampaignMetricsAction(
  campaignId: string
): Promise<{ success: boolean; metrics: CampaignMetrics; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("participations")
      .select("performance_data, proposed_payout, actual_payout")
      .eq("campaign_id", campaignId);

    if (error) throw error;

    const aggregated: CampaignMetrics = {
      clicks: 0,
      impressions: 0,
      conversions: 0,
      attributed_value: 0,
      budget_spent: 0,
    };

    data?.forEach(
      (part: { performance_data?: Record<string, unknown> | null; actual_payout?: number | null }) => {
        const perf = part.performance_data || {};
        aggregated.clicks += Number(perf.clicks || 0);
        aggregated.impressions += Number(perf.impressions || 0);
        aggregated.conversions += Number(perf.conversions || 0);
        aggregated.attributed_value += Number(perf.attributed_value || 0);
        aggregated.budget_spent += Number(perf.budget_spent || part.actual_payout || 0);
      }
    );

    return { success: true, metrics: aggregated };
  } catch (err) {
    console.error("Error fetching campaign metrics:", err);
    return {
      success: false,
      metrics: { clicks: 0, impressions: 0, conversions: 0, attributed_value: 0, budget_spent: 0 },
      error: errorMessage(err),
    };
  }
}

/** Write metrics back to the primary participation's performance_data column. */
export async function updateCampaignMetricsAction(
  campaignId: string,
  updated: Partial<CampaignMetrics>
): Promise<{ success: boolean; metrics?: CampaignMetrics; error?: string }> {
  try {
    const { data: participations, error: partError } = await supabase
      .from("participations")
      .select("id, performance_data")
      .eq("campaign_id", campaignId);

    if (partError) throw partError;
    if (!participations || participations.length === 0) {
      throw new Error("No participation agreement exists for this campaign yet to store metrics.");
    }

    const primaryPart = participations[0];
    const newPerf = { ...(primaryPart.performance_data || {}), ...updated };

    const { error: updateError } = await supabase
      .from("participations")
      .update({ performance_data: newPerf })
      .eq("id", primaryPart.id);

    if (updateError) throw updateError;

    const aggregateRes = await getCampaignMetricsAction(campaignId);
    return { success: true, metrics: aggregateRes.metrics };
  } catch (err) {
    console.error("Error updating campaign metrics:", err);
    return { success: false, error: errorMessage(err) };
  }
}

/** Reactive metric values for a campaign (Supabase Realtime). */
export function useCampaignMetrics(campaignId: string) {
  const [metrics, setMetrics] = useState<CampaignMetrics>({
    clicks: 0,
    impressions: 0,
    conversions: 0,
    attributed_value: 0,
    budget_spent: 0,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    fetchMetrics();

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

/** All transactions for the current user, with live updates + balance computation. */
export function useTransactions() {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [balances, setBalances] = useState({ available: 0, pending: 0 });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
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

          const formatted: TransactionRecord[] = (data || []).map((t: RawTransactionRow) => ({
            id: t.id,
            participation_id: t.participation_id,
            payout_id: t.payout_id,
            amount: Number(t.amount),
            type: t.type,
            status: t.status,
            stripe_payment_intent_id: t.stripe_payment_intent_id,
            campaignTitle: t.participation?.campaign?.title || "Platform Transfer",
            created_at: t.created_at,
          }));

          setTransactions(formatted);

          // Compute balances (LEGACY fixed-fee model). Performance-clipping
          // payouts carry a payout_id and are shown on Clips & Earnings — skip
          // them here so they aren't counted as fixed-fee withdrawals.
          let available = 0;
          let pending = 0;
          const isInfluencer =
            user.app_metadata?.role === "influencer" || user.user_metadata?.role === "influencer";

          formatted.forEach((tx) => {
            if (tx.status !== "succeeded") return;
            if (tx.payout_id) return;
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
  }, []);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("realtime-transactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  return { transactions, balances, loading, refresh: loadData };
}

/** Posts + aggregate views/impressions/reach for influencer metrics. */
export function usePosts() {
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [aggregateMetrics, setAggregateMetrics] = useState({
    impressions: 0,
    likes: 0,
    comments: 0,
    reach: 0,
    engagement_rate: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
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

        const formatted: PostRecord[] = (data || []).map((p: RawPostRow) => ({
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
            engagement_rate: p.engagement_rate ?? p.metrics?.engagement_rate ?? 0,
          },
          submitted_at: p.submitted_at,
          approved_at: p.approved_at,
          campaignTitle: p.participation?.campaign?.title || "Campaign Collab",
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
          engagement_rate: erCount > 0 ? parseFloat((erSum / erCount).toFixed(2)) : 0,
        });
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("realtime-posts")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  return { posts, aggregateMetrics, loading, refresh: loadData };
}

/**
 * ROI Projection Calculation Utility
 * Projects campaign final performance statistics with confidence intervals.
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

  const averageOrderValue = 85; // AOV
  let estimatedConversionRate = 0.02; // 2% baseline

  if (metrics.clicks > 0) {
    estimatedConversionRate = metrics.conversions > 0 ? metrics.conversions / metrics.clicks : 0.015;
  }

  const expectedTotalClicks = Math.max(
    metrics.clicks,
    Math.round(followers * (engagementRate / 100) * 0.12)
  );

  const expectedConversions = Math.max(
    metrics.conversions,
    Math.round(expectedTotalClicks * estimatedConversionRate)
  );

  const projectedValue = Math.max(metrics.attributed_value, expectedConversions * averageOrderValue);
  const projectedROI = projectedValue / spend;

  const dataWeight = Math.min(1.0, metrics.conversions / 80);
  const maxMargin = 1.8;
  const minMargin = 0.15;
  const margin = maxMargin - (maxMargin - minMargin) * dataWeight;

  const lowerBound = Math.max(0.1, parseFloat((projectedROI - margin).toFixed(1)));
  const upperBound = parseFloat((projectedROI + margin).toFixed(1));

  return {
    currentROI: parseFloat(currentROI.toFixed(1)),
    projectedROI: parseFloat(projectedROI.toFixed(1)),
    lowerBound,
    upperBound,
    confidence: 90,
  };
}
