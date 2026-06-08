import { NextResponse } from "next/server";
import { getSociavaultApiKey } from "@/lib/env.server";
import { guardApiPost } from "@/lib/api/guard";
import { MetricsFetchBodySchema } from "@/lib/api/schemas";
import { isInternalCronCall } from "@/lib/api/auth";
import { createClient } from "@/lib/supabase/server";
import { forbiddenError } from "@/lib/api/response";
import { methodNotAllowed } from "@/lib/api/guard";

/**
 * Detect social platform from post URL
 */
function detectPlatform(url: string): "instagram" | "tiktok" | null {
  const lowercaseUrl = url.toLowerCase();
  if (
    lowercaseUrl.includes("instagram.com") || 
    lowercaseUrl.includes("instagr.am") || 
    lowercaseUrl.includes("ig.me")
  ) {
    return "instagram";
  }
  if (lowercaseUrl.includes("tiktok.com")) {
    return "tiktok";
  }
  return null;
}

export const GET = () => methodNotAllowed(["POST"]);

export async function POST(request: Request) {
  try {
    const guarded = await guardApiPost(request, {
      schema: MetricsFetchBodySchema,
      rateLimit: "metrics",
      routeKey: "metrics/fetch",
      auth: true,
      allowCronBearer: true,
    });
    if (!guarded.ok) return guarded.response;

    const { post_url, participation_id } = guarded.ctx.data;
    let platform = guarded.ctx.data.platform;

    const internalCron = isInternalCronCall(request);

    if (!internalCron) {
      return forbiddenError("Manual social metrics refresh is disabled during the YouTube-only beta.");
    }

    if (!platform) {
      platform = detectPlatform(post_url) ?? undefined;
    }

    if (platform !== "instagram" && platform !== "tiktok") {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to detect platform. Must be Instagram or TikTok URL.",
        },
        { status: 400 }
      );
    }

    const apiKey = getSociavaultApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "Metrics provider is not configured (SOCIAVAULT_API_KEY)." },
        { status: 503 }
      );
    }

    let metricsData;

    {
      // Call the SociaVault public scraping endpoints.
      try {
        const endpoint = platform === "instagram"
          ? `https://api.sociavault.com/v1/scrape/instagram/post-info?url=${encodeURIComponent(post_url)}`
          : `https://api.sociavault.com/v1/scrape/tiktok/video-info?url=${encodeURIComponent(post_url)}`;

        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            "x-api-key": apiKey,
          },
          next: { revalidate: 60 } // Cache results for 1 minute
        });

        if (!response.ok) {
          return NextResponse.json(
            {
              success: false,
              error: `SociaVault API returned status ${response.status}. Link might be private or rate-limited.`,
            },
            { status: 502 }
          );
        } else {
          const json = await response.json();
          const raw = json.data || json;

          // Robust parsing support for different returned naming structures
          if (platform === "instagram") {
            const views = raw.video_play_count || raw.play_count || raw.views || 0;
            const likes = raw.edge_media_preview_like?.count || raw.like_count || raw.likes || 0;
            const comments = raw.edge_media_to_parent_comment?.count || raw.comment_count || raw.comments || 0;
            const shares = raw.share_count || raw.shares || 0;
            const saves = raw.save_count || raw.saves || 0;
            
            // Extract caption
            let caption = "";
            if (raw.edge_media_to_caption?.edges?.[0]?.node?.text) {
              caption = raw.edge_media_to_caption.edges[0].node.text;
            } else {
              caption = raw.caption || raw.text || "";
            }

            const engagement_rate = views > 0 
              ? parseFloat((((likes + comments + shares + saves) / views) * 100).toFixed(2))
              : 0;

            metricsData = {
              views,
              likes,
              comments,
              shares,
              saves,
              engagement_rate,
              caption,
              platform,
              fetched_at: new Date().toISOString()
            };
          } else {
            // TikTok parsing
            const views = raw.play_count || raw.views || 0;
            const likes = raw.digg_count || raw.like_count || raw.likes || 0;
            const comments = raw.comment_count || raw.comments || 0;
            const shares = raw.share_count || raw.shares || 0;
            const saves = raw.collect_count || raw.saves || 0;
            const caption = raw.desc || raw.caption || raw.title || "";
            
            const engagement_rate = views > 0 
              ? parseFloat((((likes + comments + shares + saves) / views) * 100).toFixed(2))
              : 0;

            metricsData = {
              views,
              likes,
              comments,
              shares,
              saves,
              engagement_rate,
              caption,
              platform,
              fetched_at: new Date().toISOString()
            };
          }
        }
      } catch (err) {
        console.error("SociaVault scraper call failed:", err);
        return NextResponse.json(
          {
            success: false,
            error: `Connection to metrics provider failed: ${err instanceof Error ? err.message : String(err)}`,
          },
          { status: 500 }
        );
      }
    }

    // Save/update to the database.
    if (metricsData) {
      try {
        const supabase = await createClient();
        const { views, likes, comments, shares, saves, engagement_rate, fetched_at } = metricsData;

        // 1. Look up existing post by URL
        const { data: existingPost } = await supabase
          .from("posts")
          .select("id, participation_id")
          .eq("post_url", post_url)
          .maybeSingle();

        let activeParticipationId = participation_id;

        if (existingPost) {
          activeParticipationId = existingPost.participation_id;
          
          // Update post record
          const { error: postUpdateErr } = await supabase
            .from("posts")
            .update({
              views,
              likes,
              comments,
              shares,
              saves,
              engagement_rate,
              fetched_at,
              platform,
              metrics: { views, likes, comments, shares, saves, engagement_rate } // Sync JSONB metrics object for compatibility
            })
            .eq("id", existingPost.id);
            
          if (postUpdateErr) throw postUpdateErr;
        } else if (activeParticipationId) {
          // Insert new post record linked to the participation contract
          const { error: postInsertErr } = await supabase
            .from("posts")
            .insert({
              participation_id: activeParticipationId,
              platform,
              post_url,
              views,
              likes,
              comments,
              shares,
              saves,
              engagement_rate,
              fetched_at,
              metrics: { views, likes, comments, shares, saves, engagement_rate }
            });

          if (postInsertErr) throw postInsertErr;
        }

        // 2. Aggregate all posts for this participation to synchronize with performance_data (Live ROI)
        if (activeParticipationId) {
          const { data: siblingPosts } = await supabase
            .from("posts")
            .select("views, likes, comments, shares, saves, engagement_rate")
            .eq("participation_id", activeParticipationId);

          if (siblingPosts && siblingPosts.length > 0) {
            let aggregateViews = 0;
            let aggregateLikes = 0;
            let aggregateComments = 0;
            let aggregateShares = 0;
            let aggregateSaves = 0;
            let aggregateErSum = 0;

            siblingPosts.forEach(p => {
              aggregateViews += p.views || 0;
              aggregateLikes += p.likes || 0;
              aggregateComments += p.comments || 0;
              aggregateShares += p.shares || 0;
              aggregateSaves += p.saves || 0;
              aggregateErSum += Number(p.engagement_rate || 0);
            });

            const averageEr = parseFloat((aggregateErSum / siblingPosts.length).toFixed(2));
            const estimatedClicks = Math.round(aggregateViews * 0.05); // 5% click conversion baseline
            const estimatedConversions = Math.round(estimatedClicks * 0.02); // 2% sales conversion baseline
            const attributedValue = estimatedConversions * 85; // $85 Average Order Value (AOV)

            // Update participation summary metrics
            const { error: partUpdateErr } = await supabase
              .from("participations")
              .update({
                performance_data: {
                  impressions: aggregateViews,
                  clicks: estimatedClicks,
                  conversions: estimatedConversions,
                  attributed_value: attributedValue,
                  likes: aggregateLikes,
                  comments: aggregateComments,
                  shares: aggregateShares,
                  saves: aggregateSaves,
                  engagement_rate: averageEr,
                  updated_at: new Date().toISOString()
                }
              })
              .eq("id", activeParticipationId);

            if (partUpdateErr) throw partUpdateErr;
          }
        }
      } catch (dbErr) {
        console.error("Database sync operation failed:", dbErr);
        // Still return the metrics even if DB write fails, but include a warning.
        return NextResponse.json({
          success: true,
          metrics: metricsData,
          warning: `Metrics fetched but failed to sync to database: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      metrics: metricsData,
    });
  } catch (err) {
    console.error("Route handler crashed:", err);
    return NextResponse.json(
      { success: false, error: `Server error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
