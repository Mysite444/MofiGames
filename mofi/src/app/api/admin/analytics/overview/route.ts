import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { classifyTrafficSource } from "@/lib/user-agent";
import { SITE_URL } from "@/lib/seo";

const DAY_MS = 24 * 60 * 60 * 1000;

/** GET /api/admin/analytics/overview — Admin → Analytics → Overview.
 * Site-wide KPIs, a 30-day visitor trend, device + traffic-source
 * breakdowns, and a short "recent activity" feed. Computed fresh on every
 * request from page_views/game_plays/games/profiles — nothing here is
 * precomputed or cached, so it's always current as of this request. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();
  const since7d = new Date(now - 7 * DAY_MS).toISOString();
  const since24h = new Date(now - DAY_MS).toISOString();
  const since5min = new Date(now - 5 * 60 * 1000).toISOString();

  const [
    gamesCount,
    profilesCount,
    playsSumResult,
    todayPlaysCount,
    recentPageViews,
    onlineNow,
    totalVisitorsAll,
    recentGames,
    recentUsers,
  ] = await Promise.all([
    supabase.from("games").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("games").select("plays"),
    supabase.from("game_plays").select("id", { count: "exact", head: true }).gte("created_at", since24h),
    supabase
      .from("page_views")
      .select("visitor_id, referrer, device_type, created_at")
      .gte("created_at", since30d)
      .limit(20000),
    supabase.from("page_views").select("visitor_id").gte("created_at", since5min).limit(5000),
    supabase.from("page_views").select("visitor_id").limit(20000),
    supabase.from("games").select("id, title, slug, created_at").order("created_at", { ascending: false }).limit(5),
    supabase.from("profiles").select("id, name, created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const totalPlays = (playsSumResult.data ?? []).reduce((sum, g) => sum + (g.plays ?? 0), 0);

  const views = recentPageViews.data ?? [];
  const uniqueIn = (fromIso: string) =>
    new Set(views.filter((v) => v.created_at >= fromIso).map((v) => v.visitor_id)).size;

  const todayVisitors = uniqueIn(since24h);
  const weeklyVisitors = uniqueIn(since7d);
  const monthlyVisitors = uniqueIn(since30d);
  const onlineVisitors = new Set((onlineNow.data ?? []).map((v) => v.visitor_id)).size;
  const totalVisitors = new Set((totalVisitorsAll.data ?? []).map((v) => v.visitor_id)).size;

  // Visitor trend: unique visitors per day, last 30 days.
  const dayBuckets = new Map<string, Set<string>>();
  for (const v of views) {
    const day = v.created_at.slice(0, 10);
    if (!dayBuckets.has(day)) dayBuckets.set(day, new Set());
    dayBuckets.get(day)!.add(v.visitor_id);
  }
  const visitorTrend: { date: string; visitors: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    visitorTrend.push({ date, visitors: dayBuckets.get(date)?.size ?? 0 });
  }

  // Device distribution.
  const deviceCounts: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 };
  for (const v of views) {
    deviceCounts[v.device_type] = (deviceCounts[v.device_type] ?? 0) + 1;
  }

  // Traffic sources.
  const siteHost = (() => {
    try {
      return new URL(SITE_URL).hostname;
    } catch {
      return "";
    }
  })();
  const trafficCounts: Record<string, number> = {};
  for (const v of views) {
    const source = classifyTrafficSource(v.referrer ?? "", siteHost);
    trafficCounts[source] = (trafficCounts[source] ?? 0) + 1;
  }

  const recentActivity = [
    ...(recentGames.data ?? []).map((g) => ({
      type: "game_added" as const,
      label: `Game added: ${g.title}`,
      href: `/${g.slug}`,
      at: g.created_at,
    })),
    ...(recentUsers.data ?? []).map((u) => ({
      type: "user_joined" as const,
      label: `New user: ${u.name}`,
      href: null,
      at: u.created_at,
    })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 8);

  return NextResponse.json({
    overview: {
      totalGames: gamesCount.count ?? 0,
      totalUsers: profilesCount.count ?? 0,
      onlineUsers: onlineVisitors,
      totalPlays,
      todayPlays: todayPlaysCount.count ?? 0,
      todayVisitors,
      weeklyVisitors,
      monthlyVisitors,
      totalVisitors,
    },
    visitorTrend,
    deviceDistribution: deviceCounts,
    trafficSources: trafficCounts,
    recentActivity,
  });
}
