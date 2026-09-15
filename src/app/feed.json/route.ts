import { getSeoSettings } from "@/lib/seo-settings";
import { getFeedCacheSettingsServer } from "@/lib/feed-cache-settings-server";
import { getFeedItems } from "@/lib/feed-content-server";
import { SITE_URL } from "@/lib/seo";
import { buildJsonFeed, buildFeedHeaders } from "@/lib/feed-helpers";

// ISR: feeds contain only published public content, no user-specific data.
// 1 hour TTL so feed readers get fresh posts within 1h of publish.
// Admin post publish/trash operations call revalidateTag(CACHE_TAGS.FEEDS).
// Canonical value: REVALIDATE.STATIC_PAGE (3600) in src/lib/cache-config.ts.
export const revalidate = 3600;


// GET /feed.json — JSON Feed 1.1 (https://www.jsonfeed.org/version/1.1/),
// Admin → Cache → Feed Cache → JSON Feeds. Same item list as /feed.xml
// and /atom.xml, just JSON instead of XML for tooling/readers that
// prefer it.
export async function GET() {
  const [seo, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const headers = buildFeedHeaders("application/feed+json; charset=utf-8", feedSettings.jsonFeedCacheTtlSeconds);

  const items = feedSettings.jsonFeedEnabled ? await getFeedItems(feedSettings) : [];

  const feed = buildJsonFeed(items, {
    title: feedSettings.feedTitleOverride || seo.siteName,
    link: SITE_URL,
    description: feedSettings.feedDescription,
    selfUrl: `${SITE_URL}/feed.json`,
  });

  return new Response(JSON.stringify(feed), { headers });
}
