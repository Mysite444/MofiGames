import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mapFeedCacheRow } from "@/lib/feed-cache-settings";
import { getFeedItems } from "@/lib/feed-content-server";

/** POST /api/admin/cache/feed/regenerate
 * Admin-only. RSS, JSON Feed, and Atom all serve the same live-queried
 * item list (see feed-content-server.ts) — there's no separate cache to
 * rebuild per format, so this runs one real query against posts (+ games,
 * if feedIncludeNewGames is on) using the currently-saved content
 * settings, and stamps all three formats' last-generated stats at once,
 * same "one real query, not a fake number" spirit as search cache's
 * rebuild-index. Returns a short preview so the admin can see what a
 * subscriber would actually get without leaving the page. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: settingsRow, error: settingsError } = await supabase
    .from("feed_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (settingsError) {
    return NextResponse.json({ error: "Failed to load feed cache settings." }, { status: 500 });
  }
  const settings = mapFeedCacheRow(settingsRow);

  const items = await getFeedItems(settings);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("feed_cache_settings")
    .update({
      rss_last_generated_at: now,
      rss_last_item_count: items.length,
      json_feed_last_generated_at: now,
      json_feed_last_item_count: items.length,
      atom_last_generated_at: now,
      atom_last_item_count: items.length,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      {
        result: { itemCount: items.length },
        preview: items.slice(0, 5).map((i) => ({ title: i.title, link: i.link, publishedAt: i.publishedAt })),
        settings: null,
        warning: "Regenerate ran but failed to record the result.",
      },
      { status: 207 }
    );
  }

  return NextResponse.json({
    result: { itemCount: items.length },
    preview: items.slice(0, 5).map((i) => ({ title: i.title, link: i.link, publishedAt: i.publishedAt })),
    settings: data,
  });
}
