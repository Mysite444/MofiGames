import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { feedCacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation-feed-cache";

/** GET /api/admin/cache/feed/settings — Admin → Cache → Feed Cache.
 * Admin-only, same as every other /api/admin/cache/** settings route —
 * feed_cache_settings itself is publicly readable in the database (the
 * public /feed.xml, /feed.json, /atom.xml, /sitemaps/*.xml routes need
 * it on every anonymous request, see migration 0047_feed_cache.sql), but
 * this admin-panel path stays gated regardless. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("feed_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load feed cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/admin/cache/feed/settings — Admin → Cache → Feed Cache. Admin-only. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = feedCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };

  if (input.feedIncludeBlogPosts !== undefined) patch.feed_include_blog_posts = input.feedIncludeBlogPosts;
  if (input.feedIncludeNewGames !== undefined) patch.feed_include_new_games = input.feedIncludeNewGames;
  if (input.feedMaxItems !== undefined) patch.feed_max_items = input.feedMaxItems;
  if (input.feedTitleOverride !== undefined) patch.feed_title_override = input.feedTitleOverride || null;
  if (input.feedDescription !== undefined) patch.feed_description = input.feedDescription;

  if (input.rssEnabled !== undefined) patch.rss_enabled = input.rssEnabled;
  if (input.rssCacheTtlSeconds !== undefined) patch.rss_cache_ttl_seconds = input.rssCacheTtlSeconds;

  if (input.sitemapCacheTtlSeconds !== undefined) patch.sitemap_cache_ttl_seconds = input.sitemapCacheTtlSeconds;
  if (input.sitemapStaleWhileRevalidateSeconds !== undefined)
    patch.sitemap_stale_while_revalidate_seconds = input.sitemapStaleWhileRevalidateSeconds;

  if (input.jsonFeedEnabled !== undefined) patch.json_feed_enabled = input.jsonFeedEnabled;
  if (input.jsonFeedCacheTtlSeconds !== undefined) patch.json_feed_cache_ttl_seconds = input.jsonFeedCacheTtlSeconds;

  if (input.atomEnabled !== undefined) patch.atom_enabled = input.atomEnabled;
  if (input.atomCacheTtlSeconds !== undefined) patch.atom_cache_ttl_seconds = input.atomCacheTtlSeconds;

  const { data, error } = await supabase
    .from("feed_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update feed cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
