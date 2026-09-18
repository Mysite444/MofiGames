/**
 * src/lib/cache-config.ts
 *
 * SINGLE SOURCE OF TRUTH for every cache duration in MofiGames.
 *
 * Why this file exists
 * --------------------
 * Without it, revalidation numbers were scattered across page files (ISR
 * `revalidate` exports), middleware, next.config.ts header blocks, and
 * admin route handlers — no way to confirm they were consistent, and no
 * single place to change them.
 *
 * With this file, every layer picks its value from one named constant:
 *
 *   Page:           export const revalidate = REVALIDATE.GAME;
 *   Middleware:     cacheControlHeader(pathname)
 *   next.config.ts: CACHE_CONTROL.NAV_FRAGMENT
 *   Admin route:    revalidatePath + revalidateTag both use constants here
 *
 * The four-layer contract
 * -----------------------
 * REVALIDATE.*   — ISR timer (seconds). Next.js/Vercel regenerates the
 *                  page in the background this many seconds after the last
 *                  regeneration. Must agree with s-maxage below.
 *
 * S_MAXAGE.*     — CDN / shared-cache TTL. Set equal to REVALIDATE.* so
 *                  the CDN edge holds a copy for exactly as long as Next.js
 *                  will serve the stale version.
 *
 * SWR.*          — stale-while-revalidate grace period. After s-maxage
 *                  expires, the CDN serves the stale version for up to
 *                  this long while revalidating in background.
 *
 * BROWSER_MAX_AGE.* — browser Cache-Control max-age for HTML responses.
 *                  Kept short so the browser always hits the CDN.
 *
 * Hierarchy enforced here
 * -----------------------
 *   BROWSER_MAX_AGE ≤ S_MAXAGE = REVALIDATE ≤ SWR
 */

// ---------------------------------------------------------------------------
// ISR revalidation windows (exported for page-level `revalidate` exports)
// ---------------------------------------------------------------------------

export const REVALIDATE = {
  /** Homepage. Short because Featured / Trending sections change more often
   *  than other content — admins can also call revalidatePath("/") on save
   *  for instant reflection. */
  HOMEPAGE: 60,

  /** Individual game pages and the generic [slug] catch-all.  5 minutes is
   *  a reasonable balance: game metadata doesn't change by the second, but
   *  admins expect edits to appear within a few minutes even without an
   *  explicit cache bust (which the admin save route also provides). */
  GAME: 300,

  /** Category listing page (/categories) and individual category pages. */
  CATEGORY: 300,

  /** Blog post list (/blog) and individual post pages (/blog/[slug]). */
  POST: 300,

  /** Tag pages — same content-change frequency as categories. */
  TAG: 300,

  /** Static CMS pages (About, Contact, Privacy, Terms…).  1 hour — these
   *  rarely change and the admin save route revalidates on demand anyway. */
  STATIC_PAGE: 3_600,

  /** Navigation fragment API route — very short because nav links are
   *  site-wide and must propagate quickly, but still worth CDN caching. */
  NAV_FRAGMENT: 30,
} as const;

// ---------------------------------------------------------------------------
// CDN s-maxage values (must equal the corresponding REVALIDATE value)
// ---------------------------------------------------------------------------

const S_MAXAGE = {
  HOMEPAGE: REVALIDATE.HOMEPAGE,
  GAME: REVALIDATE.GAME,
  CATEGORY: REVALIDATE.CATEGORY,
  POST: REVALIDATE.POST,
  TAG: REVALIDATE.TAG,
  STATIC_PAGE: REVALIDATE.STATIC_PAGE,
  NAV_FRAGMENT: REVALIDATE.NAV_FRAGMENT,
} as const;

// ---------------------------------------------------------------------------
// stale-while-revalidate grace windows (2× the s-maxage by default)
// ---------------------------------------------------------------------------

const SWR = {
  HOMEPAGE: S_MAXAGE.HOMEPAGE * 2,
  GAME: S_MAXAGE.GAME * 2,
  CATEGORY: S_MAXAGE.CATEGORY * 2,
  POST: S_MAXAGE.POST * 2,
  TAG: S_MAXAGE.TAG * 2,
  STATIC_PAGE: S_MAXAGE.STATIC_PAGE * 2,
  NAV_FRAGMENT: S_MAXAGE.NAV_FRAGMENT * 10,
} as const;

// ---------------------------------------------------------------------------
// Browser max-age for HTML responses (kept short — CDN is the right cache)
// ---------------------------------------------------------------------------

const BROWSER_MAX_AGE = {
  /** Zero = always revalidate in browser but use CDN copy if fresh.
   *  Browsers that respect max-age=0 will still use the cached copy if the
   *  server responds with 304 Not Modified.  This is intentional — we want
   *  the browser to ASK the CDN, not serve stale HTML without asking. */
  DEFAULT: 0,
} as const;

// ---------------------------------------------------------------------------
// Pre-built Cache-Control strings
// ---------------------------------------------------------------------------

/**
 * Build a `Cache-Control` header value for a public HTML response.
 *
 * @param smaxage   CDN TTL in seconds (how long the CDN caches)
 * @param swr       stale-while-revalidate grace in seconds
 * @param maxage    browser TTL in seconds (default 0 — always verify)
 */
function buildPublicCC(smaxage: number, swr: number, maxage = BROWSER_MAX_AGE.DEFAULT): string {
  return `public, max-age=${maxage}, s-maxage=${smaxage}, stale-while-revalidate=${swr}`;
}

/**
 * Pre-built Cache-Control strings used in:
 *   - next.config.ts headers()
 *   - applySecurityCacheHeaders() in middleware.ts
 *   - any route handler that must set its own Cache-Control
 */
export const CACHE_CONTROL = {
  HOMEPAGE: buildPublicCC(S_MAXAGE.HOMEPAGE, SWR.HOMEPAGE),
  GAME: buildPublicCC(S_MAXAGE.GAME, SWR.GAME),
  CATEGORY: buildPublicCC(S_MAXAGE.CATEGORY, SWR.CATEGORY),
  POST: buildPublicCC(S_MAXAGE.POST, SWR.POST),
  TAG: buildPublicCC(S_MAXAGE.TAG, SWR.TAG),
  STATIC_PAGE: buildPublicCC(S_MAXAGE.STATIC_PAGE, SWR.STATIC_PAGE),
  /** Used in next.config.ts to override the blanket /api/** no-store rule
   *  specifically for public, non-personalized fragment endpoints. */
  NAV_FRAGMENT: buildPublicCC(S_MAXAGE.NAV_FRAGMENT, SWR.NAV_FRAGMENT),
  /** Safe default for any public route not matched by the specific cases
   *  above — short enough to be conservative, long enough to be useful. */
  PUBLIC_DEFAULT: buildPublicCC(S_MAXAGE.GAME, SWR.GAME),
  /** Applied by middleware and headers() for any route that must never be
   *  stored in a shared cache (admin, authenticated, private). */
  NO_STORE: "private, no-store, no-cache, max-age=0, must-revalidate",
} as const;

// ---------------------------------------------------------------------------
// Route-aware Cache-Control resolver (used in middleware.ts)
// ---------------------------------------------------------------------------

/**
 * Returns the correct `Cache-Control` header value for a given public
 * pathname.  Called by `applySecurityCacheHeaders()` in middleware.ts only
 * on the "cacheable" decision path — bypass paths get CACHE_CONTROL.NO_STORE
 * regardless of what this function would return.
 *
 * The match order matters: more-specific patterns before less-specific ones.
 */
export function publicCacheControl(pathname: string): string {
  if (pathname === "/") return CACHE_CONTROL.HOMEPAGE;
  if (pathname.startsWith("/blog/")) return CACHE_CONTROL.POST;
  if (pathname === "/blog") return CACHE_CONTROL.POST;
  if (pathname === "/categories") return CACHE_CONTROL.CATEGORY;
  // Static info pages — rarely change
  if (
    pathname === "/about" ||
    pathname === "/contact" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/dmca" ||
    pathname === "/cookie-policy"
  ) {
    return CACHE_CONTROL.STATIC_PAGE;
  }
  // The [slug] catch-all covers games, category pages, tag pages, CMS pages.
  // They all share the same 300s ISR window, so use the same Cache-Control.
  return CACHE_CONTROL.PUBLIC_DEFAULT;
}

// ---------------------------------------------------------------------------
// CACHE TAGS — used with revalidateTag() for Next.js Data Cache invalidation
// ---------------------------------------------------------------------------
//
// WHY TWO LEVELS:
//   Coarse tags  (e.g. CACHE_TAGS.GAMES) — invalidate ALL game-related
//   data in one call. Use when the change could affect many pages (e.g.
//   a new game is published and could appear in listings, homepage, etc.)
//
//   Fine-grained tags (e.g. CACHE_TAGS.gameSlug(slug)) — invalidate only
//   the data for one specific item. Use alongside revalidatePath() so the
//   two systems stay in sync. revalidatePath invalidates the Full Route
//   Cache (complete HTML); revalidateTag invalidates the Next.js Data
//   Cache (fetch() and unstable_cache() entries used during rendering).
//
// HOW ADMIN ROUTES USE THESE:
//   import { CACHE_TAGS } from "@/lib/cache-config";
//   import { revalidateTag, revalidatePath } from "next/cache";
//
//   // On game edit:
//   revalidateTag(CACHE_TAGS.GAMES, { expire: 0 });               // coarse — all game data
//   revalidateTag(CACHE_TAGS.gameSlug(game.slug), { expire: 0 }); // fine  — just this game
//   revalidatePath(`/${game.slug}`);                              // Full Route Cache bust
//
// THE SECOND ARGUMENT MATTERS — ALWAYS PASS { expire: 0 } FROM AN ADMIN
// ROUTE, NEVER A NAMED PROFILE ("default", "max", "hours", …):
//   Next.js 16 made revalidateTag's second argument required, and a named
//   profile ("default", "max", etc.) means stale-while-revalidate — the
//   *next* request after the call still gets the OLD cached value while a
//   fresh one is fetched in the background, and only the request after
//   THAT sees the edit. For a human clicking Save in the admin panel and
//   then immediately looking at the live page, that reads as "my edit did
//   nothing" (see the games/[id]/route.ts PATCH handler's embed_url
//   comment for the concrete symptom this caused). { expire: 0 } is the
//   one option that forces the very next request to be a blocking
//   cache miss — guaranteed fresh data, no stale hop in between. It's the
//   right choice for every admin mutation in this app; reach for a named
//   profile only for time-based (non-admin-triggered) revalidation, which
//   nothing here currently does.
//
// MATCH RULES:
//   A cache entry is invalidated if it carries ANY of the tags passed to
//   revalidateTag(). Tags in this file must exactly match the tags passed
//   to fetch({ next: { tags } }) or unstable_cache({ tags }) at data-fetch
//   time.

export const CACHE_TAGS = {
  // ── Coarse-grained (invalidate whole content type) ──────────────────────
  GAMES: "games",
  CATEGORIES: "categories",
  TAGS: "tags",
  POSTS: "posts",
  PAGES: "pages",
  HOMEPAGE: "homepage",
  NAVIGATION: "navigation",
  FEEDS: "feeds",
  SITEMAPS: "sitemaps",

  // ── Fine-grained factories (invalidate one item) ─────────────────────────
  /** Tag for a specific game by its database id. */
  game: (id: string | number) => `game:${id}`,
  /** Tag for a specific game by its public URL slug. */
  gameSlug: (slug: string) => `game-slug:${slug}`,
  /** Tag for a specific category by its slug. */
  category: (slug: string) => `category:${slug}`,
  /** Tag for a specific tag by its slug. */
  tag: (slug: string) => `tag:${slug}`,
  /** Tag for a specific blog post by its database id. */
  post: (id: string | number) => `post:${id}`,
  /** Tag for a specific blog post by its public URL slug. */
  postSlug: (slug: string) => `post-slug:${slug}`,
  /** Tag for a specific CMS page by its slug. */
  page: (slug: string) => `page:${slug}`,
} as const;

// Type helpers — let callers write CACHE_TAGS.GAMES without `as string`
export type CoarseCacheTag = typeof CACHE_TAGS[
  "GAMES" | "CATEGORIES" | "TAGS" | "POSTS" | "PAGES" | "HOMEPAGE" | "NAVIGATION" | "FEEDS" | "SITEMAPS"
];
