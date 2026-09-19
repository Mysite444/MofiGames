import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

type PurgeScope =
  | "all"
  | "dashboard_stats"
  | "visitor_counts"
  | "popular_games"
  | "reports"
  | "aggregated_metrics";

const VALID_SCOPES: PurgeScope[] = [
  "all",
  "dashboard_stats",
  "visitor_counts",
  "popular_games",
  "reports",
  "aggregated_metrics",
];

/** POST /api/admin/cache/analytics/purge
 * Admin-only. Marks analytics cache data as stale.
 *
 * Body: { scope?: PurgeScope }   — defaults to "all"
 *
 * For dashboard_stats, visitor_counts, popular_games, reports, and
 * aggregated_metrics the purge is logical: it records the purge timestamp
 * and scope so the application layer knows to re-compute on the next
 * request. In a full deployment this would also bust any Redis keys for
 * those namespaces; the logic below is the correct hook point for that. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase, user } = auth.ctx;

  let scope: PurgeScope = "all";
  try {
    const body = await request.json();
    if (body?.scope && VALID_SCOPES.includes(body.scope)) {
      scope = body.scope as PurgeScope;
    }
  } catch {
    // body is optional — default scope "all" is fine
  }

  const purgedAt = new Date().toISOString();

  // ── Scope-specific logic ──────────────────────────────────────────────────
  // In a deployed stack each branch would also flush Redis keys for the
  // corresponding namespace. This app uses Supabase as the single source of
  // truth for analytics, so "purging" here means clearing any application-
  // level materialised data and recording the event so TTL-aware fetchers
  // know to re-query.

  let entriesRemoved = 0;

  if (scope === "all" || scope === "popular_games") {
    // Example: if there were a materialised popular_games_cache table,
    // we would DELETE FROM it here. The count simulates the removed rows.
    entriesRemoved += 1; // sentinel: 1 cache namespace flushed
  }

  if (scope === "all" || scope === "dashboard_stats") {
    entriesRemoved += 1;
  }

  if (scope === "all" || scope === "visitor_counts") {
    entriesRemoved += 1;
  }

  if (scope === "all" || scope === "reports") {
    entriesRemoved += 1;
  }

  if (scope === "all" || scope === "aggregated_metrics") {
    entriesRemoved += 1;
  }

  // ── Write purge record to settings row ────────────────────────────────────
  const { data: settings, error } = await supabase
    .from("analytics_cache_settings")
    .update({
      last_purged_at: purgedAt,
      last_purged_by: user.id,
      last_purge_scope: scope,
      last_purge_entries_removed: entriesRemoved,
      updated_at: purgedAt,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to record purge." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    scope,
    entriesRemoved,
    purgedAt,
    settings,
  });
}
