import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** GET /api/admin/cache/metadata/facets?scope=developers|publishers —
 * Admin → Cache → Metadata Cache → Developers / Publishers leaderboard.
 * Admin-only. Reads metadata_developer_facets / metadata_publisher_facets
 * as they currently stand, without recomputing — POST .../recompute-facets
 * is what actually refreshes the table; this just displays it on page
 * load. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const scope = req.nextUrl.searchParams.get("scope");
  if (scope !== "developers" && scope !== "publishers") {
    return NextResponse.json({ error: 'scope must be "developers" or "publishers".' }, { status: 422 });
  }

  const { data, error } = await supabase
    .from(scope === "developers" ? "metadata_developer_facets" : "metadata_publisher_facets")
    .select("*")
    .order("game_count", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load facets." }, { status: 500 });
  }

  return NextResponse.json({ facets: data ?? [] });
}
