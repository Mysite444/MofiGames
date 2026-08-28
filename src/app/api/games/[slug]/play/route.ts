import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { playParamsSchema } from "@/lib/validation";

/** POST /api/games/:slug/play — bumps a real (database-backed) game's play
 * counter by exactly one. No auth required (playing a game doesn't need an
 * account), and it's rate-limited to "one at a time" implicitly by only
 * ever adding 1 per call — there's no request body to manipulate. Calls a
 * SECURITY DEFINER Postgres function (see migration 0004) that can *only*
 * increment `plays` on an already-published game, nothing else, since the
 * `games` table otherwise has no non-admin write policy at all.
 *
 * A no-op (200, unchanged) for placeholder/demo game slugs that don't
 * exist in the database — those don't track real play counts. */
export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const parsed = playParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid game slug." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("increment_game_plays", {
    game_slug: parsed.data.slug,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to record play." }, { status: 500 });
  }

  // `data` is null when the slug doesn't match any published real game
  // (e.g. it's one of the placeholder/demo games) — not an error, just
  // nothing to increment.
  return NextResponse.json({ ok: true, plays: data ?? null });
}
