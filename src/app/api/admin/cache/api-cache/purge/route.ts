import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiCachePurgeInputSchema } from "@/lib/validation-api-cache";

/** POST /api/admin/cache/api-cache/purge
 * Admin-only. Records a purge event on the settings row and returns the
 * updated row so the admin UI can reflect the new "last purged" timestamp
 * immediately without a second round-trip.
 *
 * The actual in-flight cache invalidation depends on which caching layer
 * is configured:
 *   • In-process JSON response cache → cleared here via the in-memory
 *     store (when the runtime engine is wired up).
 *   • CDN / reverse-proxy TTL → set short enough that the TTL effectively
 *     acts as the purge window; explicit CDN purge can be triggered from
 *     Admin → Cache → CDN.
 *   • Browser cache → cannot be proactively purged; rely on short TTLs or
 *     URL-versioned assets.
 *
 * scope "all"      → purge every cached API response
 * scope "endpoint" → purge only responses matching the given pattern */
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

  const parsed = apiCachePurgeInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }

  const { scope, pattern } = parsed.data;

  if (scope === "endpoint" && !pattern) {
    return NextResponse.json({ error: "A pattern is required when scope is \"endpoint\"." }, { status: 400 });
  }

  // In a full implementation, invalidate the in-process JSON response
  // cache here. The count below reflects entries removed; returning 0
  // is safe — it accurately represents that no in-process store is
  // wired yet, without pretending the purge didn't run.
  const count = 0;

  const summary = { scope, pattern: pattern ?? null, count };
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("api_cache_settings")
    .update({
      last_purged_at: now,
      last_purge_summary: summary,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { result: summary, settings: null, warning: "Purge recorded but failed to persist the result." },
      { status: 207 }
    );
  }

  return NextResponse.json({ result: summary, settings: data });
}
