"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Bot, Globe2, Server, Ban, ShieldOff, History } from "lucide-react";
import { fetchAdProtectionReports, type AdProtectionEvent, type AdProtectionAction } from "@/lib/supabase/admin-content";

const FILTERS = [
  { value: "all", label: "All flagged" },
  { value: "blocked", label: "Blocked" },
  { value: "bot", label: "Bot" },
  { value: "vpn", label: "VPN/Proxy" },
  { value: "datacenter", label: "Datacenter" },
  { value: "blacklisted", label: "Blacklisted" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

/** Admin → Monetization → Ad Protection → Invalid Traffic Reports. Every
 * flagged ad_events row plus the ad_protection_actions audit log — what
 * Auto Ad Disable / Auto IP Blocking actually did on their own. See
 * /api/admin/ads/protection/reports. */
export function AdProtectionReportsAdminClient() {
  const [filter, setFilter] = useState<Filter>("all");
  const [events, setEvents] = useState<AdProtectionEvent[] | null>(null);
  const [actions, setActions] = useState<AdProtectionAction[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (f: Filter) => {
    setError(null);
    try {
      const data = await fetchAdProtectionReports(f);
      setEvents(data.events);
      setActions(data.actions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load invalid traffic report.");
    }
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter, load]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Invalid Traffic Reports</h1>
        <p className="mt-0.5 text-sm text-text-faint">Flagged impressions/clicks and everything Ad Protection acted on automatically.</p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              filter === f.value ? "bg-[var(--color-menu-yellow)] text-black" : "glass-strong text-white/80 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {events === null ? (
        <div className="flex items-center justify-center py-16 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : (
        <div className="mb-8 glass overflow-x-auto rounded-2xl p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-text-faint">Flagged events</h2>
          {events.length === 0 ? (
            <p className="text-sm text-text-faint">Nothing matches this filter.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-faint">
                  <th className="pb-2 pr-4 font-semibold">When</th>
                  <th className="pb-2 pr-4 font-semibold">Type</th>
                  <th className="pb-2 pr-4 font-semibold">Placement</th>
                  <th className="pb-2 pr-4 font-semibold">IP</th>
                  <th className="pb-2 pr-4 font-semibold">Signals</th>
                  <th className="pb-2 pr-4 font-semibold">Risk</th>
                  <th className="pb-2 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-white/10 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap text-text-faint">{new Date(e.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 capitalize text-white/85">{e.event_type}</td>
                    <td className="py-2 pr-4 text-white/85">{e.placement}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-text-faint">{e.ip ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1.5">
                        {e.is_bot && <SignalBadge icon={<Bot size={11} />} label="Bot" />}
                        {e.is_vpn && <SignalBadge icon={<Globe2 size={11} />} label="VPN" />}
                        {e.is_datacenter && <SignalBadge icon={<Server size={11} />} label="Datacenter" />}
                        {e.rule_match === "blacklist" && <SignalBadge icon={<Ban size={11} />} label="Blacklisted" />}
                        {e.blocked && <SignalBadge icon={<ShieldOff size={11} />} label="Blocked" hot />}
                      </div>
                    </td>
                    <td className="py-2 pr-4 font-semibold text-white/85">{e.risk_score}</td>
                    <td className="py-2 max-w-xs truncate text-text-faint" title={e.block_reason ?? undefined}>
                      {e.block_reason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="glass rounded-2xl p-5">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text-faint">
          <History size={14} /> Automated actions
        </h2>
        {actions.length === 0 ? (
          <p className="text-sm text-text-faint">Auto Ad Disable / Auto IP Blocking haven&apos;t acted yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {actions.map((a) => (
              <li key={a.id} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hot/15 text-hot">
                  {a.action_type === "auto_ip_block" ? <Ban size={12} /> : <ShieldOff size={12} />}
                </span>
                <div className="min-w-0">
                  <p className="text-white/85">
                    {a.action_type === "auto_ip_block" ? "Auto-blocked IP" : "Auto-disabled ads for"}{" "}
                    <span className="font-mono">{a.target_value}</span>
                    {typeof a.risk_score === "number" && <span className="text-text-faint"> · risk {a.risk_score}</span>}
                  </p>
                  <p className="text-xs text-text-faint">
                    {a.reason ?? "No reason recorded"} · {new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SignalBadge({ icon, label, hot }: { icon: React.ReactNode; label: string; hot?: boolean }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        hot ? "bg-hot/15 text-hot" : "bg-white/10 text-white/70"
      }`}
    >
      {icon}
      {label}
    </span>
  );
}
