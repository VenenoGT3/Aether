import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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
