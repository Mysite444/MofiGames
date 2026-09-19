"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Star, Heart, MessageSquare, Gamepad2 } from "lucide-react";
import { fetchAnalyticsGames, type AnalyticsGames, type AnalyticsGameRow } from "@/lib/supabase/admin-content";

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

function GameTable({
  rows,
  metricLabel,
  metric,
}: {
  rows: AnalyticsGameRow[];
  metricLabel: string;
  metric: (g: AnalyticsGameRow) => string | number;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-text-faint">No games yet.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-text-faint">
          <th className="pb-2 font-medium">Game</th>
          <th className="pb-2 text-right font-medium">{metricLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((g) => (
          <tr key={g.id} className="border-t border-white/10">
            <td className="truncate py-2 pr-2 font-medium text-white/85">{g.title}</td>
            <td className="py-2 text-right text-text-faint">{metric(g)}</td>
          </tr>
        ))}
      </tbody>
    </table>
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

/** Admin → Analytics → Games & Categories. Most/least played, trending
 * (7-day plays), recently added, featured, and a per-category breakdown.
 * See /api/admin/analytics/games. */
export function AnalyticsGamesAdminClient() {
  const [data, setData] = useState<AnalyticsGames | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await fetchAnalyticsGames());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load game analytics.");
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

  const { summary, mostPlayed, leastPlayed, trending, recentlyAdded, featured, categoryStats } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Game & Category Analytics</h1>
        <p className="mt-0.5 text-sm text-text-faint">How your catalog is performing.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Games" value={summary.totalGames} icon={<Gamepad2 size={18} />} />
        <StatCard label="Favorites" value={summary.totalFavorites.toLocaleString()} icon={<Heart size={18} />} />
        <StatCard label="Avg. rating" value={summary.averageRating.toFixed(1)} icon={<Star size={18} />} />
        <StatCard label="Reviews" value={summary.totalReviews} icon={<MessageSquare size={18} />} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Most played">
          <GameTable rows={mostPlayed} metricLabel="Plays" metric={(g) => g.plays.toLocaleString()} />
        </SectionCard>
        <SectionCard title="Least played (published)">
          <GameTable rows={leastPlayed} metricLabel="Plays" metric={(g) => g.plays.toLocaleString()} />
        </SectionCard>
        <SectionCard title="Trending — last 7 days">
          <GameTable rows={trending} metricLabel="Plays (7d)" metric={(g) => g.plays_7d ?? 0} />
        </SectionCard>
        <SectionCard title="Recently added">
          <GameTable
            rows={recentlyAdded}
            metricLabel="Added"
            metric={(g) => new Date(g.created_at).toLocaleDateString()}
          />
        </SectionCard>
      </div>

      <div className="mb-4">
        <SectionCard title={`Featured games (${featured.length})`}>
          {featured.length === 0 ? (
            <p className="text-sm text-text-faint">No games marked as featured yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {featured.map((g) => (
                <span
                  key={g.id}
                  className="rounded-full bg-[var(--color-menu-yellow)]/15 px-3 py-1 text-xs font-medium text-[var(--color-menu-yellow)]"
                >
                  {g.title}
                </span>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Top categories by plays">
        {categoryStats.length === 0 ? (
          <p className="text-sm text-text-faint">No categories yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-faint">
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 text-right font-medium">Games</th>
                <th className="pb-2 text-right font-medium">Total plays</th>
              </tr>
            </thead>
            <tbody>
              {categoryStats.map((c) => (
                <tr key={c.slug} className="border-t border-white/10">
                  <td className="py-2 pr-2 font-medium text-white/85">{c.name}</td>
                  <td className="py-2 text-right text-text-faint">{c.gameCount}</td>
                  <td className="py-2 text-right text-text-faint">{c.totalPlays.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
