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


// GET /sitemaps/images.xml — an image sitemap pairing each published
// game's page with its cover/thumbnail image, so Google Image Search can
// discover and attribute game artwork back to its game page. This is the
// single highest-leverage, most commonly-skipped piece of "Image SEO" for
// a games site — box art is exactly the kind of image people search for.
// Cache-Control comes from Admin → Cache → Feed Cache → XML Sitemaps.
export async function GET() {
  const [settings, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const headers = buildSitemapHeaders(feedSettings);
  if (!settings.sitemapImagesEnabled) {
    return new Response(buildUrlSetXml([]), { headers });
  }

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("games")
    .select("slug, title, thumbnail_url, cover_image_url")
    .eq("is_published", true)
    .eq("visibility", "public")
    .eq("seo_index", true);

  const entries: SitemapUrlEntry[] = (data ?? [])
    .filter((g) => g.thumbnail_url || g.cover_image_url)
    .map((g) => ({
      loc: `${SITE_URL}/${g.slug}`,
      images: [
        {
          loc: g.cover_image_url || g.thumbnail_url!,
          caption: `${g.title} — free online game`,
        },
      ],
    }));

  return new Response(buildUrlSetXml(entries), { headers });
}
