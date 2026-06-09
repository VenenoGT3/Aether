/**
 * Creator social OAuth — runs on Supabase Edge Functions.
 *
 * Start:
 *   POST /functions/v1/social-oauth/start
 *   Authorization: Bearer <creator session JWT>
 *   body: { "provider": "youtube_official" }
 *
 * Callback:
 *   GET /functions/v1/social-oauth/callback?code=...&state=...
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { encryptToken } from "../_shared/token-crypto.ts";

type Provider = "youtube_official";
type Platform = "youtube";

type OAuthState = {
  state: string;
  user_id: string;
  platform: Platform;
  provider: Provider;
  redirect_origin: string;
  return_path: string | null;
  verifier_hash: string | null;
  consumed_at: string | null;
  expires_at: string;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const youtubeClientId = Deno.env.get("YOUTUBE_OAUTH_CLIENT_ID");
const youtubeClientSecret = Deno.env.get("YOUTUBE_OAUTH_CLIENT_SECRET");
const configuredFunctionUrl = Deno.env.get("SOCIAL_OAUTH_FUNCTION_URL");
const configuredAllowedOrigins = Deno.env.get("SOCIAL_OAUTH_ALLOWED_ORIGINS");
const tokenEncryptionKey = Deno.env.get("SOCIAL_TOKEN_ENCRYPTION_KEY")?.trim();
// Anyone can deploy to *.vercel.app, so trusting the whole suffix is opt-in
// for QA environments only — never enable this on the production project.
const allowPreviewOrigins =
  (Deno.env.get("SOCIAL_OAUTH_ALLOW_PREVIEW_ORIGINS") ?? "").trim().toLowerCase() === "true";
const YOUTUBE_READONLY_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";

function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  (configuredAllowedOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .forEach((origin) => {
      try {
        origins.add(new URL(origin).origin);
      } catch {
        // Ignore malformed env entries.
      }
    });
  origins.add("http://localhost:3000");
  origins.add("http://127.0.0.1:3000");
  return origins;
}

function originAllowed(origin: string): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    const allowed = allowedOrigins();
    if (allowed.has(parsed.origin)) return true;
    if (!allowPreviewOrigins) return false;
    return parsed.protocol === "https:" && parsed.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  // Disallowed origins get no ACAO header at all: the literal "null" value
  // would match sandboxed-iframe origins.
  if (!originAllowed(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

const corsCommon = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(req: Request, data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(req), ...corsCommon, ...extraHeaders, "Content-Type": "application/json" },
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

function providerToPlatform(): Platform {
  return "youtube";
}

function parseProvider(value: unknown): Provider | null {
  return value === "youtube_official" ? value : null;
}

function safeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/creator/settings";
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > 256 ||
    !trimmed.startsWith("/creator/") ||
    trimmed.startsWith("//")
  ) {
    return "/creator/settings";
  }
  return trimmed;
}

function stateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function oauthCookieName(state: string): string {
  return `aether_oauth_${state}`;
}

function readCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
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
  if (!userId) return json(req, { error: "Authentication required." }, 401);

  const body = (await req.json().catch(() => ({}))) as { provider?: unknown; returnTo?: unknown };
  const provider = parseProvider(body.provider);
  if (!provider) return json(req, { error: "Unsupported provider." }, 400);
  const returnPath = safeReturnPath(body.returnTo);

  if (provider === "youtube_official" && (!youtubeClientId || !youtubeClientSecret)) {
    return json(req, { error: "YouTube OAuth is not configured." }, 503);
  }

  // Fail closed: never start a flow whose tokens we could only store as
  // plaintext. Set SOCIAL_TOKEN_ENCRYPTION_KEY (32 bytes, base64) to enable.
  if (!tokenEncryptionKey) {
    console.error("social oauth: SOCIAL_TOKEN_ENCRYPTION_KEY is not configured.");
    return json(req, { error: "Account linking is not configured." }, 503);
  }

  const origin = req.headers.get("origin") ?? "";
  if (!originAllowed(origin)) {
    return json(req, { error: "This origin is not allowed to start account linking." }, 403);
  }

  const platform = providerToPlatform();
  const state = stateToken();
  const verifier = stateToken();
  const verifierHash = await sha256Base64Url(verifier);
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
    redirect_origin: new URL(origin).origin,
    return_path: returnPath,
    verifier_hash: verifierHash,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) return json(req, { error: "Could not start account linking." }, 500);

  const params = new URLSearchParams({
    client_id: youtubeClientId!,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: YOUTUBE_READONLY_SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return json(req, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }, 200, {
    "Set-Cookie": `${oauthCookieName(state)}=${encodeURIComponent(verifier)}; Path=/functions/v1/social-oauth; Max-Age=600; HttpOnly; Secure; SameSite=None`,
  });
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
  const scopes = token.scope
    ? String(token.scope).split(/\s+/).filter(Boolean)
    : [YOUTUBE_READONLY_SCOPE];
  if (!scopes.includes(YOUTUBE_READONLY_SCOPE)) {
    throw new Error("YouTube readonly scope was not granted.");
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
    scopes,
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
  if (!state || !code) return json(req, { error: "Missing OAuth state or code." }, 400);

  const supabase = serviceClient();
  const { data: stateRow, error: stateErr } = await supabase
    .from("creator_social_oauth_states")
    .select("state, user_id, platform, provider, redirect_origin, return_path, verifier_hash, consumed_at, expires_at")
    .eq("state", state)
    .maybeSingle();

  if (stateErr || !stateRow) return json(req, { error: "Invalid OAuth state." }, 400);
  const oauthState = stateRow as OAuthState;
  const redirectOrigin = oauthState.redirect_origin;
  const redirectPath = safeReturnPath(oauthState.return_path);
  const redirectTo = (params: string) => `${redirectOrigin}${redirectPath}${params}`;
  if (!originAllowed(redirectOrigin)) {
    await supabase.from("creator_social_oauth_states").delete().eq("state", state);
    return json(req, { error: "Invalid OAuth redirect origin." }, 400);
  }
  if (oauthState.provider !== "youtube_official") {
    await supabase.from("creator_social_oauth_states").delete().eq("state", state);
    return Response.redirect(redirectTo("?social_link_error=unsupported"), 303);
  }
  if (oauthState.consumed_at) {
    await supabase.from("creator_social_oauth_states").delete().eq("state", state);
    return Response.redirect(redirectTo("?social_link_error=consumed"), 303);
  }
  if (new Date(oauthState.expires_at).getTime() < Date.now()) {
    await supabase.from("creator_social_oauth_states").delete().eq("state", state);
    return Response.redirect(redirectTo("?social_link_error=expired"), 303);
  }

  const verifier = readCookie(req, oauthCookieName(state));
  const verifierHash = verifier ? await sha256Base64Url(verifier) : null;
  if (!oauthState.verifier_hash || verifierHash !== oauthState.verifier_hash) {
    await supabase.from("creator_social_oauth_states").delete().eq("state", state);
    return Response.redirect(redirectTo("?social_link_error=state"), 303);
  }

  const { data: consumedState } = await supabase
    .from("creator_social_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("state", state)
    .is("consumed_at", null)
    .select("state")
    .maybeSingle();
  if (!consumedState) {
    await supabase.from("creator_social_oauth_states").delete().eq("state", state);
    return Response.redirect(redirectTo("?social_link_error=consumed"), 303);
  }

  const redirectUri = `${functionBaseUrl(req)}/callback`;
  try {
    if (!tokenEncryptionKey) {
      throw new Error("SOCIAL_TOKEN_ENCRYPTION_KEY is not configured.");
    }
    const linked = await exchangeYouTube(code, redirectUri);

    const { data: existingAccount } = await supabase
      .from("creator_social_accounts")
      .select("user_id")
      .eq("platform", oauthState.platform)
      .eq("provider", oauthState.provider)
      .eq("external_account_id", linked.externalAccountId)
      .maybeSingle();
    if (existingAccount?.user_id && existingAccount.user_id !== oauthState.user_id) {
      throw new Error("This YouTube channel is already linked to another Aether account.");
    }

    const { error } = await supabase.from("creator_social_accounts").upsert(
      {
        user_id: oauthState.user_id,
        platform: oauthState.platform,
        provider: oauthState.provider,
        external_account_id: linked.externalAccountId,
        handle: linked.handle,
        display_name: linked.displayName,
        profile_url: linked.profileUrl,
        access_token: await encryptToken(linked.accessToken, tokenEncryptionKey),
        refresh_token: linked.refreshToken
          ? await encryptToken(linked.refreshToken, tokenEncryptionKey)
          : null,
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
    return new Response(null, {
      status: 303,
      headers: {
        Location: redirectTo(`?social_linked=${oauthState.platform}`),
        "Set-Cookie": `${oauthCookieName(state)}=; Path=/functions/v1/social-oauth; Max-Age=0; HttpOnly; Secure; SameSite=None`,
      },
    });
  } catch (err) {
    console.error("social oauth callback:", err);
    await supabase.from("creator_social_oauth_states").delete().eq("state", state);
    return new Response(null, {
      status: 303,
      headers: {
        Location: redirectTo(`?social_link_error=${oauthState.platform}`),
        "Set-Cookie": `${oauthCookieName(state)}=; Path=/functions/v1/social-oauth; Max-Age=0; HttpOnly; Secure; SameSite=None`,
      },
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...cors(req), ...corsCommon } });
  }

  const pathname = new URL(req.url).pathname;
  try {
    if (pathname.endsWith("/start")) {
      if (req.method !== "POST") return json(req, { error: "Method not allowed." }, 405);
      return await start(req);
    }
    if (pathname.endsWith("/callback")) {
      if (req.method !== "GET") return json(req, { error: "Method not allowed." }, 405);
      return await callback(req);
    }
    return json(req, { error: "Not found." }, 404);
  } catch (err) {
    console.error("social oauth error:", err);
    return json(req, { error: "Social account linking failed." }, 500);
  }
});
