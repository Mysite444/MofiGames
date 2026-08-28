import { createClient } from "@/lib/supabase/server";
import { categories as builtInCategories } from "@/lib/categories";
import { getSeoSettings } from "@/lib/seo-settings";
import { getFeedCacheSettingsServer } from "@/lib/feed-cache-settings-server";
import { SITE_URL } from "@/lib/seo";
import { buildUrlSetXml, buildSitemapHeaders, type SitemapUrlEntry } from "@/lib/sitemap-helpers";

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

  const supabase = await createClient();
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
