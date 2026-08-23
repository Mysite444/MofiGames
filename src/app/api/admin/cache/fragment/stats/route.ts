import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { getFragmentCacheStats } from "@/lib/fragment-cache";

/** GET /api/admin/cache/fragment/stats
 * Admin-only. Live, in-process hit/miss/entry counters — no database
 * round trip, this is exactly what's sitting in this server instance's
 * memory right now. On a multi-instance deployment this reflects only
 * the instance that happened to serve this request; see the note at the
 * top of fragment-cache.ts. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const stats = await getFragmentCacheStats();
  return NextResponse.json({ stats });
}
