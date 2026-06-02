import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl, isMockMode } from "@/lib/env";
import { verifyCronAuth } from "@/lib/campaign-lifecycle";
import { getCronSecret, getOptionalCronSecret } from "@/lib/env.server";
import { guardRateLimitOnly } from "@/lib/api/guard";

const supabase = createClient(getSupabaseUrl(), getSupabaseAnonKey());

export async function GET(request: Request) {
  const rateLimited = guardRateLimitOnly(request, "cron/metrics", "cron");
  if (rateLimited) return rateLimited;

  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = isMockMode ? getOptionalCronSecret() : getCronSecret();
    const auth = verifyCronAuth(authHeader, cronSecret, isMockMode);

    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: auth.error ?? "Unauthorized" },
        { status: 401 }
      );
    }

    let refreshedCount = 0;
    const postsDetails: Array<{ url: string; status: string }> = [];

    if (isMockMode) {
      refreshedCount = 3;
      postsDetails.push(
        { url: "https://instagram.com/p/C7X892-boost", status: "refreshed_mock" },
        { url: "https://tiktok.com/@sofiac/video/7392813", status: "refreshed_mock" },
        {
          url: "https://youtube.com/watch?v=marcusworkspacereview",
          status: "refreshed_mock",
        }
      );
    } else {
      const { data: postsToUpdate, error: queryErr } = await supabase
        .from("posts")
        .select(
          `
          id,
          post_url,
          platform,
          participation_id,
          participation:participation_id ( status )
        `
        );

      if (queryErr) throw queryErr;

      const activePosts = (postsToUpdate || []).filter((p) => {
        const status = (p.participation as { status?: string } | null)?.status;
        return (
          status === "in_progress" ||
          status === "submitted" ||
          status === "escrowed"
        );
      });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      for (const post of activePosts) {
        try {
          const fetchRes = await fetch(`${appUrl}/api/metrics/fetch`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(cronSecret
                ? { Authorization: `Bearer ${cronSecret}` }
                : {}),
            },
            body: JSON.stringify({
              post_url: post.post_url,
              platform: post.platform,
              participation_id: post.participation_id,
            }),
          });

          const result = await fetchRes.json();
          if (result.success) {
            refreshedCount++;
            postsDetails.push({ url: post.post_url, status: "success" });
          } else {
            postsDetails.push({
              url: post.post_url,
              status: `failed: ${result.error}`,
            });
          }

          await new Promise((resolve) => setTimeout(resolve, 250));
        } catch (postErr: unknown) {
          const msg =
            postErr instanceof Error ? postErr.message : "Unknown error";
          console.error(`Cron metrics fetch failed for ${post.post_url}:`, postErr);
          postsDetails.push({ url: post.post_url, status: `exception: ${msg}` });
        }
      }
    }

    return NextResponse.json({
      success: true,
      refreshed_count: refreshedCount,
      timestamp: new Date().toISOString(),
      details: postsDetails,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Cron metrics handler crashed:", err);
    return NextResponse.json(
      { success: false, error: `Cron execution failed: ${message}` },
      { status: 500 }
    );
  }
}