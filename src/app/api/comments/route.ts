import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/route-auth";
import { checkCommentRateLimit } from "@/lib/supabase/comment-rate-limit";
import { createCommentSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

export interface CommentDto {
  id: string;
  gameSlug: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorIsAdmin: boolean;
  body: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  /** False when the comment is awaiting admin approval and not yet publicly
   * visible. Only ever set on the POST response (the author's own freshly-
   * submitted comment) — the GET list only returns approved comments, so
   * this field will always be true there. */
  isApproved: boolean;
}

interface CommentRow {
  id: string;
  game_slug: string;
  parent_id: string | null;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

/** GET /api/comments?gameSlug=some-game — every *approved* comment + reply
 * for a game, oldest-first, with each comment's like count and whether the
 * current viewer has liked it. Public: no auth required. */
export async function GET(request: NextRequest) {
  const gameSlug = request.nextUrl.searchParams.get("gameSlug")?.trim();
  if (!gameSlug) {
    return NextResponse.json({ error: "gameSlug query param is required." }, { status: 400 });
  }

  const supabase = await createClient();

  const [{ data: rows, error }, { data: sessionData }] = await Promise.all([
    supabase
      .from("comments")
      .select("id, game_slug, parent_id, user_id, author_name, body, created_at")
      .eq("game_slug", gameSlug)
      .eq("is_approved", true) // Defense-in-depth alongside the RLS policy
      .order("created_at", { ascending: true }),
    supabase.auth.getUser(),
  ]);

  if (error) {
    return NextResponse.json({ error: "Failed to load comments." }, { status: 500 });
  }

  const comments = (rows ?? []) as CommentRow[];
  const viewerId = sessionData.user?.id ?? null;

  if (comments.length === 0) {
    return NextResponse.json({ comments: [] as CommentDto[] });
  }

  const ids = comments.map((c) => c.id);
  const authorIds = [...new Set(comments.map((c) => c.user_id))];
  const [{ data: likeRows, error: likeError }, { data: adminProfiles, error: adminError }] =
    await Promise.all([
      supabase.from("comment_likes").select("comment_id, user_id").in("comment_id", ids),
      supabase.from("profiles").select("id, is_admin").in("id", authorIds),
    ]);

  if (likeError) {
    return NextResponse.json({ error: "Failed to load comment likes." }, { status: 500 });
  }
  if (adminError) {
    return NextResponse.json({ error: "Failed to load comment authors." }, { status: 500 });
  }

  const adminIds = new Set(
    (adminProfiles ?? []).filter((p) => p.is_admin).map((p) => p.id)
  );

  const likeCounts = new Map<string, number>();
  const likedByViewer = new Set<string>();
  for (const like of likeRows ?? []) {
    likeCounts.set(like.comment_id, (likeCounts.get(like.comment_id) ?? 0) + 1);
    if (viewerId && like.user_id === viewerId) likedByViewer.add(like.comment_id);
  }

  const dtos: CommentDto[] = comments.map((c) => ({
    id: c.id,
    gameSlug: c.game_slug,
    parentId: c.parent_id,
    authorId: c.user_id,
    authorName: c.author_name,
    authorIsAdmin: adminIds.has(c.user_id),
    body: c.body,
    createdAt: c.created_at,
    likeCount: likeCounts.get(c.id) ?? 0,
    likedByMe: likedByViewer.has(c.id),
    isApproved: true, // Only approved comments are returned by this endpoint
  }));

  return NextResponse.json({ comments: dtos });
}

/** POST /api/comments — create a top-level comment or a reply.
 *
 * The new comment lands with is_approved = false and will NOT appear
 * publicly until an admin approves it from Admin → Content → Comments.
 * The response includes isApproved: false so the client can show a
 * "pending moderation" notice to the author. */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const rateLimit = await checkCommentRateLimit(supabase, user.id);
  if (rateLimit.limited) {
    return NextResponse.json(
      { error: rateLimit.message },
      {
        status: 429,
        headers: rateLimit.retryAfterSeconds
          ? { "Retry-After": String(rateLimit.retryAfterSeconds) }
          : undefined,
      }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createCommentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { gameSlug, parentId, body } = parsed.data;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  const authorName =
    profile?.name ||
    (typeof user.user_metadata?.name === "string" ? user.user_metadata.name : null) ||
    "Player";
  const authorIsAdmin = Boolean(profile?.is_admin);

  if (parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("comments")
      .select("id, parent_id, game_slug")
      .eq("id", parentId)
      .maybeSingle();
    if (parentError || !parent) {
      return NextResponse.json(
        { error: "The comment you're replying to no longer exists." },
        { status: 404 }
      );
    }
    if (parent.parent_id) {
      return NextResponse.json(
        { error: "You can only reply one level deep." },
        { status: 400 }
      );
    }
    if (parent.game_slug !== gameSlug) {
      return NextResponse.json(
        { error: "Reply target belongs to a different game." },
        { status: 400 }
      );
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("comments")
    .insert({
      game_slug: gameSlug,
      parent_id: parentId ?? null,
      user_id: user.id,
      author_name: authorName,
      body,
      // is_approved defaults to false — explicit here for clarity
      is_approved: false,
    })
    .select("id, game_slug, parent_id, user_id, author_name, body, created_at, is_approved")
    .single();

  if (insertError || !inserted) {
    return apiError(insertError, "Failed to post comment.");
  }

  const row = inserted as CommentRow & { is_approved: boolean };
  const dto: CommentDto = {
    id: row.id,
    gameSlug: row.game_slug,
    parentId: row.parent_id,
    authorId: row.user_id,
    authorName: row.author_name,
    authorIsAdmin,
    body: row.body,
    createdAt: row.created_at,
    likeCount: 0,
    likedByMe: false,
    isApproved: row.is_approved,
  };

  return NextResponse.json({ comment: dto }, { status: 201 });
}
