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
      response: jsonError("Invalid JSON body", 400),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: validationError(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

export function parseUuidParam(value: string, label: string): string | null {
  const result = z.string().uuid().safeParse(value);
  return result.success ? result.data : null;
}