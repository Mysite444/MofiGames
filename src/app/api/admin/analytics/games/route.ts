import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

const DAY_MS = 24 * 60 * 60 * 1000;

/** GET /api/admin/analytics/games — Admin → Analytics → Games & Categories.
 * Most/least played, trending (by plays in the last 7 days), recently
 * added, featured, favorites, ratings/reviews, and a per-category
 * breakdown. All derived from `games`/`categories`/`game_plays`/
 * `game_ratings` — no separate aggregate tables needed. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const since7d = new Date(Date.now() - 7 * DAY_MS).toISOString();

  const [gamesResult, categoriesResult, trendingPlaysResult, ratingsCountResult] = await Promise.all([
    supabase
      .from("games")
      .select(
        "id, slug, title, category_slug, plays, rating, rating_count, favorite_count, is_featured, is_published, created_at"
      ),
    supabase.from("categories").select("slug, name"),
    supabase.from("game_plays").select("game_id").gte("created_at", since7d).limit(50000),
    supabase.from("game_ratings").select("game_id", { count: "exact", head: true }),
  ]);

  const games = gamesResult.data ?? [];
  const categories = categoriesResult.data ?? [];

  const trendingCounts = new Map<string, number>();
  for (const row of trendingPlaysResult.data ?? []) {
    trendingCounts.set(row.game_id, (trendingCounts.get(row.game_id) ?? 0) + 1);
  }

  const mostPlayed = [...games].sort((a, b) => b.plays - a.plays).slice(0, 10);
  const leastPlayed = [...games]
    .filter((g) => g.is_published)
    .sort((a, b) => a.plays - b.plays)
    .slice(0, 10);
  const trending = [...games]
    .map((g) => ({ ...g, plays_7d: trendingCounts.get(g.id) ?? 0 }))
    .sort((a, b) => b.plays_7d - a.plays_7d)
    .slice(0, 10);
  const recentlyAdded = [...games]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 10);
  const featured = games.filter((g) => g.is_featured).slice(0, 20);
  const totalFavorites = games.reduce((sum, g) => sum + (g.favorite_count ?? 0), 0);
  const avgRating =
    games.length > 0 ? games.reduce((sum, g) => sum + Number(g.rating ?? 0), 0) / games.length : 0;

  const categoryStats = categories.map((c) => {
    const inCategory = games.filter((g) => g.category_slug === c.slug);
    return {
      slug: c.slug,
      name: c.name,
      gameCount: inCategory.length,
      totalPlays: inCategory.reduce((sum, g) => sum + (g.plays ?? 0), 0),
    };
  });
  const topCategories = [...categoryStats].sort((a, b) => b.totalPlays - a.totalPlays).slice(0, 10);

  return NextResponse.json({
    summary: {
      totalGames: games.length,
      totalFavorites,
      averageRating: Math.round(avgRating * 10) / 10,
      totalReviews: ratingsCountResult.count ?? 0,
    },
    mostPlayed,
    leastPlayed,
    trending,
    recentlyAdded,
    featured,
    categoryStats: topCategories,
  });
}
