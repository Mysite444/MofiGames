import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mobileMenuGamesReorderSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/**
 * POST /api/admin/mobile/games/reorder — admin only.
 * Takes the full ordered array of pinned game UUIDs and rewrites their
 * `position` values (0, 1, 2…) in one batch, mirroring the pattern used
 * by /api/admin/homepage/sections/games/reorder.
 * Body: { gameIds: string[] }
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

  const parsed = mobileMenuGamesReorderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { gameIds } = parsed.data;

  const results = await Promise.all(
    gameIds.map((gameId, index) =>
      supabase
        .from("mobile_menu_games")
        .update({ position: index })
        .eq("game_id", gameId)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return apiError(failed.error);
  }

  return NextResponse.json({ ok: true });
}
