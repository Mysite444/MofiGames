import { categories } from "./categories";

// Shared, pure-data registry for the Homepage Categories Manager. No
// Supabase/server imports here on purpose — both the public homepage
// (src/app/page.tsx, server) and the admin "Categories" tab
// (src/components/admin/HomepageCategoriesManager.tsx, client) import this
// same list so the two can never define a row differently from each other.
//
// Every row here corresponds to exactly one seeded row in the
// `homepage_sections` table (migration 0030). The `default*` fields are
// what's used before an admin ever customizes anything (and as a safety
// net if a row is ever missing from the DB) — they intentionally reproduce
// today's hardcoded page.tsx order and labels exactly, so running the
// migration changes nothing visually until an admin actually edits something.

export type SectionType = "system" | "genre" | "category";

export interface SectionDefinition {
  /** Stable id, e.g. "system:featured", "genre:action". Real DB categories
   * use "category:<slug>" but aren't listed here — they come from the
   * categories table itself (see src/lib/games-server.ts). */
  key: string;
  type: SectionType;
  defaultLabel: string;
  defaultPosition: number;
  /** "See all" link target on the public homepage row, if any. */
  href?: string;
  /** Anchor wrapper id some rows render with (used by header nav links). */
  anchorId?: string;
  /** CategoryRow's tile-size variant. */
  variant?: "default" | "originals";
}

// --- System curated rows ---------------------------------------------------
// These already have working admin controls for *which games* appear
// (Homepage → Editor's Picks / Featured / Sponsored tabs, or automatic
// heuristics) — this registry only adds heading/order/visibility/manual-pins
// on top, it never changes which games show up automatically.
export const SYSTEM_SECTIONS: SectionDefinition[] = [
  { key: "system:featured", type: "system", defaultLabel: "Featured Games", defaultPosition: 10, href: "/leaderboard" },
  { key: "system:sponsored", type: "system", defaultLabel: "Sponsored", defaultPosition: 20 },
  { key: "system:new", type: "system", defaultLabel: "New Games", defaultPosition: 30, href: "/latest-games", anchorId: "new-releases" },
  { key: "system:originals", type: "system", defaultLabel: "MofiGames Originals", defaultPosition: 40, href: "/leaderboard", variant: "originals" },
  { key: "system:trending", type: "system", defaultLabel: "Can't Stop Playing", defaultPosition: 50, anchorId: "trending" },
  { key: "system:editors_pick", type: "system", defaultLabel: "Editor's Picks", defaultPosition: 80 },
  { key: "system:updated", type: "system", defaultLabel: "Recently Updated", defaultPosition: 250, anchorId: "updated-games" },
];

// A few genres get a nicer homepage heading than their plain category name
// (mirrors the hardcoded titles in the current page.tsx) — everything else
// defaults to the category's own name.
const GENRE_LABEL_OVERRIDES: Record<string, string> = {
  multiplayer: "Play with Friends",
  brain: "Brain Games",
  sports: "Sports Games",
  driving: "Driving Games",
};

// Default positions for the 18 genre rows, matching current page.tsx order
// exactly (multiplayer/brain/sports/driving are pulled to the top the way
// they are today; the rest keep categories.ts's own order).
const GENRE_POSITION_OVERRIDES: Record<string, number> = {
  multiplayer: 60,
  brain: 70,
  sports: 90,
  driving: 100,
};
// Genres without a pinned position above just keep categories.ts's own
// order, starting right after "Driving Games" (position 100).
const GENRE_AUTO_ORDER = categories.map((c) => c.slug).filter((slug) => !(slug in GENRE_POSITION_OVERRIDES));

function defaultGenrePosition(slug: string): number {
  const override = GENRE_POSITION_OVERRIDES[slug];
  if (override !== undefined) return override;
  const idx = GENRE_AUTO_ORDER.indexOf(slug);
  return 110 + idx * 10;
}

export const GENRE_SECTIONS: SectionDefinition[] = categories.map((cat) => ({
  key: `genre:${cat.slug}`,
  type: "genre" as const,
  defaultLabel: GENRE_LABEL_OVERRIDES[cat.slug] ?? cat.name,
  defaultPosition: defaultGenrePosition(cat.slug),
  href: `/${cat.slug}`,
}));

export const ALL_REGISTRY_SECTIONS: SectionDefinition[] = [...SYSTEM_SECTIONS, ...GENRE_SECTIONS];

export function categorySectionKey(slug: string): string {
  return `category:${slug}`;
}
