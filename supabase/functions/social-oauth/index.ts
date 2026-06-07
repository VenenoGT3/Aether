/**
 * Creator social OAuth — runs on Supabase Edge Functions.
 *
 * Start:
 *   POST /functions/v1/social-oauth/start
 *   Authorization: Bearer <creator session JWT>
 *   body: { "provider": "tiktok_official" | "youtube_official" }
 *
 * Callback:
 *   GET /functions/v1/social-oauth/callback?code=...&state=...
 */
import { createClient } from "npm:@supabase/supabase-js@2";

type Provider = "tiktok_official" | "youtube_official";
type Platform = "tiktok" | "youtube";

type OAuthState = {
  state: string;
  user_id: string;
  platform: Platform;
  provider: Provider;
  redirect_origin: string;
  expires_at: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const tiktokClientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
const tiktokClientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
const youtubeClientId = Deno.env.get("YOUTUBE_OAUTH_CLIENT_ID");
const youtubeClientSecret = Deno.env.get("YOUTUBE_OAUTH_CLIENT_SECRET");
const configuredFunctionUrl = Deno.env.get("SOCIAL_OAUTH_FUNCTION_URL");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function providerToPlatform(provider: Provider): Platform {
  return provider === "youtube_official" ? "youtube" : "tiktok";
}

function parseProvider(value: unknown): Provider | null {
  return value === "tiktok_official" || value === "youtube_official"
    ? value
    : null;
}

function stateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function functionBaseUrl(req: Request): string {
  if (configuredFunctionUrl?.trim()) return configuredFunctionUrl.replace(/\/$/, "");
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/(start|callback)\/?$/, "");
  return `${url.origin}${pathname}`;
}

async function authenticatedUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (!token) return null;
  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function start(req: Request): Promise<Response> {
  const userId = await authenticatedUserId(req);
  if (!userId) return json({ error: "Authentication required." }, 401);

  const body = (await req.json().catch(() => ({}))) as { provider?: unknown };
  const provider = parseProvider(body.provider);
  if (!provider) return json({ error: "Unsupported provider." }, 400);

  if (provider === "tiktok_official" && (!tiktokClientKey || !tiktokClientSecret)) {
    return json({ error: "TikTok OAuth is not configured." }, 503);
  }
  if (provider === "youtube_official" && (!youtubeClientId || !youtubeClientSecret)) {
    return json({ error: "YouTube OAuth is not configured." }, 503);
  }

  const origin = req.headers.get("origin") ?? "";
  if (!origin) return json({ error: "Missing request origin." }, 400);

  const platform = providerToPlatform(provider);
  const state = stateToken();
  const redirectUri = `${functionBaseUrl(req)}/callback`;
  const supabase = serviceClient();

  await supabase
    .from("creator_social_oauth_states")
    .delete()
    .lt("expires_at", new Date().toISOString());

  const { error } = await supabase.from("creator_social_oauth_states").insert({
    state,
    user_id: userId,
    platform,
    provider,
    redirect_origin: origin,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return json({ error: "Could not start account linking." }, 500);

  if (provider === "tiktok_official") {
    const params = new URLSearchParams({
      client_key: tiktokClientKey!,
      response_type: "code",
      scope: "user.info.basic,video.list",
      redirect_uri: redirectUri,
      state,
    });
    return json({ url: `https://www.tiktok.com/v2/auth/authorize/?${params}` });
  }

  const params = new URLSearchParams({
    client_id: youtubeClientId!,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/youtube.readonly",
    redirect_uri: redirectUri,
    state,
  });
  return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
}

async function exchangeTikTok(code: string, redirectUri: string) {
  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: tiktokClientKey!,
      client_secret: tiktokClientSecret!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(token.error_description ?? "TikTok token exchange failed.");
  }

  const infoRes = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,profile_deep_link",
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );
  const info = await infoRes.json();
  const user = info.data?.user;
  if (!infoRes.ok || !user?.open_id) {
    throw new Error(info.error?.message ?? "TikTok account lookup failed.");
  }

  return {
    externalAccountId: String(user.open_id),
    handle: null,
    displayName: user.display_name ? String(user.display_name) : null,
    profileUrl: user.profile_deep_link ? String(user.profile_deep_link) : null,
    accessToken: String(token.access_token),
    refreshToken: token.refresh_token ? String(token.refresh_token) : null,
    scopes: token.scope ? String(token.scope).split(",").map((s) => s.trim()) : ["video.list"],
    tokenExpiresAt: token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null,
    refreshExpiresAt: token.refresh_expires_in
      ? new Date(Date.now() + Number(token.refresh_expires_in) * 1000).toISOString()
      : null,
    metadata: { union_id: user.union_id ?? null, avatar_url: user.avatar_url ?? null },
  };
}

async function exchangeYouTube(code: string, redirectUri: string) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: youtubeClientId!,
      client_secret: youtubeClientSecret!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok || !token.access_token) {
    throw new Error(token.error_description ?? "YouTube token exchange failed.");
  }

  const channelRes = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );
  const channelJson = await channelRes.json();
  const channel = channelJson.items?.[0];
  if (!channelRes.ok || !channel?.id) {
    throw new Error(channelJson.error?.message ?? "YouTube channel lookup failed.");
  }

  return {
    externalAccountId: String(channel.id),
    handle: channel.snippet?.customUrl ? String(channel.snippet.customUrl) : null,
    displayName: channel.snippet?.title ? String(channel.snippet.title) : null,
    profileUrl: `https://www.youtube.com/channel/${channel.id}`,
    accessToken: String(token.access_token),
    refreshToken: token.refresh_token ? String(token.refresh_token) : null,
    scopes: token.scope ? String(token.scope).split(/\s+/).filter(Boolean) : ["youtube.readonly"],
    tokenExpiresAt: token.expires_in
      ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString()
      : null,
    refreshExpiresAt: null,
    metadata: { channel_snippet: channel.snippet ?? null },
  };
}

async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!state || !code) return json({ error: "Missing OAuth state or code." }, 400);

  const supabase = serviceClient();
  const { data: stateRow, error: stateErr } = await supabase
    .from("creator_social_oauth_states")
    .select("state, user_id, platform, provider, redirect_origin, expires_at")
    .eq("state", state)
    .maybeSingle();

  if (stateErr || !stateRow) return json({ error: "Invalid OAuth state." }, 400);
  const oauthState = stateRow as OAuthState;
  const redirectOrigin = oauthState.redirect_origin;
  if (new Date(oauthState.expires_at).getTime() < Date.now()) {
    await supabase.from("creator_social_oauth_states").delete().eq("state", state);
    return Response.redirect(`${redirectOrigin}/creator/clips?social_link_error=expired`, 303);
  }

  const redirectUri = `${functionBaseUrl(req)}/callback`;
  try {
    const linked =
      oauthState.provider === "tiktok_official"
        ? await exchangeTikTok(code, redirectUri)
        : await exchangeYouTube(code, redirectUri);

    const { error } = await supabase.from("creator_social_accounts").upsert(
      {
        user_id: oauthState.user_id,
        platform: oauthState.platform,
        provider: oauthState.provider,
        external_account_id: linked.externalAccountId,
        handle: linked.handle,
        display_name: linked.displayName,
        profile_url: linked.profileUrl,
        access_token: linked.accessToken,
        refresh_token: linked.refreshToken,
        scopes: linked.scopes,
        token_expires_at: linked.tokenExpiresAt,
        refresh_expires_at: linked.refreshExpiresAt,
        status: "active",
        last_verified_at: new Date().toISOString(),
        token_metadata: linked.metadata,
      },
      { onConflict: "platform,provider,external_account_id" }
    );
    if (error) throw new Error(error.message);

    await supabase.from("creator_social_oauth_states").delete().eq("state", state);
    return Response.redirect(
      `${redirectOrigin}/creator/clips?social_linked=${oauthState.platform}`,
      303
    );
  } catch (err) {
    console.error("social oauth callback:", err);
    await supabase.from("creator_social_oauth_states").delete().eq("state", state);
    return Response.redirect(
      `${redirectOrigin}/creator/clips?social_link_error=${oauthState.platform}`,
      303
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const pathname = new URL(req.url).pathname;
  try {
    if (pathname.endsWith("/start")) {
      if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
      return await start(req);
    }
    if (pathname.endsWith("/callback")) {
      if (req.method !== "GET") return json({ error: "Method not allowed." }, 405);
      return await callback(req);
    }
    return json({ error: "Not found." }, 404);
  } catch (err) {
    console.error("social oauth error:", err);
    return json({ error: "Social account linking failed." }, 500);
  }
});
