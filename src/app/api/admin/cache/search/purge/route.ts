import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { searchCachePurgeInputSchema, firstIssueMessage } from "@/lib/validation-search-cache";
import { purgeSearchCache } from "@/lib/search-cache";
import { redactSecret } from "@/lib/search-cache-settings";

/** POST /api/admin/cache/search/purge
 * Admin-only. scope "all" clears both the Search Suggestions and
 * Autocomplete in-process caches; "suggestions"/"autocomplete" clears
 * only that one. Records the outcome on the settings row so the admin UI
 * can show "last purged Xm ago" without needing the live stats panel
 * open — same pattern as fragment/purge. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = searchCachePurgeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const { scope } = parsed.data;

  const entriesRemoved = purgeSearchCache(scope);
  const summary = { scope, entriesRemoved };
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("search_cache_settings")
    .update({ last_purged_at: now, last_purge_summary: summary, updated_at: now, updated_by: user.id })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    // The purge itself already happened in memory even though recording
    // it failed — tell the caller both facts rather than pretending it
    // didn't run.
    return NextResponse.json(
      { result: summary, settings: null, warning: "Purge ran but failed to record the result." },
      { status: 207 }
    );
  }

  const { external_api_key, ...rest } = data as Record<string, unknown> & { external_api_key?: string | null };
  const redacted = redactSecret(external_api_key ?? null);

  return NextResponse.json({
    result: summary,
    settings: { ...rest, external_api_key_set: redacted.set, external_api_key_preview: redacted.preview },
  });
}
