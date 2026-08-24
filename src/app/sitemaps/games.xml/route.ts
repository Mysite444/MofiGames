import { createClient } from "@/lib/supabase/server";
import { getSeoSettings } from "@/lib/seo-settings";
import { getFeedCacheSettingsServer } from "@/lib/feed-cache-settings-server";
import { SITE_URL } from "@/lib/seo";
import { buildUrlSetXml, buildSitemapHeaders, type SitemapUrlEntry } from "@/lib/sitemap-helpers";

// GET /sitemaps/games.xml — every published, public, indexable real game.
// Excludes: drafts (is_published=false), non-public visibility, and any
// game with per-game noindex set (seo_index=false) — a page marked
// noindex has no business being submitted for crawling in the first
// place, that's exactly the contradiction Google's Search Console flags
// as "Submitted URL marked 'noindex'". Cache-Control comes from
// Admin → Cache → Feed Cache → XML Sitemaps.
export async function GET() {
  const [settings, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const headers = buildSitemapHeaders(feedSettings);
  if (!settings.sitemapGamesEnabled || !settings.indexGames) {
    return new Response(buildUrlSetXml([]), { headers });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("games")
    .select("slug, updated_at, thumbnail_url, cover_image_url, title")
    .eq("is_published", true)
    .eq("visibility", "public")
    .eq("seo_index", true);

  if (error || !data) {
    return new Response(buildUrlSetXml([]), { headers });
  }

  const entries: SitemapUrlEntry[] = data.map((g) => ({
    loc: `${SITE_URL}/${g.slug}`,
    lastModified: g.updated_at ?? undefined,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return new Response(buildUrlSetXml(entries), { headers });
}
