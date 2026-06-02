import { z, type ZodSchema } from "zod";
import { jsonError, validationError } from "@/lib/api/response";

/** Default max JSON body size for API routes (256 KB) */
export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodSchema<T>,
  maxBytes = DEFAULT_MAX_BODY_BYTES
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      ok: false,
      response: jsonError(
        "Content-Type must be application/json.",
        415
      ),
    };
  }

  let rawText: string;
  try {
    rawText = await request.text();
  } catch {
    return {
      ok: false,
      response: jsonError("Could not read request body.", 400),
    };
  }

  if (rawText.length > maxBytes) {
    return {
      ok: false,
      response: jsonError(
        "Request body is too large. Please reduce the payload size.",
        413
      ),
    };
  }

  let raw: unknown;
  try {
    raw = rawText ? JSON.parse(rawText) : {};
  } catch {
    return {
      ok: false,
      response: jsonError("Request body must be valid JSON.", 400),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: validationError(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

export function parseQuery<T>(
  request: Request,
  schema: ZodSchema<T>
): { ok: true; data: T } | { ok: false; response: Response } {
  const { searchParams } = new URL(request.url);
  const raw: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    raw[key] = value;
  });

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: validationError(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

export function parseUuidParam(value: string): string | null {
  const result = z.string().uuid().safeParse(value);
  return result.success ? result.data : null;
}