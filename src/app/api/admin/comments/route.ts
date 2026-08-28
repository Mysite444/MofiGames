import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/supabase/route-auth";
import { listCommentsAdminQuerySchema, firstIssueMessage } from "@/lib/validation";

const PAGE_SIZE = 50;

export interface AdminCommentDto {
  id: string;
  gameSlug: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/** GET /api/admin/comments?page=1&gameSlug=&q= — every comment across
 * every game, newest first, for moderation. Requires the moderate_comments
 * permission (admins always have it). Supports an optional game-slug
 * filter and a free-text search over the comment body and author name. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission("moderate_comments");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listCommentsAdminQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    gameSlug: request.nextUrl.searchParams.get("gameSlug") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, gameSlug, q } = parsed.data;

  let query = supabase
    .from("comments")
    .select("id, game_slug, parent_id, user_id, author_name, body, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (gameSlug) query = query.eq("game_slug", gameSlug);
  if (q) {
    // .or() uses commas to separate conditions and % as the ILIKE
    // wildcard — strip both from user input so a search containing them
    // can't break out of the filter string.
    const safeQ = q.replace(/[,%]/g, "").trim();
    if (safeQ) query = query.or(`body.ilike.%${safeQ}%,author_name.ilike.%${safeQ}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load comments." }, { status: 500 });
  }

  const comments: AdminCommentDto[] = (data ?? []).map((row) => ({
    id: row.id,
    gameSlug: row.game_slug,
    parentId: row.parent_id,
    authorId: row.user_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ comments, total: count ?? 0, page, pageSize: PAGE_SIZE });
}
