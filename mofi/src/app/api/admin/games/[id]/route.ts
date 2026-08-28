import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { gameUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateGameFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";
import { deleteGameStorageFiles } from "@/lib/supabase/game-storage-cleanup";

const paramsSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/admin/games/:id — partial update of a game. Admin only. If
 * `tagIds` is included in the body, replaces the game's tag assignments to
 * match exactly (delete-then-insert — simplest way to keep the
 * `game_tags` many-to-many in sync from a single "here's the full list"
 * payload, same pattern as posts/post_tags). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid game id." }, { status: 400 });
  }

  const auth = await requireAdmin();
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

  const parsedBody = gameUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }

  const { tagIds, ...gameFields } = parsedBody.data;
  const gameId = parsedParams.data.id;

  if (Object.keys(gameFields).length === 0 && tagIds === undefined) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  // A game can't end up published with no thumbnail, whether this patch is
  // publishing it, clearing its thumbnail, or both. Only reads the current
  // row when the patch doesn't already carry both fields — the common case
  // (the admin form always submits the whole record) needs no extra query.
  if ("is_published" in gameFields || "thumbnail_url" in gameFields) {
    let resultingPublished = gameFields.is_published;
    let resultingThumbnail = gameFields.thumbnail_url;
    if (resultingPublished === undefined || resultingThumbnail === undefined) {
      const { data: current } = await supabase
        .from("games")
        .select("is_published, thumbnail_url")
        .eq("id", gameId)
        .maybeSingle();
      if (current) {
        if (resultingPublished === undefined) resultingPublished = current.is_published;
        if (resultingThumbnail === undefined) resultingThumbnail = current.thumbnail_url;
      }
    }
    if (resultingPublished === true && !resultingThumbnail) {
      return NextResponse.json(
        { error: "Add a thumbnail before publishing — or unpublish this game instead." },
        { status: 400 }
      );
    }
  }

  let game = null;
  if (Object.keys(gameFields).length > 0) {
    const { data, error } = await supabase
      .from("games")
      .update(gameFields)
      .eq("id", gameId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A game with that slug already exists." }, { status: 409 });
      }
      if (error.code === "23503") {
        return NextResponse.json({ error: "That category doesn't exist." }, { status: 400 });
      }
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Game not found." }, { status: 404 });
      }
      return apiError(error);
    }
    game = data;
    invalidateGameFragments();

    // A game only ever gets announced once — the first time it's publicly
    // visible. Covers both "published immediately" (POST /api/admin/games
    // handles that case) and "created as a draft, then published later
    // from here" without double-announcing on every subsequent edit of an
    // already-live game.
    if (gameFields.is_published) {
      const { data: existingNotification } = await supabase
        .from("notifications")
        .select("id")
        .eq("game_id", gameId)
        .eq("type", "new_game")
        .maybeSingle();

      if (!existingNotification) {
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
    }

    const action =
      gameFields.is_published === true
        ? "game_published"
        : gameFields.is_published === false
          ? "game_unpublished"
          : "game_updated";
    await logAdminAction(supabase, user, {
      action,
      targetType: "game",
      targetId: gameId,
      summary: `${action === "game_published" ? "Published" : action === "game_unpublished" ? "Unpublished" : "Updated"} game "${game.title}" (${game.slug}).`,
      metadata: { title: game.title, slug: game.slug, fields: Object.keys(gameFields) },
    });
  }

  if (tagIds !== undefined) {
    const { error: deleteError } = await supabase.from("game_tags").delete().eq("game_id", gameId);
    if (deleteError) {
      return apiError(deleteError);
    }
    if (tagIds.length > 0) {
      const { error: insertError } = await supabase
        .from("game_tags")
        .insert(tagIds.map((tag_id) => ({ game_id: gameId, tag_id })));
      if (insertError) {
        return apiError(insertError);
      }
    }
  }

  if (!game) {
    const { data, error } = await supabase.from("games").select().eq("id", gameId).single();
    if (error) {
      return apiError(error);
    }
    game = data;
  }

  let responseTagIds = tagIds;
  if (responseTagIds === undefined) {
    const { data: existingTags } = await supabase.from("game_tags").select("tag_id").eq("game_id", gameId);
    responseTagIds = (existingTags ?? []).map((t) => t.tag_id);
  }

  return NextResponse.json({ game: { ...game, tagIds: responseTagIds } });
}

/** DELETE /api/admin/games/:id — permanent delete. Admin only, and only
 * once a game is already in the Trash (deleted_at set) — a game is never
 * more than one PATCH/POST action away from a full, irreversible removal
 * plus Storage cleanup, so this route deliberately can't be reached in a
 * single click from the main list; POST .../trash is the reversible step
 * that has to happen first (Phase 7/13: "never permanently delete without
 * an intentional user action"). Tag links clean up via `on delete cascade`
 * on game_tags; Storage files (thumbnail, cover image, trailer, preview
 * video, loading screen, uploaded build) don't have a DB-level cascade —
 * Storage is a separate system from Postgres — so they're explicitly
 * removed below via deleteGameStorageFiles(). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid game id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  // Fetch every media reference *before* deleting the row — once the row
  // is gone these URLs/storage_path are gone with it, and they're the
  // only record of which Storage objects belong to this game. Also the
  // read that enforces "must already be trashed" below.
  const { data: existing } = await supabase
    .from("games")
    .select(
      "title, slug, deleted_at, thumbnail_url, cover_image_url, landscape_cover_url, square_cover_url, portrait_cover_url, video_trailer_url, preview_video_url, loading_screen_url, storage_path"
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }
  if (!existing.deleted_at) {
    return NextResponse.json(
      { error: "Move this game to Trash before deleting it permanently." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("games").delete().eq("id", parsedParams.data.id);
  if (error) {
    return apiError(error);
  }

  // Storage cleanup happens after the DB delete succeeds and is
  // best-effort: deleteGameStorageFiles() never throws, so a Storage
  // hiccup can't turn an otherwise-successful game delete into a failed
  // request. Any per-file errors are logged and recorded on the admin
  // action for follow-up rather than silently dropped.
  const cleanup = await deleteGameStorageFiles(supabase, existing);
  if (cleanup.errors.length > 0) {
    console.error(`[games:delete] storage cleanup for "${existing.slug}" had errors:`, cleanup.errors);
  }

  await logAdminAction(supabase, user, {
    action: "game_permanently_deleted",
    targetType: "game",
    targetId: parsedParams.data.id,
    summary: `Permanently deleted game "${existing.title}" (${existing.slug}).`,
    metadata: { title: existing.title, slug: existing.slug, filesRemoved: cleanup.removed, storageErrors: cleanup.errors },
  });

  invalidateGameFragments();
  return NextResponse.json({
    ok: true,
    filesRemoved: cleanup.removed,
    ...(cleanup.errors.length > 0
      ? { warning: "Game deleted, but some media files could not be removed from storage." }
      : {}),
  });
}
