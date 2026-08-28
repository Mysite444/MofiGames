import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const paramsSchema = z.object({ id: z.string().uuid() });

/** POST /api/admin/posts/:id/trash — reversible "Move to Trash".
 * Sets deleted_at / deleted_by. The row and any media stay exactly as-is;
 * storage cleanup only happens on permanent delete. RLS (migration 0070)
 * hides trashed posts from every public read regardless of is_published. */
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
  if (existing.deleted_at) {
    return NextResponse.json({ error: "This post is already in the Trash." }, { status: 409 });
  }

  const { data: post, error } = await supabase
    .from("posts")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      // Clear any pending schedule so a trashed post can't be auto-published
      // by the cron while it sits in the Trash.
      scheduled_publish_at: null,
    })
    .eq("id", parsedParams.data.id)
    .select()
    .single();
  if (error) return apiError(error, "Failed to move post to Trash.");

  await logAdminAction(supabase, user, {
    action: "post_trashed",
    targetType: "post",
    targetId: post.id,
    summary: `Moved post "${post.title}" (${post.slug}) to Trash.`,
    metadata: { title: post.title, slug: post.slug },
  });

  return NextResponse.json({ ok: true, post });
}
