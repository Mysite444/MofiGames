import { createPublicClient } from "./supabase/public-client";
import { withTimeout, isNextControlFlowError, DEFAULT_SUPABASE_TIMEOUT_MS } from "./supabase/timeout-fetch";
import { ALL_REGISTRY_SECTIONS } from "./homepage-section-registry";
import { getOrSetFragment } from "./fragment-cache";

// Server-only reads backing the Homepage Categories Manager
// (src/components/admin/HomepageCategoriesManager.tsx). Kept separate from
// games-server.ts since these two tables (homepage_sections,
// homepage_section_games) are about page *layout*, not game/category data
// itself.

export interface SectionOverride {
  label: string | null;
  position: number;
  isVisible: boolean;
}

/** Admin overrides (label / global position / visibility) for the 25
 * registry rows (7 system-curated + 18 built-in genres), keyed by
 * section_key. Falls back to the code-side registry default for any row
 * missing from the DB — e.g. migration 0030 not yet applied — so the
 * public homepage always has something sensible to render.
 *
 * That same code-side default is also what this returns whole-cloth if
 * the live query itself fails (Supabase unreachable): the map below is
 * built from ALL_REGISTRY_SECTIONS *before* the query runs, so a failed
 * query just means "render the default homepage layout" rather than
 * crashing the page — no separate JSON snapshot needed for this one,
 * unlike games/categories/pages, since the registry itself already is
 * the static fallback. */
export async function getHomepageSectionOverrides(): Promise<Map<string, SectionOverride>> {
  return getOrSetFragment("homepage-sections", "overrides", async () => {
    const map = new Map<string, SectionOverride>();
    for (const def of ALL_REGISTRY_SECTIONS) {
      map.set(def.key, { label: null, position: def.defaultPosition, isVisible: true });
    }

    try {
      const supabase = createPublicClient();
      const { data, error } = await withTimeout(
        supabase.from("homepage_sections").select("section_key, label, position, is_visible"),
        DEFAULT_SUPABASE_TIMEOUT_MS,
        "homepage section overrides"
      );
      if (error) throw error;

      for (const row of data ?? []) {
        map.set(row.section_key, {
          label: row.label ?? null,
          position: row.position,
          isVisible: row.is_visible,
        });
      }
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      console.error("[homepage-layout-server] getHomepageSectionOverrides falling back to default layout:", err);
      // map already holds the full code-side default — nothing further to do.
    }
    return map;
  });
}

/** Manually pinned game ids for every homepage row, grouped by
 * section_key and already in pin order. section_key covers all three row
 * kinds ("system:*", "genre:*", "category:*"). Returns ids only — callers
 * that already have the full published-games list (every page that renders
 * the homepage does) can resolve them locally instead of a second query.
 *
 * On failure, returns an empty map (no pins) rather than throwing —
 * every homepage row still renders its normal automatic game list, it
 * just won't show an admin's manually-pinned picks until Supabase is
 * reachable again. */
export async function getHomepageSectionPinnedGameIds(): Promise<Map<string, string[]>> {
  return getOrSetFragment("homepage-sections", "pinned-game-ids", async () => {
    const map = new Map<string, string[]>();
    try {
      const supabase = createPublicClient();
      const { data, error } = await withTimeout(
        supabase.from("homepage_section_games").select("section_key, game_id").order("position", { ascending: true }),
        DEFAULT_SUPABASE_TIMEOUT_MS,
        "homepage pinned games"
      );
      if (error || !data) throw error ?? new Error("homepage pinned games: empty response");

      for (const row of data) {
        const list = map.get(row.section_key) ?? [];
        list.push(row.game_id);
        map.set(row.section_key, list);
      }
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      console.error("[homepage-layout-server] getHomepageSectionPinnedGameIds falling back to no pins:", err);
    }
    return map;
  });
}
