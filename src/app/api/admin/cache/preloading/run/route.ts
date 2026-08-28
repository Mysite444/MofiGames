import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { runCachePreload } from "@/lib/cache-preload";

/** POST /api/admin/cache/preloading/run — "Preload Now" button, Admin →
 * Cache → Preloading & Prefetching → Cache Preloading. Admin-only. Runs
 * the exact same worker as the scheduled Automation → Infra → Cache
 * Preloading job (see src/lib/cache-preload.ts) and records the result
 * on the same row, so "last run" here and in the Automation logs never
 * disagree. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const summary = await runCachePreload(supabase);
  if (!summary) {
    return NextResponse.json(
      { error: "Cache Preloading is currently disabled. Enable it below, then try again." },
      { status: 400 }
    );
  }

  return NextResponse.json({ result: summary });
}
