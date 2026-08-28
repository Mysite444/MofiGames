import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** GET /api/admin/analytics/content-health — Admin → Analytics → Content
 * Health. Flags published games missing fields that hurt discoverability
 * or the play experience — thumbnail, cover image, description,
 * instructions, tags, and SEO meta description. Each list is capped at 20
 * so one badly-seeded catalog can't blow up the response. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const [gamesResult, gameTagsResult] = await Promise.all([
    supabase
      .from("games")
      .select(
        "id, slug, title, thumbnail_url, cover_image_url, description, instructions, meta_description, embed_url, play_type, storage_path, is_published"
      )
      .eq("is_published", true),
    supabase.from("game_tags").select("game_id"),
  ]);

  const games = gamesResult.data ?? [];
  const taggedGameIds = new Set((gameTagsResult.data ?? []).map((t) => t.game_id));

  const missing = (predicate: (g: (typeof games)[number]) => boolean) =>
    games
      .filter(predicate)
      .slice(0, 20)
      .map((g) => ({ id: g.id, slug: g.slug, title: g.title }));

  return NextResponse.json({
    totalPublishedGames: games.length,
    missingThumbnail: missing((g) => !g.thumbnail_url),
    missingCoverImage: missing((g) => !g.cover_image_url),
    missingDescription: missing((g) => !g.description || g.description.trim().length === 0),
    missingInstructions: missing((g) => !g.instructions || g.instructions.trim().length === 0),
    missingTags: missing((g) => !taggedGameIds.has(g.id)),
    missingSeoDescription: missing((g) => !g.meta_description || g.meta_description.trim().length === 0),
    brokenEmbedUrls: missing(
      (g) => g.play_type === "embed" && (!g.embed_url || g.embed_url.trim().length === 0)
    ),
  });
}
