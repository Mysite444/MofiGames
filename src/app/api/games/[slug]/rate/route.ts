import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route-auth";
import { playParamsSchema, rateGameSchema } from "@/lib/validation";

/** POST /api/games/:slug/rate — upserts the signed-in user's 1-5 star
 * rating for a game. Requires a session (guest/anonymous sessions count —
 * same bar as favoriting or commenting). `games.rating`/`rating_count`
 * are recomputed automatically by a database trigger (migration 0008),
 * not by this route, so concurrent ratings from different users can never
 * race each other into an inconsistent average. */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
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

  const parsedBody = rateGameSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Pick 1-5 stars." }, { status: 400 });
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, rating, rating_count")
    .eq("slug", parsedParams.data.slug)
    .maybeSingle();
  if (gameError || !game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("game_ratings")
    .upsert(
      { user_id: user.id, game_id: game.id, rating: parsedBody.data.rating },
      { onConflict: "user_id,game_id" }
    );
  if (error) {
    return NextResponse.json({ error: "Failed to save rating." }, { status: 500 });
  }

  const { data: updated } = await supabase
    .from("games")
    .select("rating, rating_count")
    .eq("id", game.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    rating: updated?.rating ?? game.rating,
    ratingCount: updated?.rating_count ?? game.rating_count,
  });
}

/** GET /api/games/:slug/rate — the signed-in user's own existing rating
 * for this game (or null), so the UI can pre-select their stars. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const parsedParams = playParamsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid game slug." }, { status: 400 });
  }

  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ myRating: null });
  }
  const { supabase, user } = auth.ctx;

  const { data: game } = await supabase
    .from("games")
    .select("id")
    .eq("slug", parsedParams.data.slug)
    .maybeSingle();
  if (!game) {
    return NextResponse.json({ myRating: null });
  }

  const { data } = await supabase
    .from("game_ratings")
    .select("rating")
    .eq("game_id", game.id)
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ myRating: data?.rating ?? null });
}
