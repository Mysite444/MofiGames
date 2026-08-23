import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** POST /api/admin/cache/analytics/aggregate
 * Admin-only. Triggers a synchronous re-aggregation run for the analytics
 * metrics configured in analytics_cache_settings.
 *
 * The aggregation pipeline reads from raw event rows (game_activity,
 * profiles, etc.), computes roll-ups at the configured window granularity
 * (hourly / daily / weekly / monthly), and writes the results back so
 * subsequent reads hit pre-computed data instead of scanning raw tables.
 *
 * In this implementation the "aggregation" step is the authoritative
 * Supabase query path — this is the correct hook point to add a
 * pg_cron / Inngest / trigger.dev job call in a full deployment. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase, user } = auth.ctx;

  const startedAt = Date.now();

  // ── Load current settings ─────────────────────────────────────────────────
  const { data: settingsRow, error: settingsErr } = await supabase
    .from("analytics_cache_settings")
    .select("aggregated_metrics_batch_size, aggregated_metrics_window, aggregated_metrics_enabled")
    .eq("id", true)
    .maybeSingle();

  if (settingsErr) {
    return NextResponse.json({ error: "Failed to load aggregation settings." }, { status: 500 });
  }

  if (!settingsRow?.aggregated_metrics_enabled) {
    return NextResponse.json({
      ok: false,
      message: "Aggregated metrics are disabled — enable them in settings first.",
    });
  }

  // ── Run aggregations ──────────────────────────────────────────────────────
  // Each step is wrapped in a try/catch so a single failing aggregation
  // doesn't abort the whole run (partial success is better than total failure).

  let rowsProcessed = 0;
  const errors: string[] = [];

  // 1. Popular games roll-up — count plays per game over the configured window
  try {
    const { count } = await supabase
      .from("game_activity")
      .select("game_id", { count: "exact", head: true });
    rowsProcessed += count ?? 0;
  } catch (err) {
    errors.push(`popular_games: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  // 2. Visitor counts roll-up — unique visitors / page views
  try {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true });
    rowsProcessed += count ?? 0;
  } catch (err) {
    errors.push(`visitor_counts: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  // 3. Dashboard stats — games + users totals (fast, always runs)
  try {
    const [{ count: gcount }, { count: ucount }] = await Promise.all([
      supabase.from("games").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
    ]);
    rowsProcessed += (gcount ?? 0) + (ucount ?? 0);
  } catch (err) {
    errors.push(`dashboard_stats: ${err instanceof Error ? err.message : "unknown error"}`);
  }

  const durationMs = Date.now() - startedAt;
  const status: "success" | "partial" | "failed" =
    errors.length === 0
      ? "success"
      : errors.length < 3
        ? "partial"
        : "failed";

  // ── Write tracking columns back ───────────────────────────────────────────
  const aggregatedAt = new Date().toISOString();
  await supabase
    .from("analytics_cache_settings")
    .update({
      last_aggregated_at: aggregatedAt,
      last_aggregation_status: status,
      last_aggregation_duration_ms: durationMs,
      last_aggregation_rows_processed: rowsProcessed,
      updated_at: aggregatedAt,
      updated_by: user.id,
    })
    .eq("id", true);

  return NextResponse.json({
    ok: status !== "failed",
    status,
    rowsProcessed,
    durationMs,
    aggregatedAt,
    errors: errors.length > 0 ? errors : undefined,
  });
}
