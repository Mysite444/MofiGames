import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { duplicateGameSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateGameFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";
import { slugify } from "@/lib/prng";

const paramsSchema = z.object({ id: z.string().uuid() });

// Columns that are never copied onto a duplicate — either identity
// columns (id/created_at/updated_at/slug), state that must reset for a
// brand-new draft (publish status, schedule, curation flags/order,
// trash), or per-game stats that belong to the original game's actual
// history, not a fresh copy of it (rating, plays, favorites).
const EXCLUDED_FIELDS = new Set([
  "id",
  "slug",
  "created_at",
  "updated_at",
  "published_at",
  "deleted_at",
  "deleted_by",
  "duplicated_from",
  "is_published",
  "scheduled_publish_at",
  "is_featured",
  "featured_order",
  "is_trending",
  "is_recommended",
  "is_editors_pick",
  "editors_pick_order",
  "is_sponsored",
  "sponsored_order",
  "sponsor_label",
  "rating",
  "rating_count",
  "plays",
  "favorite_count",
  "embed_status",
  "embed_checked_at",
  "embed_fail_count",
  "link_status",
  "link_checked_at",
  "import_source",
  "import_external_id",
  "imported_at",
  // storage_path deliberately excluded too — see the play_type note below.
  "storage_path",
]);

/** POST /api/admin/games/:id/duplicate — Phase 12. Creates a new draft
 * game with a unique slug, copies its category and tag relationships, and
 * never publishes the copy (is_published always starts false regardless
 * of the original's status) so the admin can review/edit before it goes
 * live.
 *
 * Media URL fields (thumbnail/cover images/trailer/preview/loading
 * screen) ARE copied as-is — the duplicate points at the same underlying
 * Storage files as the original. That's a deliberate, documented
 * trade-off, not an oversight: true deep-copying every media file would
 * mean re-uploading every one of them here, which is slow and can
 * partially fail. The consequence: permanently deleting the *original*
 * later will also remove those shared files out from under the
 * duplicate — deleteGameStorageFiles() has no concept of "another game
 * still uses this". The Games admin should surface this via the
 * `duplicated_from` field so an admin knows before deleting an original
 * that has duplicates.
 *
 * `storage_path` (an uploaded build's folder) is NOT copied for exactly
 * that reason, but stronger: deleting either game's Storage walks and
 * removes every file under that shared folder, which would silently
 * break the other game's playability, not just its thumbnail. A
 * duplicated "upload" game instead comes back as play_type "embed" with
 * an empty embed_url — the admin must supply a build/URL for the
 * duplicate before it can be published (the same "add a thumbnail before
 * publishing" style of guardrail already enforced elsewhere). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid game id." }, { status: 400 });
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
    // no body is fine — title override is optional
  }
  const parsedBody = duplicateGameSchema.safeParse(json ?? {});
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }

  const { data: original, error: fetchError } = await supabase
    .from("games")
    .select("*")
    .eq("id", parsedParams.data.id)
    .maybeSingle();
  if (fetchError) return apiError(fetchError);
  if (!original) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const { data: existingTags } = await supabase
    .from("game_tags")
    .select("tag_id")
    .eq("game_id", original.id);
  const tagIds = (existingTags ?? []).map((t) => t.tag_id);

  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(original)) {
    if (!EXCLUDED_FIELDS.has(key)) copy[key] = value;
  }

  const newTitle = parsedBody.data.title?.trim() || `${original.title} Copy`;
  const baseSlug = slugify(newTitle) || `${original.slug}-copy`;
  // Try baseSlug, then baseSlug-2, baseSlug-3, ... until one isn't taken.
  let slug = baseSlug;
  for (let suffix = 2; suffix <= 50; suffix++) {
    const { data: clash } = await supabase.from("games").select("id").eq("slug", slug).maybeSingle();
    if (!clash) break;
    slug = `${baseSlug}-${suffix}`;
  }

  const { data: created, error: insertError } = await supabase
    .from("games")
    .insert({
      ...copy,
      title: newTitle,
      slug,
      is_published: false,
      scheduled_publish_at: null,
      play_type: original.play_type === "upload" ? "embed" : original.play_type,
      embed_url: original.play_type === "upload" ? "" : original.embed_url,
      storage_path: null,
      duplicated_from: original.id,
    })
    .select()
    .single();

  if (insertError) {
    return apiError(insertError, "Failed to duplicate game.");
  }

  if (tagIds.length > 0) {
    const { error: tagError } = await supabase
      .from("game_tags")
      .insert(tagIds.map((tag_id) => ({ game_id: created.id, tag_id })));
    if (tagError) {
      return apiError(tagError, "Game duplicated, but copying its tags failed.");
    }
  }

  await logAdminAction(supabase, user, {
    action: "game_duplicated",
    targetType: "game",
    targetId: created.id,
    summary: `Duplicated game "${original.title}" (${original.slug}) as "${created.title}" (${created.slug}).`,
    metadata: { sourceId: original.id, sourceSlug: original.slug, newSlug: created.slug },
  });

  invalidateGameFragments();
  return NextResponse.json({ game: { ...created, tagIds } }, { status: 201 });
}
