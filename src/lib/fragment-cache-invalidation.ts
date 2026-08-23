import { purgeFragment } from "./fragment-cache";

// Called from admin write routes to keep the Fragment Cache (Admin →
// Cache → Fragment Cache) from serving stale data after an edit. Caching
// getAllRealGames/getAllRealCategories/getRealGamesByCategory etc. only
// pays off if the corresponding writes clear their entries — otherwise
// an admin publishing a game or editing the homepage would see their
// change appear to silently not take effect for the length of that
// fragment's TTL. Each function purges every fragment whose cached
// output could be affected by that category of write, not just the most
// obvious one, since e.g. a game's category assignment change affects
// Related Games too, not only Game Cards.

/** Any create/update/delete/publish-toggle on a game, or a category
 * create/update/delete (games are filtered by category_slug in several
 * cached reads). */
export function invalidateGameFragments(): void {
  purgeFragment("game-cards");
  purgeFragment("trending-games");
  purgeFragment("featured-games");
  purgeFragment("related-games");
}

/** Homepage section order/label/visibility, or pinned-games changes
 * (reorder, sections/[key], sections/games, sections/games/reorder). */
export function invalidateHomepageFragments(): void {
  purgeFragment("homepage-sections");
}

/** Menu links or nav-visible pages (create/update/delete, or toggling
 * show_in_nav/is_published/is_active). */
export function invalidateNavigationFragments(): void {
  purgeFragment("navigation-menus");
}

/** Site Identity saves (copyright_text feeds the footer fragment). */
export function invalidateFooterFragments(): void {
  purgeFragment("footer-widgets");
}

/** Site Identity saves (name/tagline/logo/favicons/copyright) — see
 * getSiteIdentity() in site-identity.ts. Called alongside
 * invalidateFooterFragments() above, which covers a different
 * downstream fragment. */
export function invalidateSiteIdentityFragments(): void {
  purgeFragment("site-identity");
}

/** SEO Management → Global Settings saves — see getSeoSettings() in
 * seo-settings.ts. */
export function invalidateSeoSettingsFragments(): void {
  purgeFragment("seo-settings");
}
