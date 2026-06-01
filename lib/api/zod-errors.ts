import type { ZodError, ZodIssue } from "zod";

const FIELD_LABELS: Record<string, string> = {
  post_url: "Post URL",
  participation_id: "Participation",
  campaign_id: "Campaign",
  proposed_payout: "Proposed payout",
  pitch: "Pitch",
  platform: "Platform",
  q: "Search query",
  niche: "Niche",
};

function labelFor(path: PropertyKey[]): string {
  const key = String(path[path.length - 1] ?? "field");
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

function messageForIssue(issue: ZodIssue): string {
  const field = labelFor([...issue.path]);
  const base = issue.message;

  if (base && !base.startsWith("Invalid")) {
    return `${field}: ${base}`;
  }

  return `${field} is invalid. Please check your input.`;
}

/** User-facing validation messages keyed by dot-path (e.g. `campaign.title`). */
export function formatZodErrors(error: ZodError): {
  message: string;
  fields: Record<string, string>;
} {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    if (!fields[path]) {
      fields[path] = messageForIssue(issue);
    }
  }

  const first = Object.values(fields)[0];
  return {
    message: first ?? "Please check your input and try again.",
    fields,
  };
}