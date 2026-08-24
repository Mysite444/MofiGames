"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, ShieldCheck, Check } from "lucide-react";

const PAGE_SIZE = 50;

interface SecurityAlertRow {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  user_id: string | null;
  message: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

const SEVERITY_STYLES: Record<SecurityAlertRow["severity"], string> = {
  info: "bg-white/10 text-text-muted",
  warning: "bg-amber-500/15 text-amber-400",
  critical: "bg-hot/15 text-hot",
};

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Admin → Security → Alerts. Account lockouts, new-location logins, and
 * password/MFA changes — auto-raised by the login flow and Profile →
 * Security. See security_alerts in
 * supabase/migrations/0017_security_hardening.sql. */
export function SecurityAlertsAdminClient() {
  const [alerts, setAlerts] = useState<SecurityAlertRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number, resolved: boolean) => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage), resolved: String(resolved) });
      const res = await fetch(`/api/admin/security/alerts?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load security alerts.");
      setAlerts(data.alerts);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load security alerts.");
    }
  }, []);

  useEffect(() => {
    load(page, showResolved);
  }, [load, page, showResolved]);

  async function resolve(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/security/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to resolve alert.");
      }
      setAlerts((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));
      setTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve alert.");
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Security Alerts</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {alerts ? `${total} alert${total === 1 ? "" : "s"}` : "Loading…"} — lockouts, new-location logins, and
            password/2FA changes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            setShowResolved((v) => !v);
          }}
          className="glass shrink-0 rounded-full px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
        >
          {showResolved ? "Showing resolved" : "Showing unresolved"}
        </button>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {alerts === null && (
        <div className="flex items-center justify-center py-20 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {alerts?.length === 0 && (
        <div className="glass flex flex-col items-center gap-2 rounded-xl px-4 py-10 text-center text-text-faint">
          <ShieldCheck size={20} />
          {showResolved ? "No resolved alerts." : "No open alerts — all clear."}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {alerts?.map((a) => (
          <div key={a.id} className="glass flex items-center gap-3 rounded-xl p-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${SEVERITY_STYLES[a.severity]}`}>
              <ShieldAlert size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white/85">{a.message}</p>
              <p className="text-xs text-text-faint">{a.type.replace(/_/g, " ")}</p>
            </div>
            <span className="shrink-0 text-xs text-text-faint">{timeAgo(a.created_at)}</span>
            {!a.resolved && (
              <button
                type="button"
                onClick={() => resolve(a.id)}
                disabled={busyId === a.id}
                className="glass ml-2 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white disabled:opacity-50"
              >
                <Check size={12} /> Resolve
              </button>
            )}
          </div>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-text-faint">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="glass rounded-full px-4 py-2 font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="glass rounded-full px-4 py-2 font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
