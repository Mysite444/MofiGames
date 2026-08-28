"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, ShieldCheck } from "lucide-react";

const PAGE_SIZE = 50;

interface AdminActionLogRow {
  id: string;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  summary: string;
  created_at: string;
}

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

function actionLabel(action: string): string {
  return action
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Admin → Security → Action Log. The site-wide trail of admin actions
 * that don't already have a dedicated log elsewhere — security settings,
 * access rules, API keys, backups, the role/permission matrix, site
 * identity, and destructive content changes. See
 * supabase/migrations/0060_admin_action_log.sql. User-management actions
 * (ban/verify/role change) live in Activity instead; report actions live
 * in Reports → Administration → Audit Log. */
export function SecurityActionLogAdminClient() {
  const [entries, setEntries] = useState<AdminActionLogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number, search: string) => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      if (search) params.set("q", search);
      const res = await fetch(`/api/admin/security/action-log?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load the action log.");
      setEntries(data.entries);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the action log.");
    }
  }, []);

  useEffect(() => {
    load(page, q);
  }, [load, page, q]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Action Log</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          {entries ? `${total} action${total === 1 ? "" : "s"}` : "Loading…"} — security settings, access rules,
          API keys, backups, roles, and destructive content changes.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="glass flex items-center gap-2 rounded-full px-3.5 py-2">
          <Search size={14} className="text-text-faint" />
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Search by admin or summary"
            className="bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none"
          />
        </div>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {entries === null && (
        <div className="flex items-center justify-center py-20 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {entries?.length === 0 && (
        <div className="glass rounded-xl px-4 py-10 text-center text-text-faint">No admin actions match.</div>
      )}

      <div className="flex flex-col gap-2">
        {entries?.map((e) => (
          <div key={e.id} className="glass flex items-center gap-3 rounded-xl p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-menu-yellow)]/15 text-[var(--color-menu-yellow)]">
              <ShieldCheck size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white/85">
                <span className="font-semibold text-white">{e.actor_email ?? "Unknown admin"}</span>{" "}
                {actionLabel(e.action).toLowerCase()}
                {e.summary ? ` — ${e.summary}` : ""}
              </p>
              {(e.target_type || e.target_id) && (
                <p className="truncate text-xs text-text-faint">
                  {e.target_type ?? "target"}
                  {e.target_id ? ` · ${e.target_id}` : ""}
                </p>
              )}
            </div>
            <span className="ml-auto shrink-0 text-xs text-text-faint">{timeAgo(e.created_at)}</span>
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
