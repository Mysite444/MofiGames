import { createPublicClient } from "./supabase/public-client";
import { fallbackSeoSettings } from "./static-fallback";
import { isNextControlFlowError } from "./supabase/timeout-fetch";
import { getOrSetFragment } from "./fragment-cache";
import type { SeoSettings } from "./types";

// Server-only. Fetches the single `seo_settings` row (Admin → SEO
// Management → Global Settings) and maps it onto the app's SeoSettings
// shape. Always returns a fully-populated object — DEFAULT_SEO_SETTINGS
// covers the row missing entirely (e.g. migration 0010 not yet run) so
// every call site (layout, every generateMetadata, sitemap/robots routes)
// can use the result unconditionally without its own fallback.

export const DEFAULT_SEO_SETTINGS: SeoSettings = {
  siteName: "MofiGames",
  titleTemplate: "%title% — %site_name%",
  defaultMetaDescription:
    "Hundreds of free browser games across action, racing, puzzle, sports and more. No download, just play.",
  defaultAuthor: "MofiGames Team",
  defaultLanguage: "en",
  defaultRegion: "US",
  defaultRobotsIndex: true,
  defaultRobotsFollow: true,
  canonicalDomain: "non-www",
  trailingSlash: "remove",

  googleSiteVerification: "",
  bingSiteVerification: "",
  yandexSiteVerification: "",
  baiduSiteVerification: "",

  homeSeoTitle: "",
  homeMetaDescription: "",
  homeOgImageUrl: null,

  defaultOgImageUrl: null,
  defaultOgImageAlt: "",
  twitterSite: "",
  twitterCreator: "",
  twitterCardType: "summary_large_image",

  orgName: "MofiGames",
  orgLogoUrl: null,
  orgSameAs: [],

  robotsTxtOverride: null,

  sitemapGamesEnabled: true,
  sitemapCategoriesEnabled: true,
  sitemapTagsEnabled: true,
  sitemapBlogEnabled: true,
  sitemapPagesEnabled: true,
  sitemapImagesEnabled: true,

  indexGames: true,
  indexCategories: true,
  indexTags: true,
  indexBlog: true,
  indexPages: true,
  indexSearchPages: false,
  indexAuthorPages: false,

  updatedAt: new Date(0).toISOString(),
};

// Exported so scripts/generate-static-fallback.ts can map a live row into
// the exact same shape this file already reads back out of the fallback
// snapshot — one mapping, never two copies to keep in sync.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSeoSettingsRow(row: any): SeoSettings {
  return {
    siteName: row.site_name ?? DEFAULT_SEO_SETTINGS.siteName,
    titleTemplate: row.title_template ?? DEFAULT_SEO_SETTINGS.titleTemplate,
    defaultMetaDescription: row.default_meta_description ?? DEFAULT_SEO_SETTINGS.defaultMetaDescription,
    defaultAuthor: row.default_author ?? DEFAULT_SEO_SETTINGS.defaultAuthor,
    defaultLanguage: row.default_language ?? DEFAULT_SEO_SETTINGS.defaultLanguage,
    defaultRegion: row.default_region ?? DEFAULT_SEO_SETTINGS.defaultRegion,
    defaultRobotsIndex: row.default_robots_index ?? true,
    defaultRobotsFollow: row.default_robots_follow ?? true,
    canonicalDomain: row.canonical_domain ?? "non-www",
    trailingSlash: row.trailing_slash ?? "remove",

    googleSiteVerification: row.google_site_verification ?? "",
    bingSiteVerification: row.bing_site_verification ?? "",
    yandexSiteVerification: row.yandex_site_verification ?? "",
    baiduSiteVerification: row.baidu_site_verification ?? "",

    homeSeoTitle: row.home_seo_title ?? "",
    homeMetaDescription: row.home_meta_description ?? "",
    homeOgImageUrl: row.home_og_image_url ?? null,

    defaultOgImageUrl: row.default_og_image_url ?? null,
    defaultOgImageAlt: row.default_og_image_alt ?? "",
    twitterSite: row.twitter_site ?? "",
    twitterCreator: row.twitter_creator ?? "",
    twitterCardType: row.twitter_card_type ?? "summary_large_image",

    orgName: row.org_name ?? DEFAULT_SEO_SETTINGS.orgName,
    orgLogoUrl: row.org_logo_url ?? null,
    orgSameAs: row.org_same_as ?? [],

    robotsTxtOverride: row.robots_txt_override ?? null,

    sitemapGamesEnabled: row.sitemap_games_enabled ?? true,
    sitemapCategoriesEnabled: row.sitemap_categories_enabled ?? true,
    sitemapTagsEnabled: row.sitemap_tags_enabled ?? true,
    sitemapBlogEnabled: row.sitemap_blog_enabled ?? true,
    sitemapPagesEnabled: row.sitemap_pages_enabled ?? true,
    sitemapImagesEnabled: row.sitemap_images_enabled ?? true,

    indexGames: row.index_games ?? true,
    indexCategories: row.index_categories ?? true,
    indexTags: row.index_tags ?? true,
    indexBlog: row.index_blog ?? true,
    indexPages: row.index_pages ?? true,
    indexSearchPages: row.index_search_pages ?? false,
    indexAuthorPages: row.index_author_pages ?? false,

    updatedAt: row.updated_at ?? new Date(0).toISOString(),
  };
}

/** The single source of truth for Global SEO Settings, read on every
 * public page. Falls back in two steps when the live row can't be read:
 * first to the real, admin-configured settings captured in the last
 * static snapshot (src/data/fallback/seo-settings.json), then to
 * DEFAULT_SEO_SETTINGS whole-cloth only if even that snapshot is missing
 * — so a settings outage degrades to "the SEO config as of the last
 * successful deploy," not a broken page. */
// Fragment-cached under "seo-settings" (Admin → Cache → Fragment Cache,
// 120s default TTL) — this row backs generateMetadata() on literally
// every page (including the homepage) plus the sitemap/robots routes,
// but previously had no caching, making it a live Supabase round trip
// on every single request. PUT /api/admin/seo/settings purges this
// fragment immediately on save via invalidateSeoSettingsFragments(), so
// an admin's change is reflected on the very next request regardless of
// the TTL — the TTL only matters as a safety net between saves.
export async function getSeoSettings(): Promise<SeoSettings> {
  return getOrSetFragment("seo-settings", undefined, async () => {
    try {
      const supabase = createPublicClient();
      const { data, error } = await supabase.from("seo_settings").select("*").eq("id", true).maybeSingle();
      if (error || !data) throw error ?? new Error("seo_settings: no row");
      return mapSeoSettingsRow(data);
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      console.error("[seo-settings] Live read failed, using static fallback:", err);
      const snapshot = fallbackSeoSettings();
      return snapshot ? { ...DEFAULT_SEO_SETTINGS, ...snapshot } : DEFAULT_SEO_SETTINGS;
    }
  });
}
