import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { tagsBulkDeleteSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

/** POST /api/admin/tags/bulk — bulk delete tags. Admin only.
 * Deletes the tag rows; game_tags and post_tags rows cascade automatically
 * (both have `on delete cascade` from migration 0007). */
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

  const parsed = tagsBulkDeleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { ids } = parsed.data;

  const { error, count } = await supabase
    .from("tags")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) return apiError(error, "Bulk delete failed.");

  const affected = count ?? ids.length;

  await logAdminAction(supabase, user, {
    action: "tags_bulk_deleted",
    targetType: "tag",
    summary: `Bulk deleted ${affected} tag${affected === 1 ? "" : "s"}.`,
    metadata: { ids, affected },
  });

  return NextResponse.json({ ok: true, affected });
}
