import { jsonError } from "@/lib/api/response";

export function rejectIfHoneypot(
  data: { _hp?: string | undefined }
): Response | null {
  if (data._hp && data._hp.length > 0) {
    return jsonError("Invalid submission.", 400);
  }
  return null;
}