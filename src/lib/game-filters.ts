import type { LucideIcon } from "lucide-react";
import { Flame, Sparkles, ArrowDownAZ, Star, TrendingUp, Trophy, RefreshCw, Monitor, Smartphone, Tablet, Users, User } from "lucide-react";
import { hashSeed, mulberry32 } from "./prng";
import type { Game, Tag } from "./types";

// ---------------------------------------------------------------------------
// Platform support
// ---------------------------------------------------------------------------
// The Game type only carries a single `mobileSupport` boolean (real/database
// games) — there's no separate desktop/tablet column. Rather than a schema
// migration, platform availability is derived here:
//   • "desktop" — every game in the catalog runs in a browser tab, so this is
//     always true.
//   • "mobile"  — `mobileSupport` when the game has it set (real games always
//     do, defaulting true — see mapDbGameRow); placeholder/demo games don't
//     carry the field at all, so they get a deterministic per-game coin flip
//     instead, seeded off the game's own id so it's stable across renders
//     and page loads rather than random noise.
//   • "tablet"  — only possible when "mobile" is true (tablets are touch
//     devices too), then its own independent seeded roll on top of that.
export type Platform = "desktop" | "mobile" | "tablet";

export const PLATFORM_OPTIONS: { value: Platform; label: string; icon: LucideIcon }[] = [
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "mobile", label: "Mobile", icon: Smartphone },
  { value: "tablet", label: "Tablet", icon: Tablet },
];

function seededChance(seed: string, probability: number): boolean {
  return mulberry32(hashSeed(seed))() < probability;
}

export function getGamePlatforms(game: Game): Platform[] {
  const platforms: Platform[] = ["desktop"];
  const touchCapable = game.mobileSupport ?? seededChance(`${game.id}:touch`, 0.78);
  if (touchCapable) {
    platforms.push("mobile");
    if (seededChance(`${game.id}:tablet`, 0.82)) platforms.push("tablet");
  }
  return platforms;
}

// ---------------------------------------------------------------------------
// Game mode
// ---------------------------------------------------------------------------
export type GameMode = "single" | "multiplayer";

export const GAME_MODE_OPTIONS: { value: GameMode; label: string; icon: LucideIcon }[] = [
  { value: "single", label: "Single Player", icon: User },
  { value: "multiplayer", label: "Multiplayer", icon: Users },
];

export function getGameMode(game: Game): GameMode {
  return game.multiplayer ? "multiplayer" : "single";
}

// ---------------------------------------------------------------------------
// Tags — reuses the existing TOP/HOT/NEW/UPDATED badge already shown on
// every game tile, rather than introducing a second, unrelated tagging
// system. Icons match badgeIcons in CategoryPageCard/GenreGameCard so the
// filter UI and the tiles it filters read as the same visual language.
// ---------------------------------------------------------------------------
export type TagFilterValue = Exclude<Tag, null>;

export const TAG_FILTER_OPTIONS: { value: TagFilterValue; label: string; icon: LucideIcon }[] = [
  { value: "TOP", label: "Top Picks", icon: Trophy },
  { value: "HOT", label: "Hot", icon: Flame },
  { value: "NEW", label: "New", icon: Sparkles },
  { value: "UPDATED", label: "Updated", icon: RefreshCw },
];

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------
export type SortValue = "popular" | "newest" | "az" | "rated" | "played";

export const SORT_OPTIONS: { value: SortValue; label: string; shortLabel: string; icon: LucideIcon }[] = [
  { value: "popular", label: "Most Popular", shortLabel: "Popular", icon: TrendingUp },
  { value: "newest", label: "Newest", shortLabel: "Newest", icon: Sparkles },
  { value: "az", label: "A–Z", shortLabel: "A–Z", icon: ArrowDownAZ },
  { value: "rated", label: "Highest Rated", shortLabel: "Top Rated", icon: Star },
  { value: "played", label: "Most Played", shortLabel: "Most Played", icon: Flame },
];

function pseudoRecency(id: string): number {
  return mulberry32(hashSeed(`${id}:recency`))();
}

/** "Popularity" blends play count with rating and (for real games)
 * favorites/rating volume, so it reads as a genuinely different ranking
 * from a pure play-count sort rather than just relabeling "Most Played". */
function popularityScore(game: Game): number {
  const ratingBoost = 1 + (game.rating - 4) * 0.15;
  return game.plays * ratingBoost + (game.favoriteCount ?? 0) * 50 + (game.ratingCount ?? 0) * 10;
}

function newestScore(game: Game): number {
  if (game.createdAt) return 2_000_000_000_000 + new Date(game.createdAt).getTime();
  if (game.tag === "NEW") return 1_000_000_000_000 + pseudoRecency(game.id) * 1_000_000;
  return pseudoRecency(game.id) * 1_000_000;
}

export function sortGames(games: Game[], sort: SortValue): Game[] {
  const arr = [...games];
  switch (sort) {
    case "az":
      arr.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "rated":
      arr.sort((a, b) => b.rating - a.rating || b.plays - a.plays);
      break;
    case "played":
      arr.sort((a, b) => b.plays - a.plays);
      break;
    case "newest":
      arr.sort((a, b) => newestScore(b) - newestScore(a));
      break;
    case "popular":
    default:
      arr.sort((a, b) => popularityScore(b) - popularityScore(a));
      break;
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------
export interface GameFilters {
  q: string;
  categories: string[];
  tags: TagFilterValue[];
  platforms: Platform[];
  modes: GameMode[];
  sort: SortValue;
}

export const DEFAULT_FILTERS: GameFilters = {
  q: "",
  categories: [],
  tags: [],
  platforms: [],
  modes: [],
  sort: "popular",
};

export function filterGames(games: Game[], filters: GameFilters): Game[] {
  const q = filters.q.trim().toLowerCase();
  return games.filter((g) => {
    if (q && !matchesTitlePrefix(g.title, q)) return false;
    if (filters.categories.length > 0 && !filters.categories.includes(g.categorySlug)) return false;
    if (filters.tags.length > 0 && (!g.tag || !filters.tags.includes(g.tag))) return false;
    if (filters.platforms.length > 0) {
      const platforms = getGamePlatforms(g);
      if (!filters.platforms.some((p) => platforms.includes(p))) return false;
    }
    if (filters.modes.length > 0 && !filters.modes.includes(getGameMode(g))) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Title search — strict prefix match
// ---------------------------------------------------------------------------
// Deliberately "starts with", not "contains": typing "m" should surface
// titles beginning with M, typing "me" should narrow that down to titles
// beginning with "Me", and so on as more letters are added — a game that
// merely *contains* the query somewhere in the middle (e.g. "Online" for
// "ne") is excluded outright rather than shown lower down. Case-insensitive;
// callers should already have trimmed `query`.
export function matchesTitlePrefix(title: string, query: string): boolean {
  return title.toLowerCase().startsWith(query.toLowerCase());
}

/** Prefix-filter + sort by popularity — every match already satisfies the
 * same "starts with" condition, so play count is purely a tiebreaker among
 * otherwise-equal matches (e.g. "Merge Blocks" before "Metro Rush" if the
 * former is more played), not a relevance signal. */
export function searchGamesByTitle<T extends { title: string; plays: number }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return items.filter((item) => matchesTitlePrefix(item.title, q)).sort((a, b) => b.plays - a.plays);
}

// ---------------------------------------------------------------------------
// URL <-> filters (de)serialization — comma-separated lists, empty/default
// values simply omitted so a "reset" state produces a clean /games URL.
// ---------------------------------------------------------------------------
const VALID_PLATFORMS = new Set<Platform>(["desktop", "mobile", "tablet"]);
const VALID_MODES = new Set<GameMode>(["single", "multiplayer"]);
const VALID_TAGS = new Set<TagFilterValue>(["TOP", "HOT", "NEW", "UPDATED"]);
const VALID_SORTS = new Set<SortValue>(["popular", "newest", "az", "rated", "played"]);

function splitParam(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

export function filtersFromSearchParams(params: URLSearchParams): GameFilters {
  return {
    q: params.get("q") ?? "",
    categories: splitParam(params.get("category")),
    tags: splitParam(params.get("tags")).filter((t): t is TagFilterValue =>
      VALID_TAGS.has(t as TagFilterValue)
    ),
    platforms: splitParam(params.get("platform")).filter((p): p is Platform =>
      VALID_PLATFORMS.has(p as Platform)
    ),
    modes: splitParam(params.get("mode")).filter((m): m is GameMode => VALID_MODES.has(m as GameMode)),
    sort: (() => {
      const s = params.get("sort");
      return s && VALID_SORTS.has(s as SortValue) ? (s as SortValue) : "popular";
    })(),
  };
}

export function filtersToSearchParams(filters: GameFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.categories.length) params.set("category", filters.categories.join(","));
  if (filters.tags.length) params.set("tags", filters.tags.join(","));
  if (filters.platforms.length) params.set("platform", filters.platforms.join(","));
  if (filters.modes.length) params.set("mode", filters.modes.join(","));
  if (filters.sort !== "popular") params.set("sort", filters.sort);
  return params;
}

// ---------------------------------------------------------------------------
// LocalStorage persistence — remembers the last selected *filters* (not the
// search text, which resets each visit, and not sort — deliberately: sort
// is a per-browse preference tied to what's currently loaded, not something
// that should silently reapply next time and shadow the default browse
// order). Read/write are best-effort: a failure here should never break the
// page.
// ---------------------------------------------------------------------------
const STORAGE_KEY = "mofigames:gameFilters";

interface StoredFilters {
  categories: string[];
  tags: TagFilterValue[];
  platforms: Platform[];
  modes: GameMode[];
}

export function readStoredFilters(): Partial<GameFilters> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredFilters>;
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t) => VALID_TAGS.has(t)) : [],
      platforms: Array.isArray(parsed.platforms) ? parsed.platforms.filter((p) => VALID_PLATFORMS.has(p)) : [],
      modes: Array.isArray(parsed.modes) ? parsed.modes.filter((m) => VALID_MODES.has(m)) : [],
    };
  } catch {
    return null;
  }
}

export function writeStoredFilters(filters: GameFilters) {
  if (typeof window === "undefined") return;
  try {
    const toStore: StoredFilters = {
      categories: filters.categories,
      tags: filters.tags,
      platforms: filters.platforms,
      modes: filters.modes,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Storage unavailable (private mode, quota, etc.) — fail silently.
  }
}
