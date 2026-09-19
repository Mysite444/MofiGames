import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { postsBulkActionSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";
import { del as blobDel } from "@vercel/blob";

const READABLE_ACTION: Record<string, string> = {
  publish: "Published",
  draft: "Moved to Draft",
  trash: "Moved to Trash",
  restore: "Restored",
  delete_permanent: "Permanently deleted",
  add_tags: "Added tags to",
  remove_tags: "Removed tags from",
};

/** POST /api/admin/posts/bulk — bulk actions for the Posts CMS.
 * One request, one round trip, one audit log entry.
 * `delete_permanent` is only allowed against trashed posts — re-checked
 * server-side regardless of what the client sends. */
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

  const parsed = postsBulkActionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { action, ids, tagIds } = parsed.data;

  let affected = 0;
  let skipped = 0;
  let skippedReason: string | undefined;
  let filesRemoved: number | undefined;
  let warning: string | undefined;

  switch (action) {
    case "publish": {
      const { error, count } = await supabase
        .from("posts")
        .update({ is_published: true, scheduled_publish_at: null }, { count: "exact" })
        .in("id", ids)
        .is("deleted_at", null);
      if (error) return apiError(error, "Bulk publish failed.");
      affected = count ?? 0;
      break;
    }
    case "draft": {
      const { error, count } = await supabase
        .from("posts")
        .update({ is_published: false, scheduled_publish_at: null }, { count: "exact" })
        .in("id", ids)
        .is("deleted_at", null);
      if (error) return apiError(error, "Bulk move to Draft failed.");
      affected = count ?? 0;
      break;
    }
    case "trash": {
      const { error, count } = await supabase
        .from("posts")
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
        .from("posts")
        .update({ deleted_at: null, deleted_by: null }, { count: "exact" })
        .in("id", ids)
        .not("deleted_at", "is", null);
      if (error) return apiError(error, "Bulk restore failed.");
      affected = count ?? 0;
      break;
    }
    case "delete_permanent": {
      // Only rows already in the Trash can be permanently deleted —
      // re-checked server-side, not trusted from the client.
      const { data: rows, error } = await supabase
        .from("posts")
        .select("id, title, slug, cover_image_url, og_image_url, twitter_image_url, deleted_at")
        .in("id", ids);
      if (error) return apiError(error, "Failed to load selected posts.");
      const eligible = (rows ?? []).filter((r) => r.deleted_at);
      skipped = ids.length - eligible.length;
      if (skipped > 0) skippedReason = "not in Trash — move to Trash first";
      if (eligible.length > 0) {
        const { error: deleteError, count } = await supabase
          .from("posts")
          .delete({ count: "exact" })
          .in("id", eligible.map((r) => r.id));
        if (deleteError) return apiError(deleteError, "Bulk permanent delete failed.");
        affected = count ?? eligible.length;

        // Best-effort Blob cleanup for cover/OG/Twitter images.
        const blobUrls = eligible
          .flatMap((r) => [r.cover_image_url, r.og_image_url, r.twitter_image_url])
          .filter((u): u is string => typeof u === "string" && u.includes("blob.vercel-storage.com"));
        if (blobUrls.length > 0) {
          try {
            await blobDel(blobUrls);
            filesRemoved = blobUrls.length;
          } catch (err) {
            console.error("[posts:bulk:delete_permanent] blob cleanup error:", err);
            warning = "Posts deleted, but some media files could not be removed from storage.";
          }
        }
      }
      break;
    }
    case "add_tags": {
      const rows = ids.flatMap((post_id) => (tagIds ?? []).map((tag_id) => ({ post_id, tag_id })));
      const { error } = await supabase
        .from("post_tags")
        .upsert(rows, { onConflict: "post_id,tag_id", ignoreDuplicates: true });
      if (error) return apiError(error, "Bulk tag assignment failed.");
      affected = ids.length;
      break;
    }
    case "remove_tags": {
      const { error } = await supabase
        .from("post_tags")
        .delete()
        .in("post_id", ids)
        .in("tag_id", tagIds ?? []);
      if (error) return apiError(error, "Bulk tag removal failed.");
      affected = ids.length;
      break;
    }
    default: {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  }

  await logAdminAction(supabase, user, {
    action: `posts_bulk_${action}`,
    targetType: "post",
    summary: `${READABLE_ACTION[action] ?? action} ${affected} post${affected === 1 ? "" : "s"}${skipped > 0 ? ` (${skipped} skipped: ${skippedReason})` : ""}.`,
    metadata: { action, ids, affected, skipped, skippedReason, filesRemoved },
  });

  return NextResponse.json({ ok: true, affected, skipped, skippedReason, filesRemoved, warning });
}
