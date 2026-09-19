import { createPublicClient } from "@/lib/supabase/public-client";
import { categories as builtInCategories } from "@/lib/categories";
import { getSeoSettings } from "@/lib/seo-settings";
import { getFeedCacheSettingsServer } from "@/lib/feed-cache-settings-server";
import { SITE_URL } from "@/lib/seo";
import { buildUrlSetXml, buildSitemapHeaders, type SitemapUrlEntry } from "@/lib/sitemap-helpers";

// ISR: sitemaps are public, contain no user-specific data, and change only
// when content is published/updated. 1 hour TTL means bots get fresh data
// within 1h of a publish, and zero DB calls for repeat requests within
// that window. Admin publish operations call revalidateTag(CACHE_TAGS.SITEMAPS)
// to bust immediately when content is published.
// Canonical value: REVALIDATE.STATIC_PAGE (3600) in src/lib/cache-config.ts.
export const revalidate = 3600;


// GET /sitemaps/categories.xml — every genre/category page, both the
// code-defined built-in categories (always present) and any real
// (database) categories added through Admin → Categories.
// Cache-Control comes from Admin → Cache → Feed Cache → XML Sitemaps.
export async function GET() {
  const [settings, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const headers = buildSitemapHeaders(feedSettings);
  if (!settings.sitemapCategoriesEnabled || !settings.indexCategories) {
    return new Response(buildUrlSetXml([]), { headers });
  }

  const supabase = createPublicClient();
  const { data } = await supabase.from("categories").select("slug, seo_index");

  const realSlugs = new Set((data ?? []).filter((c) => c.seo_index !== false).map((c) => c.slug));
  const builtInSlugs = builtInCategories.map((c) => c.slug);
  const allSlugs = new Set([...builtInSlugs, ...realSlugs]);

  const entries: SitemapUrlEntry[] = Array.from(allSlugs).map((slug) => ({
    loc: `${SITE_URL}/${slug}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return new Response(buildUrlSetXml(entries), { headers });
}
