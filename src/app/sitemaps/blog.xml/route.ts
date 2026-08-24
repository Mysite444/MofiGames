import { createClient } from "@/lib/supabase/server";
import { getSeoSettings } from "@/lib/seo-settings";
import { getFeedCacheSettingsServer } from "@/lib/feed-cache-settings-server";
import { SITE_URL } from "@/lib/seo";
import { buildUrlSetXml, buildSitemapHeaders, type SitemapUrlEntry } from "@/lib/sitemap-helpers";

// GET /sitemaps/blog.xml — every published, indexable blog post.
// Cache-Control comes from Admin → Cache → Feed Cache → XML Sitemaps.
export async function GET() {
  const [settings, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const headers = buildSitemapHeaders(feedSettings);
  if (!settings.sitemapBlogEnabled || !settings.indexBlog) {
    return new Response(buildUrlSetXml([]), { headers });
  }

  const supabase = await createClient();
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
