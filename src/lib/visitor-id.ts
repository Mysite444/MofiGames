// Shared client-side visitor id — a random id kept in a long-lived cookie,
// the unit both page-view analytics (AnalyticsTracker) and ad tracking
// (ad-tracking.ts) dedupe on, since most traffic is signed out and has no
// user_id at all.

export const VISITOR_COOKIE = "mg_visitor_id";
export const VISITOR_MAX_AGE_DAYS = 365;

export function getOrCreateVisitorId(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${VISITOR_COOKIE}=([^;]+)`));
  if (match) return decodeURIComponent(match[1]);

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const maxAge = VISITOR_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${VISITOR_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${maxAge}; samesite=lax`;
  return id;
}
