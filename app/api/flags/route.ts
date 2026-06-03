import { NextResponse } from "next/server";
import { methodNotAllowed } from "@/lib/api/response";
import { getFeatureFlags } from "@/lib/feature-flags.server";

/**
 * Public, unauthenticated feature-flag snapshot for the client. Cached briefly
 * at the edge; the server resolver also caches per-process. No secrets — only
 * the boolean flag state that the UI uses to show/hide rollout-gated features.
 */
export const dynamic = "force-dynamic";
export const POST = () => methodNotAllowed(["GET"]);

export async function GET(): Promise<Response> {
  const flags = await getFeatureFlags();
  return NextResponse.json(
    { flags },
    { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" } }
  );
}
