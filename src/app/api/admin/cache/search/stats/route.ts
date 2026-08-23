import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { getSearchCacheStats } from "@/lib/search-cache";

/** GET /api/admin/cache/search/stats
 * Admin-only. Live, in-process hit/miss/entry counters for the Search
 * Suggestions and Autocomplete namespaces — no database round trip, this
 * is exactly what's sitting in this server instance's memory right now.
 * On a multi-instance deployment this reflects only the instance that
 * happened to serve this request; see the note at the top of
 * search-cache.ts. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const stats = getSearchCacheStats();
  return NextResponse.json({ stats });
}
