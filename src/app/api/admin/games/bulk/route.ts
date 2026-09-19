import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { gamesBulkActionSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateGameFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";
import { deleteGameStorageFiles } from "@/lib/supabase/game-storage-cleanup";

const READABLE_ACTION: Record<string, string> = {
  publish: "Published",
  draft: "Moved to Draft",
  unpublish: "Unpublished",
  trash: "Moved to Trash",
  restore: "Restored",
  delete_permanent: "Permanently deleted",
  assign_category: "Reassigned category for",
  add_tags: "Added tags to",
  remove_tags: "Removed tags from",
  set_featured: "Set Featured on",
  remove_featured: "Removed Featured from",
  set_trending: "Set Trending on",
  remove_trending: "Removed Trending from",
};

/** POST /api/admin/games/bulk — every bulk action in the Games CMS
 * upgrade (Phase 1 bulk toolbar). One request, one round trip, one audit
 * log entry — not N calls to the single-game PATCH route, which is both
 * slow at scale (Phase 15) and would write N separate log entries for
 * what the admin experienced as one action.
 *
 * `delete_permanent` is the one action here that also has to be reachable
 * as an intentional bulk action (Phase 1 explicitly lists "Bulk delete"
 * *and* "Bulk move to Trash" as separate items) even though the
 * single-game DELETE route requires a game to already be trashed first —
 * bulk permanent-delete only ever runs against ids that are already in
 * the Trash (the UI only ever offers it from the Trash view), and this
 * route re-checks that server-side below rather than trusting the client. */
export async function POST(request: Request) {
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

  const parsed = gamesBulkActionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { action, ids, categorySlug, tagIds } = parsed.data;

  let affected = 0;
  let skipped = 0;
  let skippedReason: string | undefined;
  let filesRemoved: number | undefined;
  let warning: string | undefined;

  switch (action) {
    case "publish": {
      // A game with no thumbnail can't be bulk-published (same rule as
      // the single-game PATCH route) — rather than fail the whole batch,
      // publish the ones that qualify and report how many were skipped
      // and why, so this never "silently" half-does the job (Phase 14).
      const { data: rows, error } = await supabase
        .from("games")
        .select("id, thumbnail_url")
        .in("id", ids)
        .is("deleted_at", null);
      if (error) return apiError(error, "Failed to load selected games.");
      const publishable = (rows ?? []).filter((r) => r.thumbnail_url).map((r) => r.id);
      skipped = ids.length - publishable.length;
      if (skipped > 0) skippedReason = "missing a thumbnail";
      if (publishable.length > 0) {
        const { error: updateError, count } = await supabase
          .from("games")
          .update({ is_published: true }, { count: "exact" })
          .in("id", publishable);
        if (updateError) return apiError(updateError, "Bulk publish failed.");
        affected = count ?? publishable.length;
      }
      break;
    }
    case "draft":
    case "unpublish": {
      const { error, count } = await supabase
        .from("games")
        .update({ is_published: false }, { count: "exact" })
        .in("id", ids)
        .is("deleted_at", null);
      if (error) return apiError(error, "Bulk unpublish failed.");
      affected = count ?? 0;
      break;
    }
    case "trash": {
      const { error, count } = await supabase
        .from("games")
        .update(
          { deleted_at: new Date().toISOString(), deleted_by: user.id, scheduled_publish_at: null },
          { count: "exact" }
        )
        .in("id", ids)
        .is("deleted_at", null);
      if (error) return apiError(error, "Bulk move to Trash failed.");
      affected = count ?? 0;
      break;
    }
    case "restore": {
      const { error, count } = await supabase
        .from("games")
        .update({ deleted_at: null, deleted_by: null }, { count: "exact" })
        .in("id", ids)
        .not("deleted_at", "is", null);
      if (error) return apiError(error, "Bulk restore failed.");
      affected = count ?? 0;
      break;
    }
    case "delete_permanent": {
      // Only ever allowed on rows already in the Trash — same guardrail as
      // the single-game DELETE route, re-checked here rather than trusted
      // from the client.
      const { data: rows, error } = await supabase
        .from("games")
        .select(
          "id, title, slug, thumbnail_url, cover_image_url, landscape_cover_url, square_cover_url, portrait_cover_url, video_trailer_url, preview_video_url, loading_screen_url, storage_path, deleted_at"
        )
        .in("id", ids);
      if (error) return apiError(error, "Failed to load selected games.");
      const eligible = (rows ?? []).filter((r) => r.deleted_at);
      skipped = ids.length - eligible.length;
      if (skipped > 0) skippedReason = "not in Trash — move to Trash first";
      if (eligible.length > 0) {
        const { error: deleteError, count } = await supabase
          .from("games")
          .delete({ count: "exact" })
          .in(
            "id",
            eligible.map((r) => r.id)
          );
        if (deleteError) return apiError(deleteError, "Bulk permanent delete failed.");
        affected = count ?? eligible.length;

        let removed = 0;
        const storageErrors: string[] = [];
        for (const row of eligible) {
          const cleanup = await deleteGameStorageFiles(supabase, row);
          removed += cleanup.removed;
          storageErrors.push(...cleanup.errors);
        }
        filesRemoved = removed;
        if (storageErrors.length > 0) {
          console.error("[games:bulk:delete_permanent] storage cleanup errors:", storageErrors);
          warning = "Games deleted, but some media files could not be removed from storage.";
        }
      }
      break;
    }
    case "assign_category": {
      const { error, count } = await supabase
        .from("games")
        .update({ category_slug: categorySlug }, { count: "exact" })
        .in("id", ids);
      if (error) {
        if (error.code === "23503") {
          return NextResponse.json({ error: "That category doesn't exist." }, { status: 400 });
        }
        return apiError(error, "Bulk category assignment failed.");
      }
      affected = count ?? 0;
      break;
    }
    case "add_tags": {
      // Insert one row per (game, tag) pair, skipping ones that already
      // exist — game_tags has a unique (game_id, tag_id) constraint, so
      // upsert with ignoreDuplicates is the idempotent way to do this
      // without a per-pair existence check first.
      const rows = ids.flatMap((game_id) => (tagIds ?? []).map((tag_id) => ({ game_id, tag_id })));
      const { error } = await supabase
        .from("game_tags")
        .upsert(rows, { onConflict: "game_id,tag_id", ignoreDuplicates: true });
      if (error) return apiError(error, "Bulk tag assignment failed.");
      affected = ids.length;
      break;
    }
    case "remove_tags": {
      const { error } = await supabase.from("game_tags").delete().in("game_id", ids).in("tag_id", tagIds ?? []);
      if (error) return apiError(error, "Bulk tag removal failed.");
      affected = ids.length;
      break;
    }
    case "set_featured":
    case "remove_featured": {
      const { error, count } = await supabase
        .from("games")
        .update({ is_featured: action === "set_featured" }, { count: "exact" })
        .in("id", ids);
      if (error) return apiError(error, "Bulk Featured update failed.");
      affected = count ?? 0;
      break;
    }
    case "set_trending":
    case "remove_trending": {
      const { error, count } = await supabase
        .from("games")
        .update({ is_trending: action === "set_trending" }, { count: "exact" })
        .in("id", ids);
      if (error) return apiError(error, "Bulk Trending update failed.");
      affected = count ?? 0;
      break;
    }
  }

  await logAdminAction(supabase, user, {
    action: `games_bulk_${action}`,
    targetType: "game",
    summary: `${READABLE_ACTION[action] ?? action} ${affected} game${affected === 1 ? "" : "s"}.`,
    metadata: { action, requestedIds: ids.length, affected, skipped, categorySlug, tagIds },
  });

  invalidateGameFragments();
  return NextResponse.json({
    ok: true,
    affected,
    ...(skipped > 0 ? { skipped, skippedReason } : {}),
    ...(filesRemoved !== undefined ? { filesRemoved } : {}),
    ...(warning ? { warning } : {}),
  });
}
