export type YouTubeVideoMetadata = {
  videoId: string;
  channelId: string;
  title: string;
  description: string;
  views: number;
  likes: number;
  comments: number;
};

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export async function fetchYouTubeVideoMetadata(
  videoId: string,
  apiKey: string,
  init?: RequestInit
): Promise<YouTubeVideoMetadata | null> {
  const params = new URLSearchParams({
    part: "snippet,statistics",
    id: videoId,
    key: apiKey,
    fields:
      "items(id,snippet(channelId,title,description),statistics(viewCount,likeCount,commentCount))",
  });

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
    { method: "GET", ...init }
  );
  if (!response.ok) return null;

  const json = (await response.json()) as {
    items?: Array<{
      id?: string;
      snippet?: { channelId?: string; title?: string; description?: string };
      statistics?: {
        viewCount?: string;
        likeCount?: string;
        commentCount?: string;
      };
    }>;
  };
  const item = json.items?.[0];
  const channelId = item?.snippet?.channelId;
  if (!item?.id || !channelId) return null;

  return {
    videoId: item.id,
    channelId,
    title: item.snippet?.title ?? "",
    description: item.snippet?.description ?? "",
    views: num(item.statistics?.viewCount),
    likes: num(item.statistics?.likeCount),
    comments: num(item.statistics?.commentCount),
  };
}
