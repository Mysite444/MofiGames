import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { postUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";
import { del as blobDel } from "@vercel/blob";

const paramsSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/admin/posts/:id — admin only. */
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

  // Prevent publishing a trashed post accidentally via PATCH.
  if (postFields.is_published === true) {
    const { data: existing } = await supabase
      .from("posts")
      .select("deleted_at")
      .eq("id", postId)
      .maybeSingle();
    if (existing?.deleted_at) {
      return NextResponse.json(
        { error: "Cannot publish a trashed post. Restore it first." },
        { status: 409 }
      );
    }
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
    if (deleteError) return apiError(deleteError);
    if (tagIds.length > 0) {
      const { error: insertError } = await supabase
        .from("post_tags")
        .insert(tagIds.map((tag_id) => ({ post_id: postId, tag_id })));
      if (insertError) return apiError(insertError);
    }
  }

  if (!post) {
    const { data, error } = await supabase.from("posts").select().eq("id", postId).single();
    if (error) return apiError(error);
    post = data;
  }

  let responseTagIds = tagIds;
  if (responseTagIds === undefined) {
    const { data: existingTags } = await supabase.from("post_tags").select("tag_id").eq("post_id", postId);
    responseTagIds = (existingTags ?? []).map((t) => t.tag_id);
  }

  return NextResponse.json({ post: { ...post, tagIds: responseTagIds } });
}

/** DELETE /api/admin/posts/:id — permanent delete. The post MUST already
 * be in the Trash (deleted_at IS NOT NULL) — this is a safety guard that
 * mirrors the same rule on DELETE /api/admin/games/:id. To move a post to
 * the Trash first use POST /api/admin/posts/:id/trash. */
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
    .select("id, title, slug, cover_image_url, og_image_url, twitter_image_url, deleted_at")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }
  if (!existing.deleted_at) {
    return NextResponse.json(
      { error: "Move this post to Trash before permanently deleting it." },
      { status: 409 }
    );
  }

  // Clean up associated content images in Vercel Blob (best-effort).
  let filesRemoved = 0;
  const blobUrls = [existing.cover_image_url, existing.og_image_url, existing.twitter_image_url]
    .filter((u): u is string => typeof u === "string" && u.includes("blob.vercel-storage.com"));

  if (blobUrls.length > 0) {
    try {
      await blobDel(blobUrls);
      filesRemoved = blobUrls.length;
    } catch (err) {
      console.error("[posts:delete] blob cleanup error:", err);
    }
  }

  const { error } = await supabase.from("posts").delete().eq("id", parsedParams.data.id);
  if (error) return apiError(error);

  await logAdminAction(supabase, user, {
    action: "post_permanent_deleted",
    targetType: "post",
    targetId: parsedParams.data.id,
    summary: `Permanently deleted post "${existing.title}" (${existing.slug}).`,
    metadata: { title: existing.title, slug: existing.slug },
  });

  return NextResponse.json({ ok: true, filesRemoved });
}
