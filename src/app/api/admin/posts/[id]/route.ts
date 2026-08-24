import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { postUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const paramsSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/admin/posts/:id — admin only. If `tagIds` is included in the
 * body, replaces the post's tag assignments to match exactly (delete-then-
 * insert — simplest way to keep a many-to-many join table in sync from a
 * single "here's the full list" payload). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid post id." }, { status: 400 });
  }

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

  const parsedBody = postUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }

  const { tagIds, ...postFields } = parsedBody.data;
  const postId = parsedParams.data.id;

  if (Object.keys(postFields).length === 0 && tagIds === undefined) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  let post = null;
  if (Object.keys(postFields).length > 0) {
    const { data, error } = await supabase
      .from("posts")
      .update(postFields)
      .eq("id", postId)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "A post with that slug already exists." }, { status: 409 });
      }
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Post not found." }, { status: 404 });
      }
      return apiError(error);
    }
    post = data;
  }

  if (tagIds !== undefined) {
    const { error: deleteError } = await supabase.from("post_tags").delete().eq("post_id", postId);
    if (deleteError) {
      return apiError(deleteError);
    }
    if (tagIds.length > 0) {
      const { error: insertError } = await supabase
        .from("post_tags")
        .insert(tagIds.map((tag_id) => ({ post_id: postId, tag_id })));
      if (insertError) {
        return apiError(insertError);
      }
    }
  }

  if (!post) {
    const { data, error } = await supabase.from("posts").select().eq("id", postId).single();
    if (error) {
      return apiError(error);
    }
    post = data;
  }

  let responseTagIds = tagIds;
  if (responseTagIds === undefined) {
    const { data: existingTags } = await supabase.from("post_tags").select("tag_id").eq("post_id", postId);
    responseTagIds = (existingTags ?? []).map((t) => t.tag_id);
  }

  return NextResponse.json({ post: { ...post, tagIds: responseTagIds } });
}

/** DELETE /api/admin/posts/:id — admin only. Tag links clean up via
 * `on delete cascade` on post_tags. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
    .select("title, slug")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  const { error } = await supabase.from("posts").delete().eq("id", parsedParams.data.id);
  if (error) {
    return apiError(error);
  }

  await logAdminAction(supabase, user, {
    action: "post_deleted",
    targetType: "post",
    targetId: parsedParams.data.id,
    summary: existing ? `Deleted post "${existing.title}" (${existing.slug}).` : "Deleted a post.",
    metadata: existing ?? {},
  });

  return NextResponse.json({ ok: true });
}
