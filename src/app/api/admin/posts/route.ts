import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { postInputSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** POST /api/admin/posts — create a blog/news post. Admin only. */
export async function POST(request: Request) {
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

  const parsed = postInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { tagIds, ...postFields } = parsed.data;

  const { data: post, error } = await supabase.from("posts").insert(postFields).select().single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A post with that slug already exists." }, { status: 409 });
    }
    return apiError(error);
  }

  if (tagIds.length > 0) {
    const { error: tagError } = await supabase
      .from("post_tags")
      .insert(tagIds.map((tag_id) => ({ post_id: post.id, tag_id })));
    if (tagError) {
      return apiError(tagError);
    }
  }

  return NextResponse.json({ post: { ...post, tagIds } }, { status: 201 });
}
