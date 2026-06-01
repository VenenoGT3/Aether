/**
 * Thin client helpers for calling guarded API routes with consistent errors.
 */

export type ApiErrorPayload = {
  success: false;
  error: string;
  fields?: Record<string, string>;
  retryAfter?: number;
};

export async function parseApiResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = data as ApiErrorPayload;
    const fieldHint =
      err.fields && Object.keys(err.fields).length > 0
        ? ` (${Object.values(err.fields)[0]})`
        : "";
    throw new Error(
      err.error
        ? `${err.error}${fieldHint}`
        : `Request failed (${res.status})`
    );
  }

  return data as T;
}

export async function apiPost<T>(
  path: string,
  body: unknown
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return parseApiResponse<T>(res);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  return parseApiResponse<T>(res);
}