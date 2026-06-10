/**
 * EU paid-partnership disclosure check (UCPD 2005/29/EC; in Italy AGCM / IAP
 * Digital Chart). Sponsored content must carry a clear textual disclosure —
 * this checks the submitted video's title/description for one.
 *
 * Enforcement is env-tunable:
 *   DISCLOSURE_ENFORCEMENT=block  (default) reject submissions without one
 *   DISCLOSURE_ENFORCEMENT=warn   accept but log clip.submit.no_disclosure
 *   DISCLOSURE_ENFORCEMENT=off    skip the check entirely
 */

const DISCLOSURE_PATTERNS: RegExp[] = [
  /#ad\b/i,
  /#adv\b/i, // common in Italy
  /#sponsored\b/i,
  /#sponsorizzato\b/i,
  // No \b after accented letters - JS word boundaries are ASCII-only, so
  // "à"/"é" never sit on a boundary. Prefix match is safe here.
  /#pubblicit[aà]/i,
  /#publicit[eé]/i,
  /#werbung\b/i,
  /#anzeige\b/i,
  /#publicidad\b/i,
  /paid partnership/i,
  /collaborazione a pagamento/i,
  /contenuto sponsorizzato/i,
];

export type DisclosureEnforcement = "off" | "warn" | "block";

export function getDisclosureEnforcement(): DisclosureEnforcement {
  const raw = process.env.DISCLOSURE_ENFORCEMENT?.trim().toLowerCase();
  if (raw === "off" || raw === "warn") return raw;
  return "block";
}

/** True when any provided text carries a recognized disclosure marker. */
export function hasAdDisclosure(
  ...texts: Array<string | null | undefined>
): boolean {
  return texts.some(
    (text) =>
      typeof text === "string" &&
      text.length > 0 &&
      DISCLOSURE_PATTERNS.some((pattern) => pattern.test(text))
  );
}
