import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/route-auth";
import { createReviewSchema, playParamsSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { checkReviewRateLimit } from "@/lib/supabase/review-rate-limit";

export interface ReviewDto {
  id: string;
  gameSlug: string;
  authorId: string;
  authorName: string;
  authorIsAdmin: boolean;
  rating: number;
  reviewText: string;
  createdAt: string;
  updatedAt: string;
}

interface ReviewRow {
  id: string;
  user_id: string;
  author_name: string;
  rating: number;
  review_text: string;
  created_at: string;
  updated_at: string;
}

/** GET /api/games/:slug/reviews — every public review for a game, newest
 * first. Public: no auth required. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const parsedParams = playParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid game slug." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id")
    .eq("slug", parsedParams.data.slug)
    .maybeSingle();
  if (gameError || !game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from("game_reviews")
    .select("id, user_id, author_name, rating, review_text, created_at, updated_at")
    .eq("game_id", game.id)
    .order("created_at", { ascending: false });

  if (error) {
    return apiError(error, "Failed to load reviews.");
  }

  const reviews = (rows ?? []) as ReviewRow[];
  const authorIds = [...new Set(reviews.map((r) => r.user_id))];

  let adminIds = new Set<string>();
  if (authorIds.length > 0) {
    const { data: adminProfiles, error: adminError } = await supabase
      .from("profiles")
      .select("id, is_admin")
      .in("id", authorIds);
    if (adminError) {
      return apiError(adminError, "Failed to load review authors.");
    }
    adminIds = new Set((adminProfiles ?? []).filter((p) => p.is_admin).map((p) => p.id));
  }

  const dtos: ReviewDto[] = reviews.map((r) => ({
    id: r.id,
    gameSlug: parsedParams.data.slug,
    authorId: r.user_id,
    authorName: r.author_name,
    authorIsAdmin: adminIds.has(r.user_id),
    rating: r.rating,
    reviewText: r.review_text,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return NextResponse.json({ reviews: dtos });
}

/** POST /api/games/:slug/reviews — create or update the signed-in user's
 * own review for this game (one review per user per game — the DB's
 * unique(user_id, game_id) makes this an upsert). The author name is
 * taken from the caller's own profile, never trusted from the request
 * body, same as comments. Rating + text are validated and sanitized
 * server-side (src/lib/validation.ts's createReviewSchema,
 * src/lib/sanitize-text.ts) before being written. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const parsedParams = playParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid game slug." }, { status: 400 });
  }

  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createReviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { rating, reviewText } = parsed.data;

  // Rate-limit check before touching the DB for the game lookup — short-
  // circuit here so a flooding script never exercises the upsert path.
  const rateLimit = await checkReviewRateLimit(supabase, user.id);
  if (rateLimit.limited) {
    const headers: Record<string, string> = {};
    if (rateLimit.retryAfterSeconds) {
      headers["Retry-After"] = String(rateLimit.retryAfterSeconds);
    }
    return NextResponse.json({ error: rateLimit.message ?? "Too many requests." }, { status: 429, headers });
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id")
    .eq("slug", parsedParams.data.slug)
    .maybeSingle();
  if (gameError || !game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const authorName =
    profile?.name || (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null) || "Player";
  const authorIsAdmin = Boolean(profile?.is_admin);

  const { data: upserted, error: upsertError } = await supabase
    .from("game_reviews")
    .upsert(
      {
        game_id: game.id,
        user_id: user.id,
        author_name: authorName,
        rating,
        review_text: reviewText,
      },
      { onConflict: "user_id,game_id" }
    )
    .select("id, user_id, author_name, rating, review_text, created_at, updated_at")
    .single();

  if (upsertError || !upserted) {
    return apiError(upsertError, "Failed to save review.");
  }

  const row = upserted as ReviewRow;
  const dto: ReviewDto = {
    id: row.id,
    gameSlug: parsedParams.data.slug,
    authorId: row.user_id,
    authorName: row.author_name,
    authorIsAdmin,
    rating: row.rating,
    reviewText: row.review_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return NextResponse.json({ review: dto }, { status: 201 });
}

/** DELETE /api/games/:slug/reviews — deletes the signed-in user's own
 * review for this game, if any. RLS (migration 0059) enforces the
 * "own review only" rule too; this just gives a clean response either
 * way (it's a no-op, not an error, if the caller never reviewed it). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const parsedParams = playParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid game slug." }, { status: 400 });
  }

  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id")
    .eq("slug", parsedParams.data.slug)
    .maybeSingle();
  if (gameError || !game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const { error } = await supabase.from("game_reviews").delete().eq("game_id", game.id).eq("user_id", user.id);
  if (error) {
    return apiError(error, "Failed to delete review.");
  }

  return NextResponse.json({ ok: true });
}
