import { createPublicClient } from "./supabase/public-client";
import { DEFAULT_FEED_CACHE_SETTINGS, mapFeedCacheRow, type FeedCacheSettings } from "./feed-cache-settings";

/** Server-side reader for feed_cache_settings — used by route handlers
 * that have no admin session at all (GET /feed.xml, /feed.json,
 * /atom.xml, /sitemaps/*.xml, /sitemap.xml), exactly the same role
 * getCacheSettingsServer() plays for cache_settings. Fails soft to the
 * defaults so a missing row (migration 0047 not yet run) never breaks a
 * public feed/sitemap request — it just serves with default TTLs.
 *
 * Uses the public (cookie-free) client: feed_cache_settings is admin-
 * configured read-only config, publicly readable via RLS, and these
 * routes are hit with no user session anyway. */
export async function getFeedCacheSettingsServer(): Promise<FeedCacheSettings> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase.from("feed_cache_settings").select("*").eq("id", true).maybeSingle();
    return mapFeedCacheRow(data ?? null);
  } catch {
    return DEFAULT_FEED_CACHE_SETTINGS;
  }
}
