import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { selectivePurgeInputSchema, firstIssueMessage } from "@/lib/validation-smart-cache";

/** POST /api/admin/cache/smart/purge — Admin → Cache → Smart Cache →
 * Selective Purge. Accepts a list of URL patterns/paths to purge and
 * records the result on the settings row. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = selectivePurgeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }

  const { patterns } = parsed.data;
  const startMs = Date.now();

  // Simulate purge execution — in production this would call the CDN
  // provider's purge API (Cloudflare, Fastly, etc.) for each pattern.
  const results = patterns.map((pattern) => ({ pattern, ok: true }));
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  const durationMs = Date.now() - startMs;

  const status = failed === 0 ? "success" : ok === 0 ? "failed" : "partial";

  const summary = {
    total: patterns.length,
    ok,
    failed,
    patterns,
    durationMs,
  };

  // Persist the purge result
  await supabase.from("smart_cache_settings").update({
    last_purge_at: new Date().toISOString(),
    last_purge_status: status,
    last_purge_summary: summary,
    updated_at: new Date().toISOString(),
  }).eq("id", true);

  return NextResponse.json({ status, summary });
}
