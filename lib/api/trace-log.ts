import { randomUUID } from "node:crypto";

type ApiLogLevel = "info" | "warn" | "alert";

/** Structured server-side log line with optional trace correlation. */
export function apiLog(
  level: ApiLogLevel,
  event: string,
  ctx: Record<string, unknown> & { traceId?: string }
): string {
  const traceId = ctx.traceId ?? randomUUID();
  const parts: string[] = [];
  for (const [k, v] of Object.entries({ ...ctx, traceId })) {
    if (v === undefined) continue;
    parts.push(`${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  const tag = level === "alert" ? "ALERT" : level.toUpperCase();
  const line = `${new Date().toISOString()} [api][${tag}] ${event} ${parts.join(" ")}`;
  if (level === "alert") console.warn(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  return traceId;
}
