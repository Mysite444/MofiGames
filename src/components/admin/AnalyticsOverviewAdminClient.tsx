"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Gamepad2, Users, Radio, Play, Eye, Newspaper, UserPlus } from "lucide-react";
import { fetchAnalyticsOverview, type AnalyticsOverview } from "@/lib/supabase/admin-content";

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[var(--color-menu-yellow)]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="font-display text-xl font-bold text-white">{value}</p>
        <p className="truncate text-xs text-text-faint">{label}</p>
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-text-faint">{title}</h2>
      {children}
    </div>
  );
}

function BreakdownBars({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0) || 1;
  if (entries.length === 0 || total === 0) {
    return <p className="text-sm text-text-faint">No data yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {entries.map(([label, value]) => {
        const pct = Math.round((value / total) * 100);
        return (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-white/85">{label}</span>
              <span className="text-text-faint">{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[var(--color-menu-yellow)]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VisitorTrendChart({ trend }: { trend: { date: string; visitors: number }[] }) {
  const max = Math.max(1, ...trend.map((t) => t.visitors));
  return (
    <div className="flex h-32 items-end gap-[3px]">
      {trend.map((t) => (
        <div key={t.date} className="group relative flex-1">
          <div
            className="w-full rounded-t bg-[var(--color-menu-yellow)]/70 transition-colors group-hover:bg-[var(--color-menu-yellow)]"
            style={{ height: `${Math.max(2, (t.visitors / max) * 100)}%` }}
          />
          <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100">
            {t.date}: {t.visitors}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Admin → Analytics → Overview. Site-wide KPIs, a 30-day visitor trend,
 * device + traffic-source breakdowns, and recent activity — all derived
 * from data this app already collects (page_views, game_plays, games,
 * profiles). See /api/admin/analytics/overview. */
export function AnalyticsOverviewAdminClient() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await fetchAnalyticsOverview());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load analytics.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>;
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  const { overview, visitorTrend, deviceDistribution, trafficSources, recentActivity } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Analytics Overview</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          Live from your own data — visitor counts are unique per browser, tracked site-wide.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total games" value={overview.totalGames} icon={<Gamepad2 size={18} />} />
        <StatCard label="Total users" value={overview.totalUsers} icon={<Users size={18} />} />
        <StatCard label="Online now" value={overview.onlineUsers} icon={<Radio size={18} />} />
        <StatCard label="Total plays" value={overview.totalPlays.toLocaleString()} icon={<Play size={18} />} />
        <StatCard label="Plays today" value={overview.todayPlays} icon={<Play size={18} />} />
        <StatCard label="Visitors today" value={overview.todayVisitors} icon={<Eye size={18} />} />
        <StatCard label="Visitors this week" value={overview.weeklyVisitors} icon={<Eye size={18} />} />
        <StatCard label="Visitors this month" value={overview.monthlyVisitors} icon={<Eye size={18} />} />
        <StatCard label="Total visitors" value={overview.totalVisitors.toLocaleString()} icon={<Eye size={18} />} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Visitor trend — last 30 days">
            <VisitorTrendChart trend={visitorTrend} />
          </SectionCard>
        </div>
        <SectionCard title="Recent activity">
          {recentActivity.length === 0 ? (
            <p className="text-sm text-text-faint">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentActivity.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {a.type === "user_joined" ? (
                    <UserPlus size={14} className="mt-0.5 shrink-0 text-white/50" />
                  ) : (
                    <Newspaper size={14} className="mt-0.5 shrink-0 text-white/50" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-white/85">{a.label}</p>
                    <p className="text-xs text-text-faint">{new Date(a.at).toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SectionCard title="Device distribution (30d)">
          <BreakdownBars data={deviceDistribution} />
        </SectionCard>
        <SectionCard title="Traffic sources (30d)">
          <BreakdownBars data={trafficSources} />
        </SectionCard>
      </div>
    </div>
  );
}
