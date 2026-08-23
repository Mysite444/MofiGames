import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { homepageReorderSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateGameFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

// Maps each homepage-manager section to the order column it controls on
// `games`. Kept in one place so the route and its column writes can't
// silently drift out of sync with each other.
const ORDER_COLUMN = {
  featured: "featured_order",
  editors_pick: "editors_pick_order",
  sponsored: "sponsored_order",
} as const;

/**
 * POST /api/admin/homepage/reorder — admin only. Takes the *full* ordered
 * list of game ids currently in a homepage section (Featured Collection,
 * Editor's Picks, or Sponsored Games) and writes 0..n-1 into that
 * section's order column, so the row on the homepage renders left-to-right
 * in exactly this order. Re-sending the whole list each time (rather than
 * a single move) keeps this simple and avoids ever having gapped or
 * duplicate order values drift in over many small edits.
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

  const parsed = homepageReorderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { section, gameIds } = parsed.data;
  const column = ORDER_COLUMN[section];

  const results = await Promise.all(
    gameIds.map((id, index) => supabase.from("games").update({ [column]: index }).eq("id", id))
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return apiError(failed.error);
  }

  invalidateGameFragments();
  return NextResponse.json({ ok: true });
}
