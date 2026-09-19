import type { Game } from "./types";

// Homepage/listing curated rows (Featured, Sponsored, Trending, New,
// Updated, Editor's Picks, Originals, Leaderboard) — all sourced entirely
// from real games added through the admin panel. A row with no matching
// real games yet simply renders empty (or doesn't render at all — see
// CategoryRow/MobileGameRow) rather than padding itself out with filler.
//
// Both the desktop homepage (src/app/page.tsx) and MobileHome.tsx call
// these with the same `realGames` array, so the two surfaces can't drift
// out of sync with each other the way two independent implementations
// eventually would.

function byManualOrder(a: Game, b: Game, order: (g: Game) => number | null | undefined): number {
  return (order(a) ?? 9999) - (order(b) ?? 9999);
}

/** Featured Collection, admin panel → Homepage. An admin's hand-picked
 * games (in the order they set) are the row. */
export function getFeaturedGamesMerged(realGames: Game[]): Game[] {
  return realGames
    .filter((g) => g.isFeatured)
    .sort((a, b) => byManualOrder(a, b, (g) => g.featuredOrder));
}

/** Sponsored Games, admin panel → Homepage — the row doesn't render (see
 * CategoryRow/MobileGameRow) until at least one real game is marked
 * Sponsored. */
export function getSponsoredGamesMerged(realGames: Game[], limit = 10): Game[] {
  return realGames
    .filter((g) => g.isSponsored)
    .sort((a, b) => byManualOrder(a, b, (g) => g.sponsoredOrder))
    .slice(0, limit);
}

/** Same rule as /popular-games and /leaderboard for the plays-based
 * ranking, but an admin's manual "Trending" pick (games.is_trending) is
 * honored first — those lead the row in the order they rank by plays,
 * then the rest of the plays-based ranking fills in behind them. */
export function getTrendingGamesMerged(realGames: Game[], limit = 14): Game[] {
  const manuallyTrending = realGames.filter((g) => g.isTrending).sort((a, b) => b.plays - a.plays);
  const rest = realGames.filter((g) => !g.isTrending).sort((a, b) => b.plays - a.plays);
  return [...manuallyTrending, ...rest].slice(0, limit);
}

/** Same rule as /latest-games: newest real games first. */
export function getNewGamesMerged(realGames: Game[], limit = 14): Game[] {
  return [...realGames]
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, limit);
}

/** Same rule as /updated-games: UPDATED-tagged real games (an admin
 * marks a real game UPDATED via the Games admin panel), most recent first. */
export function getUpdatedGamesMerged(realGames: Game[], limit = 14): Game[] {
  return realGames
    .filter((g) => g.tag === "UPDATED")
    .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
    .slice(0, limit);
}

/** Editor's Picks, admin panel → Homepage. An admin's hand-picked games
 * (in the order they set) are the row; falls back to any HOT-tagged real
 * game if no explicit picks exist yet. */
export function getEditorsPicksMerged(realGames: Game[], limit = 10): Game[] {
  const picked = realGames
    .filter((g) => g.isEditorsPick)
    .sort((a, b) => byManualOrder(a, b, (g) => g.editorsPickOrder));
  if (picked.length > 0) return picked.slice(0, limit);

  return realGames.filter((g) => g.tag === "HOT").slice(0, limit);
}

/** "Mofigames Originals" — top-rated real games, one row's worth. */
export function getOriginalsMerged(realGames: Game[], limit = 10): Game[] {
  return [...realGames].sort((a, b) => b.rating - a.rating).slice(0, limit);
}

/** Full ranked leaderboard, sorted by plays — used by the dedicated
 * /leaderboard page and the homepage LeaderboardPanel widget. */
export function getLeaderboardMerged(realGames: Game[], limit = 50): Game[] {
  return [...realGames].sort((a, b) => b.plays - a.plays).slice(0, limit);
}
