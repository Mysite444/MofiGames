import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { listReviewsAdminQuerySchema, firstIssueMessage } from "@/lib/validation";

const PAGE_SIZE = 50;

export interface AdminReviewDto {
  id: string;
  gameSlug: string;
  gameTitle: string;
  authorId: string;
  authorName: string;
  rating: number;
  reviewText: string;
  createdAt: string;
  updatedAt: string;
}

/** GET /api/admin/reviews?page=1&gameSlug=&q=&minRating=&maxRating=
 * Every public review across every game, newest-first, for moderation.
 * Admin-only. Supports optional game-slug filter, free-text search over
 * the review body and author name, and star-rating range filter. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listReviewsAdminQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    gameSlug: request.nextUrl.searchParams.get("gameSlug") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    minRating: request.nextUrl.searchParams.get("minRating") ?? undefined,
    maxRating: request.nextUrl.searchParams.get("maxRating") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, gameSlug, q, minRating, maxRating } = parsed.data;

  // Join to games to get slug + title in a single query.
  let query = supabase
    .from("game_reviews")
    .select(
      "id, user_id, author_name, rating, review_text, created_at, updated_at, games!inner(slug, title)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (gameSlug) query = query.eq("games.slug", gameSlug);
  if (minRating !== undefined) query = query.gte("rating", minRating);
  if (maxRating !== undefined) query = query.lte("rating", maxRating);
  if (q) {
    // Strip , and % so the user input can't break out of the ILIKE filter
    // string — same guard used in the comments admin route.
    const safeQ = q.replace(/[,%]/g, "").trim();
    if (safeQ) query = query.or(`review_text.ilike.%${safeQ}%,author_name.ilike.%${safeQ}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load reviews." }, { status: 500 });
  }

  const reviews: AdminReviewDto[] = (data ?? []).map((row) => {
    // Supabase returns the joined game as an object (or array of one) depending
    // on whether !inner is used — normalise to a single object safely.
    const game = Array.isArray(row.games) ? row.games[0] : row.games;
    return {
      id: row.id,
      gameSlug: (game as { slug: string; title: string } | null)?.slug ?? "",
      gameTitle: (game as { slug: string; title: string } | null)?.title ?? "",
      authorId: row.user_id,
      authorName: row.author_name,
      rating: row.rating,
      reviewText: row.review_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  return NextResponse.json({ reviews, total: count ?? 0, page, pageSize: PAGE_SIZE });
}
