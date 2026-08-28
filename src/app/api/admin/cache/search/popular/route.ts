import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** GET /api/admin/cache/search/popular — Admin → Cache → Search Cache →
 * Popular Searches panel. Admin-only. Reads the precomputed leaderboard
 * from search_popular_queries — the actual *cache*, not a live
 * aggregation of search_queries — so opening this panel is instant
 * regardless of how large the raw search log has grown. See
 * POST .../recompute-popular for what fills this table. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("search_popular_queries")
    .select("*")
    .order("rank", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load popular searches." }, { status: 500 });
  }

  return NextResponse.json({ popular: data ?? [] });
}
