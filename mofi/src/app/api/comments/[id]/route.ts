import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin, requireUser } from "@/lib/supabase/route-auth";

const paramsSchema = z.object({ id: z.string().uuid() });

/** DELETE /api/comments/:id — deletes a comment (and, via `on delete
 * cascade`, its replies). Allowed for the comment's own author, an admin,
 * or anyone granted the moderate_comments permission (see migration
 * 0012). RLS enforces this too (migrations 0004, 0005, 0012); this route
 * just turns "not allowed"/"not found" into a clear 403/404 instead of a
 * silent no-op. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid comment id." }, { status: 400 });
  }

  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: existing, error: fetchError } = await supabase
    .from("comments")
    .select("id, user_id")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: "Failed to look up comment." }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
  if (existing.user_id !== user.id) {
    const [isUserAdmin, canModerate] = await Promise.all([
      isAdmin(supabase, user.id),
      supabase.rpc("has_permission", { perm: "moderate_comments" }).then(({ data }) => Boolean(data)),
    ]);
    if (!isUserAdmin && !canModerate) {
      return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
    }
  }

  const { error: deleteError } = await supabase.from("comments").delete().eq("id", parsed.data.id);
  if (deleteError) {
    return NextResponse.json({ error: "Failed to delete comment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
