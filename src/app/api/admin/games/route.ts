import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { gameInputSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateGameFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

/** POST /api/admin/games — create a game. Requires an admin session (RLS
 * on `games` backs this up regardless, but this route also validates the
 * shape/ranges of the payload server-side before it ever reaches the
 * database, and turns constraint violations into readable messages). */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = gameInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { tagIds, ...gameFields } = parsed.data;

  const { data: game, error } = await supabase.from("games").insert(gameFields).select().single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A game with that slug already exists." }, { status: 409 });
    }
    if (error.code === "23503") {
      return NextResponse.json({ error: "That category doesn't exist." }, { status: 400 });
    }
    return apiError(error);
  }

  if (tagIds.length > 0) {
    const { error: tagError } = await supabase
      .from("game_tags")
      .insert(tagIds.map((tag_id) => ({ game_id: game.id, tag_id })));
    if (tagError) {
      return apiError(tagError);
    }
  }

  // Announce it in the notification feed (bell icon in the header) — same
  // treatment whether it's an uploaded ("real") game or an embed_url
  // ("embed") one; the only thing that gates this is being publicly
  // visible. A draft (is_published = false) doesn't announce until it's
  // actually published, to avoid tipping people off to something that
  // 404s. Best-effort: a failure here shouldn't fail game creation itself.
  if (game.is_published) {
    const { error: notifyError } = await supabase.from("notifications").insert({
      type: "new_game",
      title: `New game: ${game.title}`,
      message: `${game.title} just landed on MofiGames — come play it.`,
      link: `/${game.slug}`,
      thumbnail_url: game.thumbnail_url ?? null,
      game_id: game.id,
    });
    if (notifyError) {
      console.error("Failed to write new-game notification:", notifyError.message);
    }
  }

  invalidateGameFragments();
  return NextResponse.json({ game: { ...game, tagIds } }, { status: 201 });
}
