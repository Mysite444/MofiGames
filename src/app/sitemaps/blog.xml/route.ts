import { createPublicClient } from "@/lib/supabase/public-client";
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


// GET /sitemaps/blog.xml — every published, indexable blog post.
// Cache-Control comes from Admin → Cache → Feed Cache → XML Sitemaps.
export async function GET() {
  const [settings, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const headers = buildSitemapHeaders(feedSettings);
  if (!settings.sitemapBlogEnabled || !settings.indexBlog) {
    return new Response(buildUrlSetXml([]), { headers });
  }

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("posts")
    .select("slug, updated_at, published_at")
    .eq("is_published", true)
    .eq("seo_index", true);

  const entries: SitemapUrlEntry[] = (data ?? []).map((p) => ({
    loc: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.updated_at ?? p.published_at ?? undefined,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return new Response(buildUrlSetXml(entries), { headers });
}
