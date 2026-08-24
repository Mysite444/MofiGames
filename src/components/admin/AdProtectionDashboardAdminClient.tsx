"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Eye, MousePointerClick, ShieldCheck, Ban, Bot, Globe2, Server, AlertTriangle } from "lucide-react";
import { fetchAdProtectionDashboard, type AdProtectionDashboard } from "@/lib/supabase/admin-content";

function StatCard({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone?: "hot" }) {
  return (
    <div className="glass flex items-center gap-3 rounded-2xl p-4">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          tone === "hot" ? "bg-hot/15 text-hot" : "bg-white/10 text-[var(--color-menu-yellow)]"
        }`}
      >
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

function TrendChart({ trend }: { trend: AdProtectionDashboard["trend"] }) {
  const max = Math.max(1, ...trend.map((t) => t.impressions));
  return (
    <div className="flex h-32 items-end gap-[3px]">
      {trend.map((t) => (
        <div key={t.date} className="group relative flex-1">
          <div className="relative w-full">
            <div
              className="w-full rounded-t bg-[var(--color-menu-yellow)]/70 transition-colors group-hover:bg-[var(--color-menu-yellow)]"
              style={{ height: `${Math.max(2, (t.impressions / max) * 100)}px` }}
            />
            {t.flagged > 0 && (
              <div
                className="absolute bottom-0 w-full rounded-t bg-hot/80"
                style={{ height: `${Math.max(2, (t.flagged / max) * 100)}px` }}
              />
            )}
          </div>
          <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/90 px-2 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100">
            {t.date}: {t.impressions} impr · {t.clicks} clicks · {t.flagged} flagged
          </div>
        </div>
      ))}
    </div>
  );
}

/** Admin → Monetization → Ad Protection → Traffic Quality Dashboard.
 * Aggregate stats + CTR Monitoring + a 14-day trend, all computed fresh
 * from ad_events (migration 0024). See /api/admin/ads/protection/dashboard. */
export function AdProtectionDashboardAdminClient() {
  const [data, setData] = useState<AdProtectionDashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await fetchAdProtectionDashboard());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load the traffic quality dashboard.");
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

  const { overview, ctrMonitoring, placementBreakdown, trend } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Traffic Quality Dashboard</h1>
        <p className="mt-0.5 text-sm text-text-faint">Last 30 days, computed fresh from every recorded ad impression/click.</p>
      </div>

      {ctrMonitoring.alert && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            Today&apos;s CTR ({ctrMonitoring.todayCtr}%) is more than 3× your {ctrMonitoring.alertThresholdPct}% alert threshold —
            worth a look at Invalid Traffic Reports.
          </span>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Impressions (30d)" value={overview.totalImpressions.toLocaleString()} icon={<Eye size={18} />} />
        <StatCard label="Clicks (30d)" value={overview.totalClicks.toLocaleString()} icon={<MousePointerClick size={18} />} />
        <StatCard label="CTR (30d)" value={`${overview.ctr}%`} icon={<MousePointerClick size={18} />} />
        <StatCard label="Traffic quality score" value={`${overview.trafficQualityScore}/100`} icon={<ShieldCheck size={18} />} />
        <StatCard label="Blocked events" value={overview.blockedCount} icon={<Ban size={18} />} tone={overview.blockedCount > 0 ? "hot" : undefined} />
        <StatCard label="Bot-flagged" value={overview.botCount} icon={<Bot size={18} />} />
        <StatCard label="VPN/proxy-flagged" value={overview.vpnCount} icon={<Globe2 size={18} />} />
        <StatCard label="Datacenter-flagged" value={overview.datacenterCount} icon={<Server size={18} />} />
        <StatCard label="Blacklisted" value={overview.blacklistedCount} icon={<Ban size={18} />} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Impressions vs. flagged traffic — last 14 days">
            <TrendChart trend={trend} />
            <p className="mt-3 text-[11px] text-text-faint">
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--color-menu-yellow)]/70 align-middle" /> impressions ·{" "}
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-hot/80 align-middle" /> flagged (bot/VPN/datacenter/blocked)
            </p>
          </SectionCard>
        </div>
        <SectionCard title="CTR Monitoring">
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-text-faint">Today&apos;s impressions</span>
              <span className="font-semibold text-white">{ctrMonitoring.todayImpressions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-faint">Today&apos;s clicks</span>
              <span className="font-semibold text-white">{ctrMonitoring.todayClicks}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-faint">Today&apos;s CTR</span>
              <span className="font-semibold text-white">{ctrMonitoring.todayCtr}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-faint">Alert threshold</span>
              <span className="font-semibold text-white">{ctrMonitoring.alertThresholdPct}%</span>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="By placement">
        {placementBreakdown.length === 0 ? (
          <p className="text-sm text-text-faint">No ad events recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-faint">
                  <th className="pb-2 pr-4 font-semibold">Placement</th>
                  <th className="pb-2 pr-4 font-semibold">Impressions</th>
                  <th className="pb-2 pr-4 font-semibold">Clicks</th>
                  <th className="pb-2 pr-4 font-semibold">CTR</th>
                  <th className="pb-2 font-semibold">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {placementBreakdown.map((p) => (
                  <tr key={p.placement} className="border-t border-white/10">
                    <td className="py-2 pr-4 font-medium text-white/85">{p.placement}</td>
                    <td className="py-2 pr-4 text-text-faint">{p.impressions.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-text-faint">{p.clicks.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-text-faint">{p.ctr}%</td>
                    <td className="py-2 text-text-faint">{p.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
