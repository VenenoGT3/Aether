/**
 * Cookie / GDPR consent storage. Client-safe, dependency-free.
 *
 * Consent is stored in localStorage (source of truth for the UI) and mirrored to
 * a first-party cookie so the server/edge could read the coarse choice later if
 * analytics are added. Essential cookies are always on (required to run the app);
 * only the analytics category is user-controlled. A `CONSENT_CHANGE_EVENT` is
 * dispatched on every change so the banner + settings page stay in sync.
 */

export interface CookieConsent {
  essential: true;
  analytics: boolean;
  updatedAt: string;
}

export const CONSENT_STORAGE_KEY = "aether-cookie-consent";
export const CONSENT_COOKIE = "aether-cookie-consent";
export const CONSENT_CHANGE_EVENT = "aether-consent-change";

/** The recorded consent, or null if the user hasn't decided yet. */
export function getCookieConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    if (typeof parsed.analytics !== "boolean") return null;
    return { essential: true, analytics: parsed.analytics, updatedAt: parsed.updatedAt ?? "" };
  } catch {
    return null;
  }
}

/** Record a decision (essential is always granted) and notify listeners. */
export function setCookieConsent(analytics: boolean): CookieConsent {
  const value: CookieConsent = {
    essential: true,
    analytics,
    updatedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
      // Mirror a coarse choice to a 1-year first-party cookie.
      document.cookie = `${CONSENT_COOKIE}=${analytics ? "all" : "essential"}; path=/; max-age=31536000; SameSite=Lax`;
      window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: value }));
    } catch {
      /* storage unavailable — ignore */
    }
  }
  return value;
}

/** Withdraw consent (GDPR right) — clears the record so the banner returns. */
export function clearCookieConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    document.cookie = `${CONSENT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: null }));
  } catch {
    /* ignore */
  }
}
