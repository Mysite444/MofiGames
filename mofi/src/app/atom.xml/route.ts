import { getSeoSettings } from "@/lib/seo-settings";
import { getFeedCacheSettingsServer } from "@/lib/feed-cache-settings-server";
import { getFeedItems } from "@/lib/feed-content-server";
import { SITE_URL } from "@/lib/seo";
import { buildAtomXml, buildFeedHeaders } from "@/lib/feed-helpers";

// GET /atom.xml — Atom 1.0 / RFC 4287 (Admin → Cache → Feed Cache →
// Atom Feeds). Same item list as /feed.xml and /feed.json — see
// getFeedItems() in feed-content-server.ts — just a different envelope
// for readers/tooling that prefer Atom's stricter, less-ambiguous format.
export async function GET() {
  const [seo, feedSettings] = await Promise.all([getSeoSettings(), getFeedCacheSettingsServer()]);
  const headers = buildFeedHeaders("application/atom+xml; charset=utf-8", feedSettings.atomCacheTtlSeconds);

  const items = feedSettings.atomEnabled ? await getFeedItems(feedSettings) : [];

  const xml = buildAtomXml(items, {
    title: feedSettings.feedTitleOverride || seo.siteName,
    link: SITE_URL,
    description: feedSettings.feedDescription,
    selfUrl: `${SITE_URL}/atom.xml`,
  });

  return new Response(xml, { headers });
}
