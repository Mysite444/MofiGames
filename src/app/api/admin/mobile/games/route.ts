import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mobileMenuGameSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/**
 * POST /api/admin/mobile/games — admin only.
 * Pins one game onto the mobile hamburger menu's Featured Games row.
 * Body: { game_id: string (UUID) }
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

  const parsed = mobileMenuGameSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { game_id } = parsed.data;

  // Append at the end — count existing pins to set the next position.
  const { count } = await supabase
    .from("mobile_menu_games")
    .select("id", { count: "exact", head: true });

  const { data, error } = await supabase
    .from("mobile_menu_games")
    .insert({ game_id, position: count ?? 0 })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That game is already in the mobile menu." },
        { status: 409 }
      );
    }
    if (error.code === "23503") {
      return NextResponse.json({ error: "That game no longer exists." }, { status: 404 });
    }
    return apiError(error);
  }

  return NextResponse.json({ pin: data }, { status: 201 });
}

/**
 * DELETE /api/admin/mobile/games — admin only.
 * Unpins a game from the mobile menu featured row.
 * Body: { game_id: string (UUID) }
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

  const parsed = mobileMenuGameSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { game_id } = parsed.data;

  const { error } = await supabase
    .from("mobile_menu_games")
    .delete()
    .eq("game_id", game_id);

  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ ok: true });
}
