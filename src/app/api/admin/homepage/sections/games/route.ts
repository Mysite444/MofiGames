import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { homepageSectionGamePinSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateHomepageFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

/**
 * POST /api/admin/homepage/sections/games — admin only. Pins one game onto
 * one homepage row (system, genre, or real category — see section_key
 * format in homepage-section-registry.ts). Additive: the game still shows
 * up via whatever automatic rule already applied to it, this just adds it
 * to a row it wouldn't otherwise appear in.
 */
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

  const parsed = homepageSectionGamePinSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { section_key, game_id } = parsed.data;

  const { count } = await supabase
    .from("homepage_section_games")
    .select("id", { count: "exact", head: true })
    .eq("section_key", section_key);

  const { data, error } = await supabase
    .from("homepage_section_games")
    .insert({ section_key, game_id, position: count ?? 0 })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That game is already pinned to this section." }, { status: 409 });
    }
    if (error.code === "23503") {
      return NextResponse.json({ error: "That game no longer exists." }, { status: 404 });
    }
    return apiError(error);
  }

  invalidateHomepageFragments();
  return NextResponse.json({ pin: data }, { status: 201 });
}

/**
 * DELETE /api/admin/homepage/sections/games — admin only. Body:
 * { section_key, game_id }. Unpins a game from a row (the game may still
 * appear there automatically if it independently qualifies).
 */
export async function DELETE(request: Request) {
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

  const parsed = homepageSectionGamePinSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { section_key, game_id } = parsed.data;

  const { error } = await supabase
    .from("homepage_section_games")
    .delete()
    .eq("section_key", section_key)
    .eq("game_id", game_id);

  if (error) {
    return apiError(error);
  }

  invalidateHomepageFragments();
  return NextResponse.json({ ok: true });
}
