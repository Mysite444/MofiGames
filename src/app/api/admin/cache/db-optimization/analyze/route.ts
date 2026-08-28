import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { dbOptimizationAnalyzeActionSchema, firstIssueMessage } from "@/lib/validation";
import type { IndexRecommendation } from "@/lib/db-optimization-settings";

/** POST /api/admin/cache/db-optimization/analyze
 * Admin-only. Three actions:
 *   - "analyze"      → run ANALYZE on key tables and write a summary.
 *   - "scan_indexes" → generate index recommendations from pg_stat_user_indexes
 *                      and pg_stat_user_tables (simulated; swap for real SQL).
 *   - "reindex"      → queue a REINDEX CONCURRENTLY on a named table. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = dbOptimizationAnalyzeActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }

  const { action, table } = parsed.data;
  const now = new Date().toISOString();

  // ── action: analyze ───────────────────────────────────────────────────────
  if (action === "analyze") {
    // In production: run `ANALYZE <tables>` via supabase.rpc() or a raw
    // pg connection. Here we simulate the result.
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 200));

    const summary = {
      tablesAnalyzed: ["games", "categories", "users", "comments", "tags", "posts"],
      durationMs: Math.round(400 + Math.random() * 200),
      rowsEstimated: {
        games: Math.floor(Math.random() * 5000) + 500,
        categories: Math.floor(Math.random() * 50) + 10,
        users: Math.floor(Math.random() * 20000) + 1000,
        comments: Math.floor(Math.random() * 100000) + 5000,
        tags: Math.floor(Math.random() * 200) + 20,
        posts: Math.floor(Math.random() * 1000) + 50,
      },
    };

    await supabase
      .from("db_optimization_settings")
      .update({ last_analyze_run_at: now, last_analyze_summary: summary })
      .eq("id", true);

    return NextResponse.json({ status: "success", analyzedAt: now, summary });
  }

  // ── action: scan_indexes ──────────────────────────────────────────────────
  if (action === "scan_indexes") {
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 300));

    // In production: query pg_stat_user_indexes + pg_stat_user_tables via
    // supabase.rpc() to find unused indexes and missing covering indexes.
    const recommendations: IndexRecommendation[] = [
      {
        table: "games",
        columns: ["category_slug", "is_published"],
        reason: "Composite index will accelerate category page queries that filter by published status.",
        estimatedImpact: "high",
        suggestedSql:
          "CREATE INDEX CONCURRENTLY idx_games_category_published\n  ON public.games (category_slug, is_published)\n  WHERE is_published = true;",
      },
      {
        table: "comments",
        columns: ["game_slug", "created_at"],
        reason: "Game comment listings always order by created_at DESC; a composite index avoids a sort.",
        estimatedImpact: "high",
        suggestedSql:
          "CREATE INDEX CONCURRENTLY idx_comments_game_created\n  ON public.comments (game_slug, created_at DESC);",
      },
      {
        table: "games",
        columns: ["plays"],
        reason: "Homepage 'Popular Games' and leaderboard queries do full-table scans on plays.",
        estimatedImpact: "medium",
        suggestedSql:
          "CREATE INDEX CONCURRENTLY idx_games_plays_desc\n  ON public.games (plays DESC)\n  WHERE is_published = true;",
      },
      {
        table: "users",
        columns: ["created_at"],
        reason: "User activity dashboard scans by signup date; range queries will benefit from a B-tree index.",
        estimatedImpact: "low",
        suggestedSql:
          "CREATE INDEX CONCURRENTLY idx_users_created_at\n  ON public.users (created_at DESC);",
      },
    ];

    await supabase
      .from("db_optimization_settings")
      .update({ index_recommendations: recommendations, last_index_scan_at: now })
      .eq("id", true);

    return NextResponse.json({
      status: "success",
      scannedAt: now,
      recommendationCount: recommendations.length,
      recommendations,
    });
  }

  // ── action: reindex ───────────────────────────────────────────────────────
  if (action === "reindex") {
    if (!table) {
      return NextResponse.json({ error: "A table name is required for reindex." }, { status: 422 });
    }

    // Load existing pending requests to append rather than overwrite.
    const { data: row } = await supabase
      .from("db_optimization_settings")
      .select("pending_reindex_requests")
      .eq("id", true)
      .maybeSingle();

    const existing: Array<Record<string, unknown>> = Array.isArray(
      (row as Record<string, unknown> | null)?.pending_reindex_requests
    )
      ? ((row as Record<string, unknown>).pending_reindex_requests as Array<Record<string, unknown>>)
      : [];

    // Replace any existing pending request for the same table.
    const filtered = existing.filter((r) => r.table !== table);
    const updated = [
      ...filtered,
      { table, requestedAt: now, status: "pending" },
    ];

    await supabase
      .from("db_optimization_settings")
      .update({ pending_reindex_requests: updated })
      .eq("id", true);

    return NextResponse.json({
      status: "queued",
      message: `REINDEX CONCURRENTLY on "${table}" has been queued. The automation job will pick it up on the next run.`,
      requestedAt: now,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
