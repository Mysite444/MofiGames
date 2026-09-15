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

  const supabase = createPublicClient();
  const { data } = await supabase.from("tags").select("slug, seo_index").eq("seo_index", true);

  const entries: SitemapUrlEntry[] = (data ?? []).map((t) => ({
    loc: `${SITE_URL}/${t.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return new Response(buildUrlSetXml(entries), { headers });
}
