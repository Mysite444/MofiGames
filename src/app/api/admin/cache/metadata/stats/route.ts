import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { getMetadataCacheStats } from "@/lib/metadata-cache";

/** GET /api/admin/cache/metadata/stats — Admin → Cache → Metadata Cache
 * dashboard. Admin-only. Live, in-process numbers per namespace — no
 * database round trip, same spirit as search/stats and fragment's inline
 * stats. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  return NextResponse.json({ stats: getMetadataCacheStats() });
}
