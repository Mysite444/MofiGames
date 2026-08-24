// Server-side heuristics for Admin → Monetization → Ad Protection. Kept
// dependency-free and readable on purpose — same spirit as user-agent.ts —
// since these thresholds are exactly the kind of thing that needs tuning
// over time as real traffic patterns show up in the dashboard.
//
// Scope note (see migration 0024 for the fuller version): this scores our
// *own* traffic-quality signals so the site can decide when to stop
// rendering an ad slot. It has no access to, and makes no attempt to
// touch, click accounting inside a third-party ad network's own iframe.

/** Well-known non-browser User-Agent substrings — crawlers, headless
 * automation, and common HTTP client libraries used by scripts. Not
 * exhaustive; a well-disguised bot spoofs a normal browser UA and won't be
 * caught here, which is exactly why this is one signal among several
 * rather than the only one. */
const BOT_UA_PATTERNS: RegExp[] = [
  /bot|crawler|spider|scraper/i,
  /headlesschrome|phantomjs|puppeteer|playwright|selenium/i,
  /curl|wget|python-requests|python-urllib|go-http-client|okhttp|axios\/|node-fetch/i,
  /\bhttpclient\b/i,
];

export interface BotSignal {
  isBot: boolean;
  reasons: string[];
}

/** Flags requests whose own headers look automated: a missing/empty
 * User-Agent (real browsers always send one), a known bot/script pattern,
 * or an Accept-Language header absent from what's effectively always a
 * browser-fired request. */
export function detectBotSignal(userAgent: string | null, acceptLanguage: string | null): BotSignal {
  const reasons: string[] = [];
  const ua = (userAgent ?? "").trim();

  if (!ua) {
    reasons.push("Missing User-Agent header");
  } else if (BOT_UA_PATTERNS.some((p) => p.test(ua))) {
    reasons.push("User-Agent matches a known bot/automation pattern");
  }

  if (!acceptLanguage) {
    reasons.push("Missing Accept-Language header");
  }

  return { isBot: reasons.length > 0, reasons };
}

export interface RiskInputs {
  isBot: boolean;
  isVpn: boolean;
  isDatacenter: boolean;
  overClickFrequency: boolean;
  overImpressionFrequency: boolean;
  ruleMatch: "whitelist" | "blacklist" | null;
}

/** Combines every signal into a single 0-100 score. Weights are additive
 * and capped, not a learned model — deliberately simple so an admin
 * reading the dashboard can reconstruct why a score is what it is. A
 * blacklist match always maxes it out; a whitelist match always zeroes it,
 * regardless of every other signal. */
export function computeRiskScore(inputs: RiskInputs): number {
  if (inputs.ruleMatch === "whitelist") return 0;
  if (inputs.ruleMatch === "blacklist") return 100;

  let score = 0;
  if (inputs.isBot) score += 40;
  if (inputs.isDatacenter) score += 25;
  if (inputs.isVpn) score += 15;
  if (inputs.overClickFrequency) score += 35;
  if (inputs.overImpressionFrequency) score += 20;

  return Math.min(100, score);
}

/** IPv4/IPv6 extraction matching the same trust model already used in
 * src/middleware.ts (applyAccessControl): first hop of X-Forwarded-For,
 * falling back to X-Real-IP. Whatever originates this header is trusted
 * the same amount everywhere in this app — consistent, not perfect. */
export function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}
