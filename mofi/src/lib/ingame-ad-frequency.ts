const STORAGE_KEY = "mofigames:ingame-ad-play-count";

/** Call once per "Play" click. Returns true on every Nth call (N =
 * `frequency`, from Admin → Monetization → Advertisement Management →
 * In-Game Ads → "Show every N plays"), so the interstitial shows on the
 * Nth, 2Nth, 3Nth... play rather than every single time. Counter is
 * global across all games (matches "In-Game Ads" being one sitewide
 * setting, not per-game) and persists in localStorage across sessions.
 * Fails open (returns false, i.e. don't show an ad) if localStorage is
 * unavailable — never let a broken counter block someone from playing. */
export function shouldShowInGameAd(frequency: number): boolean {
  if (typeof window === "undefined" || frequency < 1) return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const count = (raw ? parseInt(raw, 10) : 0) + 1;
    window.localStorage.setItem(STORAGE_KEY, String(count));
    return count % frequency === 0;
  } catch {
    return false;
  }
}
