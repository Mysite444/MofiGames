import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** GET /api/admin/cache/analytics/stats
 * Admin-only. Returns live counts from the database that indicate how much
 * analytics data is currently materialised/cached. These counters drive the
 * four stat chips at the top of CacheAnalyticsAdminClient.
 *
 * Counts are approximate (no exact hit/miss tracking at the DB layer) but
 * they give the operator a realistic picture of cache size and staleness. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  // ── Parallel reads — all fail soft so a missing table doesn't 500 ─────────

  const [settingsRes, gamesRes, usersRes] = await Promise.all([
    supabase
      .from("analytics_cache_settings")
      .select("last_purged_at, last_aggregated_at, last_aggregation_status, last_aggregation_rows_processed, aggregated_metrics_ttl_seconds, dashboard_stats_ttl_seconds, visitor_counts_ttl_seconds, popular_games_ttl_seconds, reports_ttl_seconds")
      .eq("id", true)
      .maybeSingle(),

    // Count of game rows — used as a proxy for "popular games cache potential"
    supabase.from("games").select("id", { count: "exact", head: true }),

    // Count of user rows — proxy for visitor-count data volume
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  const settings = settingsRes.data ?? null;
  const totalGames = gamesRes.count ?? 0;
  const totalUsers = usersRes.count ?? 0;

  // ── Derive stats from what we know ────────────────────────────────────────

  // Staleness: how many seconds ago was the last purge?
  let cacheAgeSec: number | null = null;
  if (settings?.last_purged_at) {
    cacheAgeSec = Math.floor((Date.now() - new Date(settings.last_purged_at).getTime()) / 1000);
  }

  // Shortest TTL among enabled pillars (worst-case expiry)
  const ttls = [
    settings?.dashboard_stats_ttl_seconds,
    settings?.visitor_counts_ttl_seconds,
    settings?.popular_games_ttl_seconds,
    settings?.reports_ttl_seconds,
  ].filter((t): t is number => typeof t === "number");
  const shortestTtl = ttls.length > 0 ? Math.min(...ttls) : null;

  // Last aggregation
  const lastAggregatedAt = settings?.last_aggregated_at ?? null;
  const lastAggregationStatus = settings?.last_aggregation_status ?? null;
  const lastAggregationRowsProcessed = settings?.last_aggregation_rows_processed ?? null;

  return NextResponse.json({
    stats: {
      // High-level counters
      totalGames,
      totalUsers,

      // Cache timing
      cacheAgeSec,
      shortestTtlSec: shortestTtl,

      // Aggregation
      lastAggregatedAt,
      lastAggregationStatus,
      lastAggregationRowsProcessed,

      // Timestamps
      fetchedAt: new Date().toISOString(),
    },
  });
}
