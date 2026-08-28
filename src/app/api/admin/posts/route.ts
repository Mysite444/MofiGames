import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { postInputSchema, listPostsAdminQuerySchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

/** GET /api/admin/posts?page=&pageSize=&q=&status=&tag=&sort=
 * Server-paginated, searched, filtered, and sorted post list for the Posts
 * admin table. Admin only. Includes drafts/scheduled/trashed posts. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listPostsAdminQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    tag: request.nextUrl.searchParams.get("tag") ?? undefined,
    sort: request.nextUrl.searchParams.get("sort") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, pageSize, q, status, tag, sort } = parsed.data;

  let query = supabase.from("posts").select("*", { count: "exact" });

  // Status filtering — trash is its own explicit tab; all others exclude trashed rows.
  if (status === "trash") {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
    if (status === "published") {
      query = query.eq("is_published", true);
    } else if (status === "draft") {
      query = query.eq("is_published", false).is("scheduled_publish_at", null);
    } else if (status === "scheduled") {
      query = query.eq("is_published", false).not("scheduled_publish_at", "is", null);
    }
    // "all" = no additional filter beyond deleted_at IS NULL
  }

  // Tag filter — resolve tag → post ids, then filter.
  if (tag) {
    const { data: tagged } = await supabase.from("post_tags").select("post_id").eq("tag_id", tag);
    const ids = (tagged ?? []).map((r) => r.post_id);
    query = query.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  // Text search across title and slug.
  if (q) {
    const safeQ = q.replace(/[,%()]/g, "").trim();
    if (safeQ) {
      query = query.or(`title.ilike.%${safeQ}%,slug.ilike.%${safeQ}%`);
    }
  }

  // Sorting.
  switch (sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "updated":
      query = query.order("updated_at", { ascending: false });
      break;
    case "title_asc":
      query = query.order("title", { ascending: true });
      break;
    case "title_desc":
      query = query.order("title", { ascending: false });
      break;
    case "published_date":
      query = query.order("published_at", { ascending: false, nullsFirst: false });
      break;
    case "newest":
    default:
      query = query.order("created_at", { ascending: false });
      break;
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) {
    return apiError(error, "Failed to load posts.");
  }

  // Attach tag ids for the current page only.
  const ids = (data ?? []).map((p) => p.id);
  const tagsByPost = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: postTags } = await supabase.from("post_tags").select("post_id, tag_id").in("post_id", ids);
    for (const row of postTags ?? []) {
      const list = tagsByPost.get(row.post_id) ?? [];
      list.push(row.tag_id);
      tagsByPost.set(row.post_id, list);
    }
  }

  const posts = (data ?? []).map((p) => ({ ...p, tagIds: tagsByPost.get(p.id) ?? [] }));

  return NextResponse.json({ posts, total: count ?? 0, page, pageSize });
}

/** POST /api/admin/posts — create a blog/news post. Admin only. */
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

  await logAdminAction(supabase, user, {
    action: "post_created",
    targetType: "post",
    targetId: post.id,
    summary: `Created post "${post.title}" (${post.slug}).`,
    metadata: { title: post.title, slug: post.slug },
  });

  return NextResponse.json({ post: { ...post, tagIds } }, { status: 201 });
}
