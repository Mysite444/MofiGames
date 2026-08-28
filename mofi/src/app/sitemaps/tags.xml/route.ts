import { createClient } from "@/lib/supabase/server";
import { getSeoSettings } from "@/lib/seo-settings";
import { getFeedCacheSettingsServer } from "@/lib/feed-cache-settings-server";
import { SITE_URL } from "@/lib/seo";
import { buildUrlSetXml, buildSitemapHeaders, type SitemapUrlEntry } from "@/lib/sitemap-helpers";

// GET /sitemaps/tags.xml — every tag that has at least one published post
// or game attached (an empty tag archive page is thin/duplicate content
// and shouldn't be submitted for crawling). Cache-Control comes from
// Admin → Cache → Feed Cache → XML Sitemaps.
export async function GET() {
  const [settings, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const headers = buildSitemapHeaders(feedSettings);
  if (!settings.sitemapTagsEnabled || !settings.indexTags) {
    return new Response(buildUrlSetXml([]), { headers });
  }

  const supabase = await createClient();
  const { data } = await supabase.from("tags").select("slug, seo_index").eq("seo_index", true);

  const entries: SitemapUrlEntry[] = (data ?? []).map((t) => ({
    loc: `${SITE_URL}/${t.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return new Response(buildUrlSetXml(entries), { headers });
}
