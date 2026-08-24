import { cache } from "react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import {
  createTimeoutFetch,
  withTimeout,
  isNextControlFlowError,
  DEFAULT_SUPABASE_TIMEOUT_MS,
} from "./supabase/timeout-fetch";
import { mapDbGameRow, mapDbCategoryRow, type DbGameRow, type DbCategoryRow } from "./games-mapping";
import { getOrSetFragment } from "./fragment-cache";
import { getOrSetMetadataCache, getGameMetadataBypassForAdminsSetting } from "./metadata-cache";
import {
  fallbackGames,
  fallbackCategories,
  fallbackGameBySlug,
  fallbackCategoryBySlug,
} from "./static-fallback";
import type { Game, Category } from "./types";

// Server-only. Fetches real (database-backed) games/categories added
// through the admin panel, mapped onto the existing Game/Category shape.
//
// Resilience contract for every exported function below: a live Supabase
// failure (network error, timeout — see timeout-fetch.ts — or a thrown
// client error) is caught, logged, and answered from the static snapshot
// in src/data/fallback/ (see static-fallback.ts) instead of propagating
// up and crashing the calling page. getOrSetFragment()'s own try/catch
// already covers the case where a *stale* in-memory entry exists to fall
// back to; the try/catch here is what covers the case it can't — a cold
// start, a fresh deploy, or a fresh serverless instance spun up *during*
// an outage, none of which have anything warm to serve.

/** Base URL of the Vercel Blob store that uploaded game builds live in —
 * see NEXT_PUBLIC_BLOB_BASE_URL in .env.example. Only used to turn
 * games.storage_path back into a playable URL (mapDbGameRow /
 * resolvePlayUrl in games-mapping.ts); everything else here still reads
 * from Supabase. */
function blobBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BLOB_BASE_URL!;
}

/** generateStaticParams() runs at build time with no HTTP request, so the
 * cookie-based createClient() above (next/headers' cookies()) isn't
 * available there — this is a plain, stateless, anon-key client for that
 * one build-time use, still fully RLS-gated like every other anon read.
 * Falls back to the slugs already present in the static snapshot (which
 * is itself refreshed from the same table right before this runs, via
 * `npm run prebuild` — see scripts/generate-static-fallback.ts) if
 * Supabase can't be reached at build time, so a build during an outage
 * still pre-renders every previously-known game page instead of none. */
export async function getPublishedGameSlugsForStaticParams(): Promise<string[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return fallbackGames().map((g) => g.slug);

  try {
    const supabase = createSupabaseClient(url, key, {
      auth: { persistSession: false },
      global: { fetch: createTimeoutFetch() },
    });
    const { data, error } = await supabase
      .from("games")
      .select("slug")
      .eq("is_published", true)
      .eq("visibility", "public");
    if (error || !data) throw error ?? new Error("games slugs: empty response");
    return data.map((row) => row.slug as string);
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("[games-server] getPublishedGameSlugsForStaticParams falling back to static snapshot:", err);
    return fallbackGames().map((g) => g.slug);
  }
}

/** All real categories, build-time safe — for use in generateStaticParams()
 * only. Uses a plain, stateless, anon-key Supabase client (identical to the
 * pattern in getPublishedGameSlugsForStaticParams above) because
 * generateStaticParams runs at build time with no HTTP request, so the
 * cookie-based createClient() / next/headers cookies() is not available
 * there. At runtime, all other call sites should continue using
 * getAllRealCategories() (fragment-cached, cookie-aware) instead of this.
 *
 * Falls back to the static snapshot on any network error so a build during a
 * Supabase outage still pre-renders every previously-known category page. */
export async function getAllRealCategoriesForStaticParams(): Promise<Category[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return fallbackCategories();

  try {
    const supabase = createSupabaseClient(url, key, {
      auth: { persistSession: false },
      global: { fetch: createTimeoutFetch() },
    });
    const { data, error } = await supabase.from("categories").select("*");
    if (error || !data) throw error ?? new Error("categories for static params: empty response");
    return data.map((row) => mapDbCategoryRow(row as DbCategoryRow));
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("[games-server] getAllRealCategoriesForStaticParams falling back to static snapshot:", err);
    return fallbackCategories();
  }
}

/** `restrictToPublic: true` is the only shape this app is ever allowed
 * to write into the Game Metadata cache (Admin → Cache → Metadata
 * Cache) — a non-admin's request must never be able to read back a
 * private/unlisted/draft row that got cached while an admin was
 * previewing it. `false` is the original, RLS-gated, unrestricted
 * lookup ("is_published = true or is_admin()"), used only for the
 * live/uncached admin-preview path below.
 *
 * The static-snapshot fallback only ever holds published/public games
 * (see the generator script), so it's safe to use regardless of
 * `restrictToPublic` — there's nothing private in it to leak. An admin
 * previewing a draft game during a live Supabase outage simply won't
 * see it via the fallback (a draft was never in a public snapshot to
 * begin with); that's an acceptable degradation for an editing tool
 * during an outage, not a security concern. */
export async function fetchGameBySlugLive(
  slug: string,
  restrictToPublic: boolean
): Promise<{ game: Game; category: Category } | null> {
  try {
    const supabase = await createClient();
    let query = supabase.from("games").select("*").eq("slug", slug);
    if (restrictToPublic) {
      query = query.eq("is_published", true).neq("visibility", "private");
    }
    const { data: gameRow, error } = await withTimeout(query.maybeSingle(), DEFAULT_SUPABASE_TIMEOUT_MS, "game by slug");
    if (error) throw error;
    if (!gameRow) return null;

    const { data: categoryRow } = await supabase
      .from("categories")
      .select("*")
      .eq("slug", gameRow.category_slug)
      .maybeSingle();
    if (!categoryRow) return null;

    return {
      game: mapDbGameRow(gameRow as DbGameRow, blobBaseUrl()),
      category: mapDbCategoryRow(categoryRow as DbCategoryRow),
    };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error(`[games-server] fetchGameBySlugLive("${slug}") falling back to static snapshot:`, err);
    const game = fallbackGameBySlug(slug);
    if (!game) return null;
    const category = fallbackCategoryBySlug(game.categorySlug);
    if (!category) return null;
    return { game, category };
  }
}

/** Backs both generateMetadata() and the page component itself in
 * src/app/[slug]/page.tsx — previously two independent live
 * Supabase round trips per request. Now routed through the Game
 * Metadata namespace of Admin → Cache → Metadata Cache
 * (metadata-cache.ts), at most one live fetch per TTL window.
 *
 * A signed-in admin always sees a live read when
 * game_metadata_bypass_for_admins is on (the default) — they're the one
 * audience that must never be shown a stale cached copy of a game they
 * might be actively editing. When that toggle is off, an admin still
 * gets the cached public copy for a public game (same as everyone
 * else), and only falls through to a live RLS-gated lookup for a
 * draft/private/unlisted one the cache never stores in the first place.
 *
 * Wrapped end-to-end in try/catch: getOrSetMetadataCache() rethrows on a
 * cache miss whose compute() fails (see metadata-cache.ts — unlike
 * fragment-cache.ts it has no stale-value fallback of its own), so
 * without this, a Supabase outage hitting an uncached game slug would
 * crash the game page. fetchGameBySlugLive above already knows how to
 * answer from the static snapshot, so on any failure here we just call
 * it directly. */
export async function getRealGameBySlug(
  slug: string
): Promise<{ game: Game; category: Category } | null> {
  try {
    const admin = await isCurrentUserAdmin();
    const bypass = admin && (await getGameMetadataBypassForAdminsSetting());

    if (bypass) {
      return fetchGameBySlugLive(slug, false);
    }

    const { value } = await getOrSetMetadataCache("games", slug, () => fetchGameBySlugLive(slug, true));
    if (value) return value;

    // No publicly-cacheable row at this slug. Correct final answer for a
    // non-admin (private/unpublished games aren't theirs to see). For an
    // admin, fall through to one live, RLS-gated lookup so they can still
    // preview a draft — RLS is what actually authorizes that, not this
    // branch.
    if (admin) return fetchGameBySlugLive(slug, false);
    return null;
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error(`[games-server] getRealGameBySlug("${slug}") falling back to static snapshot:`, err);
    return fetchGameBySlugLive(slug, true);
  }
}

/** Fragment-cached under "related-games" (Admin → Cache → Fragment Cache),
 * one entry per category slug — this is what powers the "Play next" grid
 * on every game page (src/app/[slug]/page.tsx) as well as the
 * category filter on the public /api/v1/games endpoint. */
export async function getRealGamesByCategory(categorySlug: string): Promise<Game[]> {
  return getOrSetFragment("related-games", categorySlug, async () => {
    try {
      const supabase = await createClient();
      const { data, error } = await withTimeout(
        supabase
          .from("games")
          .select("*")
          .eq("category_slug", categorySlug)
          .eq("is_published", true)
          .eq("visibility", "public")
          .order("created_at", { ascending: false }),
        DEFAULT_SUPABASE_TIMEOUT_MS,
        "games by category"
      );
      if (error || !data) throw error ?? new Error("games by category: empty response");
      return data.map((row) => mapDbGameRow(row as DbGameRow, blobBaseUrl()));
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      console.error(`[games-server] getRealGamesByCategory("${categorySlug}") falling back to static snapshot:`, err);
      return fallbackGames().filter((g) => g.categorySlug === categorySlug);
    }
  });
}

/** All published real games, most recent first — for blending into
 * homepage rows, "latest games", etc. Only `visibility: 'public'` games
 * are included here — 'unlisted' games are still reachable at their
 * direct `/{slug}` URL (see getRealGameBySlug, unfiltered by
 * visibility), just never surfaced in a listing; 'private' games aren't
 * reachable by non-admins at all (enforced in the game page itself).
 *
 * Fragment-cached under "game-cards" (Admin → Cache → Fragment Cache) —
 * this single read backs essentially every game-card grid on the site
 * (homepage rows, /games, category pages), so caching it here has more
 * reach than caching any one row individually. Falls back to a live
 * query automatically whenever the fragment is disabled.
 *
 * This is the single most important fallback in the app: it's what the
 * homepage, /games, and every /{category-slug} page ultimately render
 * their game grids from. On any live-read failure with nothing warm in
 * the fragment cache, it answers from the static snapshot instead of
 * throwing — a Supabase outage means visitors see the catalog as of the
 * last successful deploy, not an error page. */
export async function getAllRealGames(): Promise<Game[]> {
  return getOrSetFragment("game-cards", "all-games", async () => {
    try {
      const supabase = await createClient();
      const { data, error } = await withTimeout(
        supabase
          .from("games")
          .select("*")
          .eq("is_published", true)
          .eq("visibility", "public")
          .order("created_at", { ascending: false }),
        DEFAULT_SUPABASE_TIMEOUT_MS,
        "all games"
      );
      if (error || !data) throw error ?? new Error("all games: empty response");
      return data.map((row) => mapDbGameRow(row as DbGameRow, blobBaseUrl()));
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      console.error("[games-server] getAllRealGames falling back to static snapshot:", err);
      return fallbackGames();
    }
  });
}

/** Whether the current request's signed-in user (if any) is an admin —
 * used to let a 'private' game's page still render for admins previewing
 * it, while returning a 404 to everyone else.
 *
 * Wrapped in React's cache() for request-level dedup: getRealGameBySlug()
 * now calls this (to decide whether to bypass the Game Metadata cache),
 * and it's also called directly by src/app/[slug]/page.tsx's own
 * private-game check — without dedup that's up to three auth round trips
 * (generateMetadata, the page component, the private check) for what's
 * conceptually one fact about one request. cache() makes repeat calls
 * within the same server render resolve to the same in-flight/settled
 * promise instead of re-querying — this does NOT persist across
 * requests, unlike metadata-cache.ts's TTL store, so it's a complement
 * to it, not a replacement.
 *
 * Fails to `false` (never admin) on any error — the safe direction for
 * both correctness (an outage should never accidentally grant admin
 * previews to a real visitor) and resilience (never let an auth check
 * be the reason a page crashes). */
export const isCurrentUserAdmin = cache(async (): Promise<boolean> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await withTimeout(supabase.auth.getUser(), DEFAULT_SUPABASE_TIMEOUT_MS, "auth.getUser");
    if (!user) return false;
    const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    return Boolean(data?.is_admin);
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("[games-server] isCurrentUserAdmin failed, treating as signed-out:", err);
    return false;
  }
});

/** All real categories (regardless of whether they have games yet).
 * Same "game-cards" fragment as getAllRealGames above, distinct variant —
 * categories change far less often than games but are read on nearly
 * every page, so they're worth caching independently rather than folding
 * into the games entry. */
export async function getAllRealCategories(): Promise<Category[]> {
  return getOrSetFragment("game-cards", "all-categories", async () => {
    try {
      const supabase = await createClient();
      const { data, error } = await withTimeout(
        supabase.from("categories").select("*"),
        DEFAULT_SUPABASE_TIMEOUT_MS,
        "all categories"
      );
      if (error || !data) throw error ?? new Error("all categories: empty response");
      return data.map((row) => mapDbCategoryRow(row as DbCategoryRow));
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      console.error("[games-server] getAllRealCategories falling back to static snapshot:", err);
      return fallbackCategories();
    }
  });
}
