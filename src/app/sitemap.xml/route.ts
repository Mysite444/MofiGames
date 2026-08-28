import { getSeoSettings } from "@/lib/seo-settings";
import { getFeedCacheSettingsServer } from "@/lib/feed-cache-settings-server";
import { SITE_URL } from "@/lib/seo";
import { buildSitemapIndexXml, buildSitemapHeaders, type SitemapIndexEntry } from "@/lib/sitemap-helpers";

// GET /sitemap.xml — the sitemap index (XML Sitemap Management). Lists
// only the per-type sitemaps currently enabled in Admin → SEO Management
// → Sitemaps; a disabled sitemap's route still exists (returns an empty
// urlset) but is simply not linked from here, so it drops out of crawl
// discovery without needing its own on/off logic duplicated. Its
// Cache-Control comes from Admin → Cache → Feed Cache → XML Sitemaps.
export async function GET() {
  const [settings, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const now = new Date();

  const entries: SitemapIndexEntry[] = [
    ...(settings.sitemapCategoriesEnabled ? [{ loc: `${SITE_URL}/sitemaps/categories.xml`, lastModified: now }] : []),
    ...(settings.sitemapGamesEnabled ? [{ loc: `${SITE_URL}/sitemaps/games.xml`, lastModified: now }] : []),
    ...(settings.sitemapTagsEnabled ? [{ loc: `${SITE_URL}/sitemaps/tags.xml`, lastModified: now }] : []),
    ...(settings.sitemapBlogEnabled ? [{ loc: `${SITE_URL}/sitemaps/blog.xml`, lastModified: now }] : []),
    ...(settings.sitemapPagesEnabled ? [{ loc: `${SITE_URL}/sitemaps/pages.xml`, lastModified: now }] : []),
    ...(settings.sitemapImagesEnabled ? [{ loc: `${SITE_URL}/sitemaps/images.xml`, lastModified: now }] : []),
  ];

  return new Response(buildSitemapIndexXml(entries), { headers: buildSitemapHeaders(feedSettings) });
}
