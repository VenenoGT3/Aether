import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const isMockMode = 
  !supabaseUrl || 
  !supabaseAnonKey || 
  supabaseUrl.includes("placeholder-url") || 
  supabaseUrl.includes("your-project-id");

const supabase = createClient(
  supabaseUrl || "https://placeholder-url.supabase.co",
  supabaseAnonKey || "placeholder-anon-key"
);

export async function GET(request: Request) {
  try {
    // 1. Optional security check for Vercel Cron or custom header
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    // In production, enforce cron authorization if secret is defined
    if (process.env.NODE_ENV === "production" && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    let refreshedCount = 0;
    const postsDetails: Array<{ url: string; status: string }> = [];

    if (isMockMode) {
      // Mock mode: simulate metrics updates in localStorage
      refreshedCount = 3;
      postsDetails.push(
        { url: "https://instagram.com/p/C7X892-boost", status: "refreshed_mock" },
        { url: "https://tiktok.com/@sofiac/video/7392813", status: "refreshed_mock" },
        { url: "https://youtube.com/watch?v=marcusworkspacereview", status: "refreshed_mock" }
      );

      // Slightly increase numbers in mock metrics and posts list in browser context if accessible
      if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
        const storedPosts = localStorage.getItem("aether-mock-posts");
        if (storedPosts) {
          try {
            const list = JSON.parse(storedPosts);
            list.forEach((p: any) => {
              if (p.metrics) {
                p.metrics.impressions += Math.round(Math.random() * 400 + 100);
                p.metrics.likes += Math.round(Math.random() * 30 + 5);
                p.metrics.comments += Math.round(Math.random() * 4 + 1);
                if (p.metrics.impressions > 0) {
                  p.metrics.engagement_rate = parseFloat((((p.metrics.likes + p.metrics.comments + (p.metrics.shares || 0)) / p.metrics.impressions) * 100).toFixed(2));
                }
              }
            });
            localStorage.setItem("aether-mock-posts", JSON.stringify(list));
          } catch (e) {}
        }

        const allMetrics = JSON.parse(localStorage.getItem("aether-campaign-metrics") || "{}");
        Object.keys(allMetrics).forEach((campaignId) => {
          const m = allMetrics[campaignId];
          m.impressions += Math.round(Math.random() * 600 + 150);
          m.clicks += Math.round(Math.random() * 30 + 5);
          m.conversions += Math.round(Math.random() * 2 + 1);
          m.attributed_value = m.conversions * 85;
        });
        localStorage.setItem("aether-campaign-metrics", JSON.stringify(allMetrics));
      }

    } else {
      // Live database mode: find all posts where participation is active (in_progress or submitted)
      const { data: postsToUpdate, error: queryErr } = await supabase
        .from("posts")
        .select(`
          id,
          post_url,
          platform,
          participation_id,
          participation:participation_id ( status )
        `);

      if (queryErr) throw queryErr;

      // Filter post list where participation status is active
      const activePosts = (postsToUpdate || []).filter(p => {
        const status = (p.participation as any)?.status;
        return status === "in_progress" || status === "submitted" || status === "escrowed";
      });

      // Call the metrics API router directly for each active post sequentially
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      
      for (const post of activePosts) {
        try {
          const fetchRes = await fetch(`${appUrl}/api/metrics/fetch`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              post_url: post.post_url,
              platform: post.platform,
              participation_id: post.participation_id
            })
          });
          
          const result = await fetchRes.json();
          if (result.success) {
            refreshedCount++;
            postsDetails.push({ url: post.post_url, status: "success" });
          } else {
            postsDetails.push({ url: post.post_url, status: `failed: ${result.error}` });
          }

          // Small rate-limit delay between scraper crawls
          await new Promise(resolve => setTimeout(resolve, 250));
        } catch (postErr: any) {
          console.error(`Cron metrics fetch failed for url ${post.post_url}:`, postErr);
          postsDetails.push({ url: post.post_url, status: `exception: ${postErr.message}` });
        }
      }
    }

    return NextResponse.json({
      success: true,
      refreshed_count: refreshedCount,
      timestamp: new Date().toISOString(),
      details: postsDetails
    });

  } catch (err: any) {
    console.error("Cron metrics handler crashed:", err);
    return NextResponse.json(
      { success: false, error: `Cron execution failed: ${err.message}` },
      { status: 500 }
    );
  }
}
