import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-config";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { invalidateGameFragments } from "@/lib/fragment-cache-invalidation";
import { purgeMetadataCacheKey } from "@/lib/metadata-cache";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const paramsSchema = z.object({ id: z.string().uuid() });

/** POST /api/admin/games/:id/trash — reversible "Move to Trash" (Phase 7).
 * Sets deleted_at/deleted_by; the row and its media stay exactly as they
 * are (nothing in Storage is touched — that only happens on permanent
 * delete). RLS (migration 0069) hides a trashed game from every public
 * read regardless of is_published, so this is enough on its own to pull a
 * game off the live site without losing anything. Also clears
 * scheduled_publish_at so a trashed-while-scheduled game can't come back
 * from the scheduler cron while sitting in the Trash — restoring it
 * doesn't restore a stale schedule; the admin can set a new one. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid game id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: existing } = await supabase
    .from("games")
    .select("id, title, slug, deleted_at")
    .eq("id", parsedParams.data.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  if (existing.deleted_at) {
    return NextResponse.json({ error: "This game is already in the Trash." }, { status: 409 });
  }

  const { data: game, error } = await supabase
    .from("games")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user.id, scheduled_publish_at: null })
    .eq("id", parsedParams.data.id)
    .select()
    .single();
  if (error) {
    return apiError(error, "Failed to move game to Trash.");
  }

  await logAdminAction(supabase, user, {
    action: "game_trashed",
    targetType: "game",
    targetId: game.id,
    summary: `Moved game "${game.title}" (${game.slug}) to Trash.`,
    metadata: { title: game.title, slug: game.slug },
  });

  invalidateGameFragments();
  // Trashed game is no longer publicly accessible — bust the slug page
  // so it 404s immediately instead of serving stale content for 300s.
  revalidatePath(`/${game.slug}`);
  revalidatePath("/");
  revalidatePath("/popular-games");
  revalidatePath("/latest-games");
  revalidatePath("/updated-games");
  revalidatePath("/leaderboard");
  revalidateTag(CACHE_TAGS.GAMES, "default");
  revalidateTag(CACHE_TAGS.gameSlug(game.slug), "default");
  // Bust the in-process metadata cache so the next render reads fresh DB data.
  purgeMetadataCacheKey("games", game.slug);
  return NextResponse.json({ ok: true, game });
}
