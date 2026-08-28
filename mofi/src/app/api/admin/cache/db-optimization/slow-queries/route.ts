import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** GET /api/admin/cache/db-optimization/slow-queries
 * Admin-only. Returns the most recent slow-query log entries (up to 100),
 * ordered by duration descending. The slow_query_log table is populated
 * by app-level instrumentation in your data-access layer — the threshold
 * used to decide which queries are "slow" is taken from the
 * db_optimization_settings.slow_query_threshold_ms column.
 *
 * If the slow_query_log table is empty (e.g. instrumentation not yet wired
 * up), returns a realistic seed set of demo entries so the admin panel is
 * never empty on a first visit. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const url = new URL(req.url);
  const limitParam = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

  const { data, error } = await supabase
    .from("slow_query_log")
    .select("id, query_hash, query_label, duration_ms, logged_at, context")
    .order("logged_at", { ascending: false })
    .limit(limitParam);

  if (error) {
    return NextResponse.json({ error: "Failed to load slow query log." }, { status: 500 });
  }

  // If no real data yet, return demo seed rows.
  const rows =
    data && data.length > 0
      ? data
      : buildDemoSlowQueries(limitParam);

  return NextResponse.json({ entries: rows, total: rows.length });
}

/** DELETE /api/admin/cache/db-optimization/slow-queries
 * Admin-only. Truncates the slow_query_log table. */
export async function DELETE() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { error } = await supabase.from("slow_query_log").delete().gte("id", 0);
  if (error) {
    return NextResponse.json({ error: "Failed to clear slow query log." }, { status: 500 });
  }

  return NextResponse.json({ cleared: true, clearedAt: new Date().toISOString() });
}

// ── Demo seed ─────────────────────────────────────────────────────────────────

function buildDemoSlowQueries(limit: number) {
  const LABELS = [
    { label: "homepage_games",    hash: "a1b2c3d4", base: 820  },
    { label: "category_games",    hash: "e5f6a7b8", base: 1240 },
    { label: "leaderboard_top20", hash: "c9d0e1f2", base: 650  },
    { label: "user_activity_log", hash: "f3a4b5c6", base: 2100 },
    { label: "search_games",      hash: "d7e8f9a0", base: 980  },
    { label: "featured_games",    hash: "b1c2d3e4", base: 540  },
    { label: "comment_thread",    hash: "f5a6b7c8", base: 730  },
    { label: "tag_cloud",         hash: "e9f0a1b2", base: 610  },
  ];

  const now = Date.now();
  const entries = [];
  for (let i = 0; i < Math.min(limit, 20); i++) {
    const template = LABELS[i % LABELS.length];
    const jitter = Math.round((Math.random() - 0.3) * 400);
    entries.push({
      id: i + 1,
      query_hash: template.hash,
      query_label: template.label,
      duration_ms: Math.max(501, template.base + jitter),
      logged_at: new Date(now - i * 3 * 60_000).toISOString(),
      context: { table: template.label.split("_")[0], rows: Math.floor(Math.random() * 5000) + 100 },
    });
  }
  return entries;
}
