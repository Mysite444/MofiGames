import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { metadataCachePurgeInputSchema, firstIssueMessage } from "@/lib/validation-metadata-cache";
import { purgeMetadataCache } from "@/lib/metadata-cache";

/** POST /api/admin/cache/metadata/purge
 * Admin-only. scope "all" clears every namespace (Categories, Tags,
 * Developers, Publishers, Game Metadata, SEO Metadata); a single scope
 * clears only that one. Records the outcome on the settings row so the
 * admin UI can show "last purged Xm ago" without the live stats panel
 * open — same pattern as search/purge and fragment/purge. */
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

  const parsed = metadataCachePurgeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const { scope } = parsed.data;

  const entriesRemoved = purgeMetadataCache(scope);
  const summary = { scope, entriesRemoved };
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("metadata_cache_settings")
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

  return NextResponse.json({ result: summary, settings: data });
}
