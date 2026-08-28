import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { gameInputSchema, listGamesAdminQuerySchema, firstIssueMessage } from "@/lib/validation";
import { invalidateGameFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

/** GET /api/admin/games?page=&pageSize=&q=&status=&category=&tag=&featured=
 * &trending=&multiplayer=&mobile=&sort= — server-paginated, searched,
 * filtered, and sorted game list for the Games admin table (Phase 1/2 of
 * the Game Management CMS upgrade). Admin only — unlike the public game
 * list, this intentionally includes drafts/scheduled/trashed games so the
 * admin can manage every status from one screen. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listGamesAdminQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
    category: request.nextUrl.searchParams.get("category") ?? undefined,
    tag: request.nextUrl.searchParams.get("tag") ?? undefined,
    featured: request.nextUrl.searchParams.get("featured") ?? undefined,
    trending: request.nextUrl.searchParams.get("trending") ?? undefined,
    multiplayer: request.nextUrl.searchParams.get("multiplayer") ?? undefined,
    mobile: request.nextUrl.searchParams.get("mobile") ?? undefined,
    sort: request.nextUrl.searchParams.get("sort") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, pageSize, q, status, category, tag, featured, trending, multiplayer, mobile, sort } = parsed.data;

  let query = supabase.from("games").select("*", { count: "exact" });

  // Status — trash is its own explicit tab; every other status excludes
  // trashed rows so a trashed game never quietly reappears in "all".
  if (status === "trash") {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
    if (status === "published") query = query.eq("is_published", true);
    if (status === "draft") query = query.eq("is_published", false).is("scheduled_publish_at", null);
    if (status === "scheduled") query = query.eq("is_published", false).not("scheduled_publish_at", "is", null);
  }

  if (category) query = query.eq("category_slug", category);
  if (featured !== undefined) query = query.eq("is_featured", featured === "true");
  if (trending !== undefined) query = query.eq("is_trending", trending === "true");
  if (multiplayer !== undefined) query = query.eq("multiplayer", multiplayer === "true");
  if (mobile !== undefined) query = query.eq("mobile_support", mobile === "true");

  // Tag filter and text search both need game_tags lookups done up front
  // (Postgres can't filter a many-to-many relationship inline the way it
  // can a plain column) — resolved to a set of game ids, then applied with
  // .in() alongside every other filter above.
  if (tag) {
    const { data: tagged } = await supabase.from("game_tags").select("game_id").eq("tag_id", tag);
    const ids = (tagged ?? []).map((r) => r.game_id);
    query = query.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  }

  if (q) {
    const safeQ = q.replace(/[,%()]/g, "").trim();
    if (safeQ) {
      // Title/slug/category match directly; a tag-name match is resolved
      // to game ids first, same approach as the tag filter above, then
      // folded into the same .or() so "search by tag" (Phase 2) works
      // without a second round trip when it doesn't match.
      const { data: matchingTags } = await supabase.from("tags").select("id").ilike("name", `%${safeQ}%`);
      const tagIds = (matchingTags ?? []).map((t) => t.id);
      let taggedGameIds: string[] = [];
      if (tagIds.length > 0) {
        const { data: tagged } = await supabase.from("game_tags").select("game_id").in("tag_id", tagIds);
        taggedGameIds = [...new Set((tagged ?? []).map((r) => r.game_id))];
      }
      const orParts = [`title.ilike.%${safeQ}%`, `slug.ilike.%${safeQ}%`, `category_slug.ilike.%${safeQ}%`];
      if (taggedGameIds.length > 0) {
        orParts.push(`id.in.(${taggedGameIds.join(",")})`);
      }
      query = query.or(orParts.join(","));
    }
  }

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
    case "most_played":
      query = query.order("plays", { ascending: false });
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
    return apiError(error, "Failed to load games.");
  }

  const ids = (data ?? []).map((g) => g.id);
  const tagsByGame = new Map<string, string[]>();
  if (ids.length > 0) {
    const { data: gameTags } = await supabase.from("game_tags").select("game_id, tag_id").in("game_id", ids);
    for (const row of gameTags ?? []) {
      const list = tagsByGame.get(row.game_id) ?? [];
      list.push(row.tag_id);
      tagsByGame.set(row.game_id, list);
    }
  }

  const games = (data ?? []).map((g) => ({ ...g, tagIds: tagsByGame.get(g.id) ?? [] }));

  return NextResponse.json({ games, total: count ?? 0, page, pageSize });
}

/** A game can't go live with nothing to show for it — same rule this
 * enforces for both create (here) and update (PATCH games/:id), and (via
 * a pre-check rather than this schema) for bulk-publish. Draft saves are
 * never affected; this only ever blocks is_published: true. */
function publishRequiresThumbnail(is_published: boolean | undefined, thumbnail_url: string | null | undefined) {
  return is_published === true && !thumbnail_url;
}

/** POST /api/admin/games — create a game. Requires an admin session (RLS
 * on `games` backs this up regardless, but this route also validates the
 * shape/ranges of the payload server-side before it ever reaches the
 * database, and turns constraint violations into readable messages). */
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

  const parsed = gameInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { tagIds, ...gameFields } = parsed.data;

  if (publishRequiresThumbnail(gameFields.is_published, gameFields.thumbnail_url)) {
    return NextResponse.json(
      { error: "Add a thumbnail before publishing — or save as a draft instead." },
      { status: 400 }
    );
  }

  const { data: game, error } = await supabase.from("games").insert(gameFields).select().single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A game with that slug already exists." }, { status: 409 });
    }
    if (error.code === "23503") {
      return NextResponse.json({ error: "That category doesn't exist." }, { status: 400 });
    }
    return apiError(error);
  }

  if (tagIds.length > 0) {
    const { error: tagError } = await supabase
      .from("game_tags")
      .insert(tagIds.map((tag_id) => ({ game_id: game.id, tag_id })));
    if (tagError) {
      return apiError(tagError);
    }
  }

  // Announce it in the notification feed (bell icon in the header) — same
  // treatment whether it's an uploaded ("real") game or an embed_url
  // ("embed") one; the only thing that gates this is being publicly
  // visible. A draft (is_published = false) doesn't announce until it's
  // actually published, to avoid tipping people off to something that
  // 404s. Best-effort: a failure here shouldn't fail game creation itself.
  if (game.is_published) {
    const { error: notifyError } = await supabase.from("notifications").insert({
      type: "new_game",
      title: `New game: ${game.title}`,
      message: `${game.title} just landed on MofiGames — come play it.`,
      link: `/${game.slug}`,
      thumbnail_url: game.thumbnail_url ?? null,
      game_id: game.id,
    });
    if (notifyError) {
      console.error("Failed to write new-game notification:", notifyError.message);
    }
  }

  await logAdminAction(supabase, user, {
    action: "game_created",
    targetType: "game",
    targetId: game.id,
    summary: `Created game "${game.title}" (${game.slug}).`,
    metadata: { title: game.title, slug: game.slug, is_published: game.is_published },
  });

  invalidateGameFragments();
  return NextResponse.json({ game: { ...game, tagIds } }, { status: 201 });
}
