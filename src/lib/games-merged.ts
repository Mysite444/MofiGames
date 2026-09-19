"use client";

import { useRealGames } from "./supabase/real-games-client";
import type { Game, Category } from "./types";

// Client components (search, random game button, favorites/recently-played
// lists, etc.) read real games/categories from Supabase via useRealGames().
// These hooks give them a convenient shape, falling back to the static
// built-in genre taxonomy (lib/categories.ts) only for categories — that
// list is real site structure, not placeholder data, and is always
// available even before any DB category rows exist.

export function useMergedGames(): { games: Game[]; categories: Category[]; ready: boolean } {
  const { games: realGames, categories: realCategories, ready } = useRealGames();
  return { games: realGames, categories: realCategories, ready };
}

export function useGamesByCategory(categorySlug: string): Game[] {
  const { games: realGames } = useRealGames();
  return realGames.filter((g) => g.categorySlug === categorySlug);
}
