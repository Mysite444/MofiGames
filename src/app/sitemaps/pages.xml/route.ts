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


// GET /sitemaps/pages.xml — every published, indexable static/custom page
// (About, Contact, FAQ, Privacy, Terms, and anything created through
// Admin → Content Management → Pages). Cache-Control comes from
// Admin → Cache → Feed Cache → XML Sitemaps.
export async function GET() {
  const [settings, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const headers = buildSitemapHeaders(feedSettings);
  if (!settings.sitemapPagesEnabled || !settings.indexPages) {
    return new Response(buildUrlSetXml([]), { headers });
  }

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("pages")
    .select("slug, updated_at")
    .eq("is_published", true)
    .eq("seo_index", true);

  const entries: SitemapUrlEntry[] = [
    { loc: `${SITE_URL}/`, changeFrequency: "daily", priority: 1.0 },
    ...(data ?? []).map((p) => ({
      loc: `${SITE_URL}/${p.slug}`,
      lastModified: p.updated_at ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    })),
  ];

  return new Response(buildUrlSetXml(entries), { headers });
}
