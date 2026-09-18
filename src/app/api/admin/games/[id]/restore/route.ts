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

/** POST /api/admin/games/:id/restore — undoes Move to Trash. Restores the
 * game to whatever is_published/visibility it had before it was trashed
 * (neither is touched by trash/restore, only deleted_at/deleted_by), so a
 * game that was published when trashed comes back published; a draft
 * comes back a draft. scheduled_publish_at was cleared at trash time and
 * stays cleared — the admin sets a fresh schedule if they want one. */
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
  if (!existing.deleted_at) {
    return NextResponse.json({ error: "This game isn't in the Trash." }, { status: 409 });
  }

  const { data: game, error } = await supabase
    .from("games")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", parsedParams.data.id)
    .select()
    .single();
  if (error) {
    return apiError(error, "Failed to restore game.");
  }

  await logAdminAction(supabase, user, {
    action: "game_restored",
    targetType: "game",
    targetId: game.id,
    summary: `Restored game "${game.title}" (${game.slug}) from Trash.`,
    metadata: { title: game.title, slug: game.slug },
  });

  invalidateGameFragments();
  // Restored game is publicly accessible again — regenerate its slug page
  // so visitors immediately see it rather than a stale 404.
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
