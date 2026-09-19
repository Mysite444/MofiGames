import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { duplicatePostSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";
import { slugify } from "@/lib/prng";

const paramsSchema = z.object({ id: z.string().uuid() });

// Columns that are never copied to a duplicate — identity fields, publish
// state (duplicate always starts as Draft), trash state, and scheduling.
const EXCLUDED_FIELDS = new Set([
  "id",
  "slug",
  "created_at",
  "updated_at",
  "is_published",
  "published_at",
  "scheduled_publish_at",
  "deleted_at",
  "deleted_by",
]);

/** POST /api/admin/posts/:id/duplicate
 * Creates a new Draft post based on the original. The duplicate gets a
 * unique slug ("<original-slug>-copy", or "-copy-2" etc. if that also
 * exists), starts as is_published=false, and has no schedule or trash
 * state. All content, SEO, OG, Twitter fields, and tag associations are
 * copied. Cover/OG/Twitter image URLs are copied as-is (same underlying
 * Blob files — same intentional trade-off as game duplication). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid post id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let json: unknown = {};
  try {
    json = await request.json();
  } catch {
    /* empty body is fine */
  }
  const parsedBody = duplicatePostSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }

  // Load the original post.
  const { data: original, error: fetchErr } = await supabase
    .from("posts")
    .select("*")
    .eq("id", parsedParams.data.id)
    .maybeSingle();
  if (fetchErr) return apiError(fetchErr);
  if (!original) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  // Build the new title — use provided override or append " Copy".
  const newTitle = parsedBody.data.title ?? `${original.title} Copy`;
  const baseSlug = slugify(newTitle);

  // Find a unique slug (check for existing collision, append -2, -3, …).
  let candidateSlug = baseSlug;
  let attempt = 1;
  for (;;) {
    const { data: collision } = await supabase
      .from("posts")
      .select("id")
      .eq("slug", candidateSlug)
      .maybeSingle();
    if (!collision) break;
    attempt++;
    candidateSlug = `${baseSlug}-${attempt}`;
  }

  // Build the new post row — copy every field except the excluded set.
  const newPost: Record<string, unknown> = { is_published: false };
  for (const [key, value] of Object.entries(original)) {
    if (!EXCLUDED_FIELDS.has(key)) {
      newPost[key] = value;
    }
  }
  newPost.title = newTitle;
  newPost.slug = candidateSlug;

  const { data: created, error: insertErr } = await supabase
    .from("posts")
    .insert(newPost)
    .select()
    .single();
  if (insertErr) return apiError(insertErr, "Failed to create duplicate post.");

  // Copy tag associations.
  const { data: originalTags } = await supabase
    .from("post_tags")
    .select("tag_id")
    .eq("post_id", original.id);
  const tagIds = (originalTags ?? []).map((t) => t.tag_id);
  if (tagIds.length > 0) {
    await supabase
      .from("post_tags")
      .insert(tagIds.map((tag_id) => ({ post_id: created.id, tag_id })));
  }

  await logAdminAction(supabase, user, {
    action: "post_duplicated",
    targetType: "post",
    targetId: created.id,
    summary: `Duplicated post "${original.title}" → "${newTitle}" (${candidateSlug}).`,
    metadata: { sourceId: original.id, sourceSlug: original.slug, newSlug: candidateSlug },
  });

  return NextResponse.json({ post: { ...created, tagIds } }, { status: 201 });
}
