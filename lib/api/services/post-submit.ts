import { createClient } from "@/lib/supabase/server";
import { assertParticipationAccess } from "@/lib/api/participation-access";
import type { PostSubmitBody } from "@/lib/api/schemas";
import { reportError } from "@/lib/errors";

/** Allowed DB + app participation statuses for deliverable upload */
const SUBMITTABLE_STATUSES = [
  "accepted",
  "offered",
  "applied",
  "in_progress",
  "escrowed",
  "submitted",
];

function detectPlatform(
  postUrl: string,
  explicit?: "instagram" | "tiktok" | "youtube"
): "instagram" | "tiktok" | "youtube" {
  if (explicit) return explicit;
  const lower = postUrl.toLowerCase();
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("youtube.com") || lower.includes("youtu.be"))
    return "youtube";
  return "instagram";
}

export type PostSubmitResult =
  | { ok: true; post: { id: string; participation_id: string } }
  | { ok: false; error: string; status: number };

export async function submitParticipationPost(
  participationId: string,
  userId: string,
  body: PostSubmitBody
): Promise<PostSubmitResult> {
  const access = await assertParticipationAccess(
    userId,
    participationId,
    "submit_post"
  );
  if (!access.ok) {
    return {
      ok: false,
      error: "You cannot submit a post for this participation.",
      status: 403,
    };
  }

  if (!SUBMITTABLE_STATUSES.includes(access.participation.status)) {
    return {
      ok: false,
      error:
        "Posts can only be submitted after escrow is funded and before approval.",
      status: 409,
    };
  }

  const platform = detectPlatform(body.post_url, body.platform);
  const m = body.metrics ?? {};
  const views = m.views ?? 0;
  const likes = m.likes ?? 0;
  const comments = m.comments ?? 0;
  const shares = m.shares ?? 0;
  const saves = m.saves ?? 0;
  const engagement_rate =
    m.engagement_rate ??
    (views > 0
      ? Number(
          (((likes + comments + shares + saves) / views) * 100).toFixed(2)
        )
      : 0);

  const supabase = await createClient();

  const { data: post, error: postErr } = await supabase
    .from("posts")
    .insert({
      participation_id: participationId,
      platform,
      post_url: body.post_url,
      views,
      likes,
      comments,
      shares,
      saves,
      engagement_rate,
      fetched_at: new Date().toISOString(),
      metrics: {
        views,
        likes,
        comments,
        shares,
        saves,
        engagement_rate,
        caption: body.caption,
      },
    })
    .select("id, participation_id")
    .single();

  if (postErr) {
    reportError(postErr, { service: "submitPost" });
    return {
      ok: false,
      error: "Could not save your post. Please try again.",
      status: 500,
    };
  }

  return { ok: true, post };
}