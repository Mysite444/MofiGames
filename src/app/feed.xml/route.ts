import { getSeoSettings } from "@/lib/seo-settings";
import { getFeedCacheSettingsServer } from "@/lib/feed-cache-settings-server";
import { getFeedItems } from "@/lib/feed-content-server";
import { SITE_URL } from "@/lib/seo";
import { buildRssXml, buildFeedHeaders } from "@/lib/feed-helpers";

// GET /feed.xml — RSS 2.0 (Admin → Cache → Feed Cache → RSS Feeds).
// Generated live from the database on every request, same "no stored
// cache, just a Cache-Control header" shape as the XML Sitemaps —
// disabling it here returns an empty channel rather than a 404, so a
// feed reader that already subscribed doesn't start erroring.
export async function GET() {
  const [seo, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const headers = buildFeedHeaders("application/rss+xml; charset=utf-8", feedSettings.rssCacheTtlSeconds);

  const items = feedSettings.rssEnabled ? await getFeedItems(feedSettings) : [];

  const xml = buildRssXml(items, {
    title: feedSettings.feedTitleOverride || seo.siteName,
    link: SITE_URL,
    description: feedSettings.feedDescription,
    selfUrl: `${SITE_URL}/feed.xml`,
  });

  return new Response(xml, { headers });
}
