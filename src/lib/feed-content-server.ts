import { createClient } from "./supabase/server";
import { getPublishedPosts } from "./content-server";
import { SITE_URL } from "./seo";
import type { FeedItem } from "./feed-helpers";
import type { FeedCacheSettings } from "./feed-cache-settings";

/** Server-only. Builds the one item list RSS, JSON Feed, and Atom all
 * serve — see migration 0047_feed_cache.sql for why the three formats
 * share a single content config. Blog posts are the natural "feed"
 * content; newly published games are opt-in (feedIncludeNewGames) since
 * not every install wants every new game blasted to subscribers. Also
 * used by POST /api/admin/cache/feed/regenerate to compute a real item
 * count rather than faking one — same spirit as search-cache's
 * rebuild-index querying public.games for real. */
export async function getFeedItems(
  settings: Pick<FeedCacheSettings, "feedIncludeBlogPosts" | "feedIncludeNewGames" | "feedMaxItems">
): Promise<FeedItem[]> {
  const items: FeedItem[] = [];

  if (settings.feedIncludeBlogPosts) {
    const posts = await getPublishedPosts(settings.feedMaxItems);
    for (const post of posts) {
      // Same noindex contradiction the sitemap routes guard against — a
      // post marked noindex has no business being syndicated either.
      if (post.seoIndex === false) continue;
      items.push({
        id: `${SITE_URL}/blog/${post.slug}`,
        title: post.title,
        link: `${SITE_URL}/blog/${post.slug}`,
        summary: post.excerpt || post.seoDescription || "",
        contentHtml: post.content || undefined,
        imageUrl: post.coverImageUrl,
        author: post.authorName,
        publishedAt: post.publishedAt,
      });
    }
  }

  if (settings.feedIncludeNewGames) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("games")
      .select("slug, title, description, thumbnail_url, cover_image_url, created_at")
      .eq("is_published", true)
      .eq("visibility", "public")
      .eq("seo_index", true)
      .order("created_at", { ascending: false })
      .limit(settings.feedMaxItems);

    for (const game of data ?? []) {
      items.push({
        id: `${SITE_URL}/game/${game.slug}`,
        title: game.title,
        link: `${SITE_URL}/game/${game.slug}`,
        summary: game.description || `Play ${game.title} free online.`,
        imageUrl: game.cover_image_url || game.thumbnail_url || null,
        publishedAt: game.created_at,
      });
    }
  }

  items.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return items.slice(0, settings.feedMaxItems);
}
