import { z, type ZodSchema } from "zod";
import { jsonError, validationError } from "@/lib/api/response";

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
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