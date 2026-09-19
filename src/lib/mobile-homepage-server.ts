import { createPublicClient } from "./supabase/public-client";
import { withTimeout, isNextControlFlowError, DEFAULT_SUPABASE_TIMEOUT_MS } from "./supabase/timeout-fetch";
import { getOrSetFragment } from "./fragment-cache";

// Server-only reads backing the mobile homepage.
// Kept in its own module (not merged with homepage-layout-server.ts) because
// the mobile section table has additional fields (template_id, game_sort,
// game_limit, subtitle, settings) that have no equivalent on the PC side.

export type MobileGameSort =
  | "popular"
  | "new"
  | "trending"
  | "featured"
  | "editors_pick"
  | "random";

export interface MobileHomepageSection {
  id: string;
  section_key: string;
  template_id: 1 | 2 | 3 | 4 | 5;
  position: number;
  title: string | null;
  subtitle: string | null;
  is_enabled: boolean;
  game_limit: number;
  game_sort: MobileGameSort;
  show_view_all: boolean;
  settings: Record<string, unknown>;
}

/**
 * Fetches all ENABLED mobile homepage sections, ordered by position.
 * Fragment-cached under "mobile-homepage" / "sections" so repeated ISR
 * renders don't hammer Supabase. Invalidated by the admin write routes.
 */
export async function getMobileHomepageSections(): Promise<MobileHomepageSection[]> {
  return getOrSetFragment("mobile-homepage", "sections", async () => {
    try {
      const supabase = createPublicClient();
      const { data, error } = await withTimeout(
        supabase
          .from("mobile_homepage_sections")
          .select("*")
          .eq("is_enabled", true)
          .order("position", { ascending: true }),
        DEFAULT_SUPABASE_TIMEOUT_MS,
        "mobile homepage sections"
      );
      if (error || !data) throw error ?? new Error("mobile homepage sections: empty response");
      return data as MobileHomepageSection[];
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      console.error("[mobile-homepage-server] getMobileHomepageSections failed, returning []:", err);
      return [];
    }
  });
}

/**
 * Fetches ALL sections (enabled + disabled) for the admin panel.
 * Never cached — the admin needs the live view.
 */
export async function getMobileHomepageSectionsAdmin(): Promise<MobileHomepageSection[]> {
  const supabase = createPublicClient();
  const { data, error } = await withTimeout(
    supabase
      .from("mobile_homepage_sections")
      .select("*")
      .order("position", { ascending: true }),
    DEFAULT_SUPABASE_TIMEOUT_MS,
    "mobile homepage sections admin"
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as MobileHomepageSection[];
}
