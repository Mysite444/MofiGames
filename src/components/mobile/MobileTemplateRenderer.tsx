"use client";

/**
 * MobileTemplateRenderer
 *
 * Client component that:
 *  1. Receives a MobileHomepageSection config row + the full realGames/realCategories arrays
 *  2. Resolves which games go in this section (applying game_sort + game_limit)
 *  3. Resolves the category info (accent, icon, href) from section_key
 *  4. Renders the correct template (1-5)
 *
 * Keeping this client-side means each section can independently react to
 * category DB overrides without a full server round-trip, following the
 * same useMergedCategoryBySlug pattern as the rest of the app.
 */

import { useMemo } from "react";
import { categories as staticCategories } from "@/lib/categories";
import {
  getFeaturedGamesMerged,
  getTrendingGamesMerged,
  getNewGamesMerged,
  getEditorsPicksMerged,
  getSponsoredGamesMerged,
  getOriginalsMerged,
} from "@/lib/curated-games";
import { MobileTemplate1Hero } from "./MobileTemplate1Hero";
import { MobileTemplate2FixedGrid } from "./MobileTemplate2FixedGrid";
import { MobileTemplate3RectSwipe } from "./MobileTemplate3RectSwipe";
import { MobileTemplate4ColorSwipe } from "./MobileTemplate4ColorSwipe";
import { MobileTemplate5StandardSwipe } from "./MobileTemplate5StandardSwipe";
import type { MobileHomepageSection } from "@/lib/mobile-homepage-server";
import type { Game, Category, IconName } from "@/lib/types";

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick and sort games for a section. */
function resolveGames(
  section: MobileHomepageSection,
  realGames: Game[]
): Game[] {
  const { section_key, game_sort, game_limit } = section;

  // --- Which raw set to start from ----------------------------------------
  let pool: Game[];

  if (section_key === "system:featured") {
    pool = getFeaturedGamesMerged(realGames);
  } else if (section_key === "system:trending") {
    pool = getTrendingGamesMerged(realGames, 30);
  } else if (section_key === "system:new") {
    pool = getNewGamesMerged(realGames, 30);
  } else if (section_key === "system:editors_pick") {
    pool = getEditorsPicksMerged(realGames, 30);
  } else if (section_key === "system:sponsored") {
    pool = getSponsoredGamesMerged(realGames, 30);
  } else if (section_key === "system:originals") {
    pool = getOriginalsMerged(realGames, 30);
  } else if (section_key.startsWith("genre:")) {
    const slug = section_key.slice("genre:".length);
    pool = realGames.filter((g) => g.categorySlug === slug);
  } else if (section_key.startsWith("category:")) {
    const slug = section_key.slice("category:".length);
    pool = realGames.filter((g) => g.categorySlug === slug);
  } else {
    pool = [];
  }

  // --- Apply sort -----------------------------------------------------------
  let sorted: Game[];
  switch (game_sort) {
    case "popular":
      sorted = [...pool].sort((a, b) => b.plays - a.plays);
      break;
    case "new":
      sorted = [...pool].sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      );
      break;
    case "trending":
      sorted = [...pool].sort((a, b) => b.plays - a.plays);
      break;
    case "featured":
      // Already sorted by featuredOrder in getFeaturedGamesMerged
      sorted = pool;
      break;
    case "editors_pick":
      // Already sorted by editorsPickOrder in getEditorsPicksMerged
      sorted = pool;
      break;
    case "random":
      sorted = shuffleArray(pool);
      break;
    default:
      sorted = pool;
  }

  return sorted.slice(0, game_limit);
}

/** Resolve category metadata from a section_key */
function resolveCategory(
  section_key: string,
  realCategories: Category[]
): Category | undefined {
  let slug: string | null = null;
  if (section_key.startsWith("genre:")) slug = section_key.slice("genre:".length);
  else if (section_key.startsWith("category:")) slug = section_key.slice("category:".length);

  if (!slug) return undefined;

  // Prefer live DB category (admin may have changed name/icon/color)
  const dbCat = realCategories.find((c) => c.slug === slug);
  if (dbCat) return dbCat;

  // Fall back to static categories.ts
  return staticCategories.find((c) => c.slug === slug);
}

/** Resolve View All href */
function resolveHref(section_key: string): string | undefined {
  if (section_key === "system:featured") return "/leaderboard";
  if (section_key === "system:trending") return "/leaderboard";
  if (section_key === "system:new") return "/latest-games";
  if (section_key === "system:editors_pick") return "/leaderboard";
  if (section_key === "system:sponsored") return undefined;
  if (section_key === "system:originals") return "/leaderboard";

  const slug =
    section_key.startsWith("genre:") ? section_key.slice("genre:".length) :
    section_key.startsWith("category:") ? section_key.slice("category:".length) :
    null;
  return slug ? `/${slug}` : undefined;
}

/** Resolve default icon for system sections */
const SYSTEM_ICONS: Record<string, IconName> = {
  "system:featured": "Sparkles",
  "system:trending": "Flame",
  "system:new": "Sparkles",
  "system:editors_pick": "Sparkles",
  "system:sponsored": "Zap",
  "system:originals": "Home",
};

export interface MobileTemplateRendererProps {
  section: MobileHomepageSection;
  realGames: Game[];
  realCategories: Category[];
}

export function MobileTemplateRenderer({
  section,
  realGames,
  realCategories,
}: MobileTemplateRendererProps) {
  const games = useMemo(
    () => resolveGames(section, realGames),
    [section, realGames]
  );

  const category = useMemo(
    () => resolveCategory(section.section_key, realCategories),
    [section.section_key, realCategories]
  );

  const viewAllHref = resolveHref(section.section_key);
  const icon: IconName = (category?.icon as IconName) ?? SYSTEM_ICONS[section.section_key] ?? "Gamepad2";
  const accent = category?.colorFrom ?? "#7C5CFC";
  const title = section.title ?? category?.name ?? section.section_key;

  const commonProps = {
    games,
    title,
    subtitle: section.subtitle ?? undefined,
    viewAllHref,
    accent,
    icon,
    showViewAll: section.show_view_all,
    category: category ?? null,
  };

  switch (section.template_id) {
    case 1:
      return <MobileTemplate1Hero {...commonProps} />;
    case 2:
      return <MobileTemplate2FixedGrid {...commonProps} />;
    case 3:
      return <MobileTemplate3RectSwipe {...commonProps} />;
    case 4:
      return <MobileTemplate4ColorSwipe {...commonProps} />;
    case 5:
    default:
      return <MobileTemplate5StandardSwipe {...commonProps} />;
  }
}
