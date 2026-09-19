import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

const DAY_MS = 24 * 60 * 60 * 1000;

/** GET /api/admin/analytics/users — Admin → Analytics → Users & Search.
 * New/active/returning/guest split, plus top search keywords and
 * no-result searches from `search_queries`. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const now = Date.now();
  const since24h = new Date(now - DAY_MS).toISOString();
  const since7d = new Date(now - 7 * DAY_MS).toISOString();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();

  const [
    totalUsersResult,
    newTodayResult,
    pageViews30dResult,
    searchQueriesResult,
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    supabase
      .from("page_views")
      .select("visitor_id, user_id, created_at")
      .gte("created_at", since30d)
      .limit(20000),
    supabase
      .from("search_queries")
      .select("query, results_count, created_at")
      .gte("created_at", since30d)
      .limit(20000),
  ]);

  const views = pageViews30dResult.data ?? [];
  const activeIn = (fromIso: string) =>
    new Set(views.filter((v) => v.created_at >= fromIso && v.user_id).map((v) => v.user_id)).size;
  const guestVisitorsIn = (fromIso: string) =>
    new Set(views.filter((v) => v.created_at >= fromIso && !v.user_id).map((v) => v.visitor_id)).size;

  const active7d = activeIn(since7d);
  const active30d = activeIn(since30d);
  const registeredVisitors30d = new Set(views.filter((v) => v.user_id).map((v) => v.visitor_id)).size;
  const guestVisitors30d = guestVisitorsIn(since30d);

  // Search analytics.
  const queries = searchQueriesResult.data ?? [];
  const queryCounts = new Map<string, { count: number; noResults: number }>();
  for (const q of queries) {
    const key = q.query.toLowerCase();
    const entry = queryCounts.get(key) ?? { count: 0, noResults: 0 };
    entry.count += 1;
    if (q.results_count === 0) entry.noResults += 1;
    queryCounts.set(key, entry);
  }
  const topSearchKeywords = [...queryCounts.entries()]
    .map(([query, v]) => ({ query, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  const searchesWithNoResults = [...queryCounts.entries()]
    .filter(([, v]) => v.noResults > 0)
    .map(([query, v]) => ({ query, count: v.noResults }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return NextResponse.json({
    summary: {
      totalUsers: totalUsersResult.count ?? 0,
      newUsersToday: newTodayResult.count ?? 0,
      activeUsers7d: active7d,
      activeUsers30d: active30d,
      registeredVisitors30d,
      guestVisitors30d,
      totalSearches: queries.length,
    },
    topSearchKeywords,
    searchesWithNoResults,
  });
}
