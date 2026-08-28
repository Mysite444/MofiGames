import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const paramsSchema = z.object({ id: z.string().uuid() });

/** POST /api/admin/posts/:id/restore — undoes Move to Trash.
 * Clears deleted_at / deleted_by; the post goes back to whatever
 * is_published state it had when it was trashed. scheduled_publish_at
 * was cleared at trash time and stays cleared — the admin sets a fresh
 * schedule if needed. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid post id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: existing } = await supabase
    .from("posts")
    .select("id, title, slug, deleted_at")
    .eq("id", parsedParams.data.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }
  if (!existing.deleted_at) {
    return NextResponse.json({ error: "This post isn't in the Trash." }, { status: 409 });
  }

  const { data: post, error } = await supabase
    .from("posts")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", parsedParams.data.id)
    .select()
    .single();
  if (error) return apiError(error, "Failed to restore post.");

  await logAdminAction(supabase, user, {
    action: "post_restored",
    targetType: "post",
    targetId: post.id,
    summary: `Restored post "${post.title}" (${post.slug}) from Trash.`,
    metadata: { title: post.title, slug: post.slug },
  });

  return NextResponse.json({ ok: true, post });
}
