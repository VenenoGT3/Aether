import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/env";
import { guardApiGet, guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { jsonError, jsonSuccess } from "@/lib/api/response";
import { endRequest } from "@/lib/logger";

const EmptyQuerySchema = z.object({});
const DisconnectBodySchema = z.object({
  accountId: z.string().uuid(),
  _hp: z.string().optional(),
});

type SocialAccountStatusRow = {
  id: string;
  platform: "youtube" | "tiktok" | "instagram";
  provider: "youtube_official" | "tiktok_official" | "ayrshare" | "phyllo";
  external_account_id: string;
  handle: string | null;
  display_name: string | null;
  profile_url: string | null;
  scopes: string[] | null;
  status: "active" | "expired" | "revoked" | "error";
  last_verified_at: string | null;
  token_expires_at: string | null;
  refresh_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export const DELETE = () => methodNotAllowed(["GET", "POST"]);

export async function GET(request: Request): Promise<Response> {
  const guarded = await guardApiGet(request, {
    schema: EmptyQuerySchema,
    rateLimit: "metrics",
    routeKey: "social-accounts/list",
    auth: "influencer",
  });
  if (!guarded.ok) return guarded.response;
  const { log, startTime } = guarded.ctx;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("creator_social_account_status")
    .select(
      "id, platform, provider, external_account_id, handle, display_name, profile_url, scopes, status, last_verified_at, token_expires_at, refresh_expires_at, created_at, updated_at"
    )
    .order("updated_at", { ascending: false });

  if (error) {
    endRequest(log, { statusCode: 500, startTime });
    return jsonError("Could not load linked social accounts.", 500);
  }

  endRequest(log, { statusCode: 200, startTime });
  return jsonSuccess({ accounts: (data ?? []) as SocialAccountStatusRow[] });
}

/**
 * Disconnect via the social-oauth edge function so the Google grant is revoked
 * upstream (only that runtime holds the token-decryption key). Returns null
 * when the function is unreachable/undeployed — the caller falls back to the
 * local RPC, which clears tokens but cannot revoke at the provider.
 */
async function disconnectViaEdgeFunction(
  accessToken: string,
  accountId: string
): Promise<Response | null> {
  let res: globalThis.Response;
  try {
    res = await fetch(`${getSupabaseUrl()}/functions/v1/social-oauth/disconnect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: getSupabaseAnonKey(),
      },
      body: JSON.stringify({ accountId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }

  if (res.ok) {
    return jsonSuccess({ disconnected: true });
  }
  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  if (res.status === 404 && payload?.error === "Linked account not found.") {
    return jsonError("Linked account not found.", 404);
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const guarded = await guardApiPost(request, {
    schema: DisconnectBodySchema,
    rateLimit: "submit",
    routeKey: "social-accounts/disconnect",
    auth: "influencer",
  });
  if (!guarded.ok) return guarded.response;
  const { log, startTime, data } = guarded.ctx;

  const supabase = await createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    const edgeResponse = await disconnectViaEdgeFunction(
      session.access_token,
      data.accountId
    );
    if (edgeResponse) {
      endRequest(log, { statusCode: edgeResponse.status, startTime });
      return edgeResponse;
    }
    log.warn(
      { event: "social.disconnect.edge_unavailable" },
      "social-oauth disconnect unreachable — falling back to local token clear (no upstream revoke)"
    );
  }

  const { data: ok, error } = await supabase.rpc(
    "disconnect_creator_social_account",
    { p_account_id: data.accountId }
  );

  if (error || ok !== true) {
    endRequest(log, { statusCode: error ? 500 : 404, startTime });
    return jsonError(
      error ? "Could not disconnect this account." : "Linked account not found.",
      error ? 500 : 404
    );
  }

  endRequest(log, { statusCode: 200, startTime });
  return jsonSuccess({ disconnected: true });
}
