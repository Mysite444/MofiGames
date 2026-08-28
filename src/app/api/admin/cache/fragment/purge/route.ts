import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { fragmentCachePurgeInputSchema } from "@/lib/validation-fragment-cache";
import { purgeAllFragments, purgeFragment } from "@/lib/fragment-cache";

/** POST /api/admin/cache/fragment/purge
 * Admin-only. scope "all" clears every entry in every fragment; scope
 * "fragment" clears only the named fragment's entries (all variants —
 * e.g. purging "related-games" clears it for every category, not just
 * one). Records the outcome on the settings row so the admin UI can show
 * "last purged Xm ago" without needing to keep the live stats panel
 * open. */
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

  const parsed = fragmentCachePurgeInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }

  const { scope, key } = parsed.data;

  if (scope === "fragment" && !key) {
    return NextResponse.json({ error: "Choose a fragment to purge." }, { status: 400 });
  }

  const entriesRemoved = scope === "all" ? purgeAllFragments() : purgeFragment(key!);

  const summary = { scope, key: key ?? null, entriesRemoved };
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("fragment_cache_settings")
    .update({ last_purged_at: now, last_purge_summary: summary, updated_at: now, updated_by: user.id })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
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
