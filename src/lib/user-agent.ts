// Tiny, dependency-free User-Agent parser. Good enough for analytics
// breakdowns (device/browser/OS pie charts) — not meant to be as precise
// as a full library like ua-parser-js, just accurate on the browsers that
// make up the vast majority of real traffic.

export interface ParsedUserAgent {
  deviceType: "desktop" | "mobile" | "tablet";
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const s = ua ?? "";

  let deviceType: ParsedUserAgent["deviceType"] = "desktop";
  if (/ipad|tablet|(android(?!.*mobile))/i.test(s)) {
    deviceType = "tablet";
  } else if (/mobi|iphone|ipod|android/i.test(s)) {
    deviceType = "mobile";
  }

  let browser = "Other";
  if (/edg\//i.test(s)) browser = "Edge";
  else if (/opr\/|opera/i.test(s)) browser = "Opera";
  else if (/chrome|crios/i.test(s)) browser = "Chrome";
  else if (/firefox|fxios/i.test(s)) browser = "Firefox";
  else if (/safari/i.test(s)) browser = "Safari";

  let os = "Other";
  if (/windows/i.test(s)) os = "Windows";
  else if (/android/i.test(s)) os = "Android";
  else if (/iphone|ipad|ipod|ios/i.test(s)) os = "iOS";
  else if (/mac os x|macintosh/i.test(s)) os = "macOS";
  else if (/linux/i.test(s)) os = "Linux";

  return { deviceType, browser, os };
}

/** Buckets a referrer URL into a traffic-source category. Empty/same-site
 * referrer = "Direct" (the two are indistinguishable from a referrer
 * header alone — a same-site referrer usually just means internal
 * navigation, which reads as direct traffic in most analytics tools too). */
export function classifyTrafficSource(referrer: string, siteHost: string): string {
  if (!referrer) return "Direct";
  try {
    const url = new URL(referrer);
    const host = url.hostname.replace(/^www\./, "");
    if (host === siteHost.replace(/^www\./, "")) return "Direct";
    if (/google\.|bing\.|yahoo\.|duckduckgo\.|baidu\.|yandex\./i.test(host)) return "Organic Search";
    if (/facebook\.|instagram\.|twitter\.|x\.com|tiktok\.|reddit\.|linkedin\.|pinterest\./i.test(host)) return "Social Media";
    return "Referral";
  } catch {
    return "Direct";
  }
}
