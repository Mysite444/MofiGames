"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserPlus, Users, UserCheck, Search, SearchX } from "lucide-react";
import { fetchAnalyticsUsers, type AnalyticsUsers } from "@/lib/supabase/admin-content";

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

function KeywordList({ items, emptyLabel }: { items: { query: string; count: number }[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-faint">{emptyLabel}</p>;
  }
  const max = Math.max(...items.map((i) => i.count));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((i) => (
        <div key={i.query}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="truncate font-medium text-white/85">{i.query}</span>
            <span className="text-text-faint">{i.count}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--color-menu-yellow)]"
              style={{ width: `${Math.max(4, (i.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Admin → Analytics → Users & Search. New/active/returning/guest split
 * plus top search keywords and searches that returned nothing — the
 * clearest signal of missing content in the catalog. See
 * /api/admin/analytics/users. */
export function AnalyticsUsersAdminClient() {
  const [data, setData] = useState<AnalyticsUsers | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await fetchAnalyticsUsers());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load user analytics.");
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

  const { summary, topSearchKeywords, searchesWithNoResults } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">User & Search Analytics</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          Who&apos;s coming back, who&apos;s new, and what people are searching for.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total users" value={summary.totalUsers} icon={<Users size={18} />} />
        <StatCard label="New today" value={summary.newUsersToday} icon={<UserPlus size={18} />} />
        <StatCard label="Active (7d)" value={summary.activeUsers7d} icon={<UserCheck size={18} />} />
        <StatCard label="Active (30d)" value={summary.activeUsers30d} icon={<UserCheck size={18} />} />
        <StatCard label="Guest visitors (30d)" value={summary.guestVisitors30d} icon={<Users size={18} />} />
        <StatCard label="Searches (30d)" value={summary.totalSearches} icon={<Search size={18} />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Top search keywords (30d)">
          <KeywordList items={topSearchKeywords} emptyLabel="No searches logged yet." />
        </SectionCard>
        <SectionCard title="Searches with no results (30d)">
          {searchesWithNoResults.length === 0 ? (
            <p className="text-sm text-text-faint">Every search found something — nice.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {searchesWithNoResults.map((i) => (
                <div key={i.query} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 truncate text-white/85">
                    <SearchX size={13} className="shrink-0 text-hot" />
                    {i.query}
                  </span>
                  <span className="text-text-faint">{i.count}×</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
