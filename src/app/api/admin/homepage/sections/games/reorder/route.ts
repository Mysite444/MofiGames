import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { homepageSectionGamesReorderSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateHomepageFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

/**
 * POST /api/admin/homepage/sections/games/reorder — admin only. Takes the
 * full ordered list of pinned game ids for one section and rewrites their
 * `position` 0..n-1, mirroring /api/admin/homepage/reorder's approach for
 * the existing Featured/Editor's Picks/Sponsored tabs.
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

  const parsed = homepageSectionGamesReorderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { section_key, gameIds } = parsed.data;

  const results = await Promise.all(
    gameIds.map((gameId, index) =>
      supabase
        .from("homepage_section_games")
        .update({ position: index })
        .eq("section_key", section_key)
        .eq("game_id", gameId)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return apiError(failed.error);
  }

  invalidateHomepageFragments();
  return NextResponse.json({ ok: true });
}
