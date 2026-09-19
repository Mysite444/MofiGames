import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import {
  DASHBOARD_STATS_TTL_LIMITS,
  DASHBOARD_STATS_SWR_LIMITS,
  VISITOR_COUNTS_TTL_LIMITS,
  VISITOR_COUNTS_RETENTION_LIMITS,
  POPULAR_GAMES_TTL_LIMITS,
  POPULAR_GAMES_TOP_N_LIMITS,
  POPULAR_GAMES_WINDOW_DAYS_LIMITS,
  REPORTS_TTL_LIMITS,
  REPORTS_MAX_RANGE_LIMITS,
  AGGREGATED_METRICS_TTL_LIMITS,
  AGGREGATED_METRICS_BATCH_SIZE_LIMITS,
  AGGREGATED_METRICS_INTERVAL_HOURS_LIMITS,
} from "@/lib/analytics-cache-settings";

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** GET /api/admin/cache/analytics/settings
 * Admin-only. Returns the analytics_cache_settings row (singleton). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("analytics_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load Analytics Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/admin/cache/analytics/settings
 * Admin-only. Partial update — only the fields present in the body are
 * written. Missing fields leave the stored value untouched, so the UI
 * can submit individual sections without clobbering others. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase, user } = auth.ctx;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  // ── 1. Dashboard Statistics ───────────────────────────────────────────────
  if (input.dashboardStatsEnabled !== undefined)
    patch.dashboard_stats_enabled = Boolean(input.dashboardStatsEnabled);
  if (input.dashboardStatsTtlSeconds !== undefined)
    patch.dashboard_stats_ttl_seconds = clamp(
      Number(input.dashboardStatsTtlSeconds) || DASHBOARD_STATS_TTL_LIMITS.min,
      DASHBOARD_STATS_TTL_LIMITS.min,
      DASHBOARD_STATS_TTL_LIMITS.max,
    );
  if (input.dashboardStatsStaleWhileRevalidate !== undefined)
    patch.dashboard_stats_stale_while_revalidate = clamp(
      Number(input.dashboardStatsStaleWhileRevalidate) || 0,
      DASHBOARD_STATS_SWR_LIMITS.min,
      DASHBOARD_STATS_SWR_LIMITS.max,
    );

  // ── 2. Visitor Counts ─────────────────────────────────────────────────────
  if (input.visitorCountsEnabled !== undefined)
    patch.visitor_counts_enabled = Boolean(input.visitorCountsEnabled);
  if (input.visitorCountsTtlSeconds !== undefined)
    patch.visitor_counts_ttl_seconds = clamp(
      Number(input.visitorCountsTtlSeconds) || VISITOR_COUNTS_TTL_LIMITS.min,
      VISITOR_COUNTS_TTL_LIMITS.min,
      VISITOR_COUNTS_TTL_LIMITS.max,
    );
  if (["realtime", "minutely", "hourly", "daily"].includes(String(input.visitorCountsResolution)))
    patch.visitor_counts_resolution = String(input.visitorCountsResolution);
  if (input.visitorCountsRetentionDays !== undefined)
    patch.visitor_counts_retention_days = clamp(
      Number(input.visitorCountsRetentionDays) || VISITOR_COUNTS_RETENTION_LIMITS.min,
      VISITOR_COUNTS_RETENTION_LIMITS.min,
      VISITOR_COUNTS_RETENTION_LIMITS.max,
    );
  if (input.visitorCountsUniqueTracking !== undefined)
    patch.visitor_counts_unique_tracking = Boolean(input.visitorCountsUniqueTracking);

  // ── 3. Popular Games ──────────────────────────────────────────────────────
  if (input.popularGamesEnabled !== undefined)
    patch.popular_games_enabled = Boolean(input.popularGamesEnabled);
  if (input.popularGamesTtlSeconds !== undefined)
    patch.popular_games_ttl_seconds = clamp(
      Number(input.popularGamesTtlSeconds) || POPULAR_GAMES_TTL_LIMITS.min,
      POPULAR_GAMES_TTL_LIMITS.min,
      POPULAR_GAMES_TTL_LIMITS.max,
    );
  if (input.popularGamesTopN !== undefined)
    patch.popular_games_top_n = clamp(
      Number(input.popularGamesTopN) || POPULAR_GAMES_TOP_N_LIMITS.min,
      POPULAR_GAMES_TOP_N_LIMITS.min,
      POPULAR_GAMES_TOP_N_LIMITS.max,
    );
  if (input.popularGamesWindowDays !== undefined)
    patch.popular_games_window_days = clamp(
      Number(input.popularGamesWindowDays) || POPULAR_GAMES_WINDOW_DAYS_LIMITS.min,
      POPULAR_GAMES_WINDOW_DAYS_LIMITS.min,
      POPULAR_GAMES_WINDOW_DAYS_LIMITS.max,
    );
  if (input.popularGamesScoreWeights && typeof input.popularGamesScoreWeights === "object") {
    const w = input.popularGamesScoreWeights as Record<string, unknown>;
    patch.popular_games_score_weights = {
      plays:   Math.min(1, Math.max(0, Number(w.plays   ?? 0.6))),
      rating:  Math.min(1, Math.max(0, Number(w.rating  ?? 0.3))),
      recency: Math.min(1, Math.max(0, Number(w.recency ?? 0.1))),
    };
  }
  if (input.popularGamesExcludeNsfw !== undefined)
    patch.popular_games_exclude_nsfw = Boolean(input.popularGamesExcludeNsfw);

  // ── 4. Reports ────────────────────────────────────────────────────────────
  if (input.reportsEnabled !== undefined)
    patch.reports_enabled = Boolean(input.reportsEnabled);
  if (input.reportsTtlSeconds !== undefined)
    patch.reports_ttl_seconds = clamp(
      Number(input.reportsTtlSeconds) || REPORTS_TTL_LIMITS.min,
      REPORTS_TTL_LIMITS.min,
      REPORTS_TTL_LIMITS.max,
    );
  if (input.reportsMaxRangeDays !== undefined)
    patch.reports_max_range_days = clamp(
      Number(input.reportsMaxRangeDays) || REPORTS_MAX_RANGE_LIMITS.min,
      REPORTS_MAX_RANGE_LIMITS.min,
      REPORTS_MAX_RANGE_LIMITS.max,
    );
  if (input.reportsPrecomputeEnabled !== undefined)
    patch.reports_precompute_enabled = Boolean(input.reportsPrecomputeEnabled);
  if (Array.isArray(input.reportsPrecomputeRanges)) {
    patch.reports_precompute_ranges = input.reportsPrecomputeRanges
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0 && n <= REPORTS_MAX_RANGE_LIMITS.max)
      .slice(0, 10);
  }

  // ── 5. Aggregated Metrics ─────────────────────────────────────────────────
  if (input.aggregatedMetricsEnabled !== undefined)
    patch.aggregated_metrics_enabled = Boolean(input.aggregatedMetricsEnabled);
  if (input.aggregatedMetricsTtlSeconds !== undefined)
    patch.aggregated_metrics_ttl_seconds = clamp(
      Number(input.aggregatedMetricsTtlSeconds) || AGGREGATED_METRICS_TTL_LIMITS.min,
      AGGREGATED_METRICS_TTL_LIMITS.min,
      AGGREGATED_METRICS_TTL_LIMITS.max,
    );
  if (input.aggregatedMetricsBatchSize !== undefined)
    patch.aggregated_metrics_batch_size = clamp(
      Number(input.aggregatedMetricsBatchSize) || AGGREGATED_METRICS_BATCH_SIZE_LIMITS.min,
      AGGREGATED_METRICS_BATCH_SIZE_LIMITS.min,
      AGGREGATED_METRICS_BATCH_SIZE_LIMITS.max,
    );
  if (["hourly", "daily", "weekly", "monthly"].includes(String(input.aggregatedMetricsWindow)))
    patch.aggregated_metrics_window = String(input.aggregatedMetricsWindow);
  if (input.aggregatedMetricsAutoRun !== undefined)
    patch.aggregated_metrics_auto_run = Boolean(input.aggregatedMetricsAutoRun);
  if (input.aggregatedMetricsRunIntervalHours !== undefined)
    patch.aggregated_metrics_run_interval_hours = clamp(
      Number(input.aggregatedMetricsRunIntervalHours) || AGGREGATED_METRICS_INTERVAL_HOURS_LIMITS.min,
      AGGREGATED_METRICS_INTERVAL_HOURS_LIMITS.min,
      AGGREGATED_METRICS_INTERVAL_HOURS_LIMITS.max,
    );

  // ── Upsert ────────────────────────────────────────────────────────────────
  const { data, error } = await supabase
    .from("analytics_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    // Row missing (migration just ran, seed not yet applied): insert it
    if (error.code === "PGRST116") {
      const { data: inserted, error: insertErr } = await supabase
        .from("analytics_cache_settings")
        .insert({ id: true, ...patch })
        .select("*")
        .single();
      if (insertErr) {
        return NextResponse.json({ error: "Failed to save Analytics Cache settings." }, { status: 500 });
      }
      return NextResponse.json({ settings: inserted });
    }
    return NextResponse.json({ error: "Failed to update Analytics Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
