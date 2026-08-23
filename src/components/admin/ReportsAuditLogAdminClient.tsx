"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, History } from "lucide-react";
import { fetchGlobalAuditLogAdmin, type ReportAuditEntryRow } from "@/lib/supabase/admin-content";

const PAGE_SIZE = 50;

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

const ACTION_LABELS: Record<string, string> = {
  status_changed: "changed status",
  assignee_changed: "reassigned",
  priority_changed: "changed priority",
  category_changed: "changed category",
  note_added: "added a note",
  action_taken: "recorded an action",
  case_logged: "logged a case",
};

/** Admin → Reports → Administration → Audit Log. Site-wide trail of every
 * change made across every report/case — status, assignment, priority,
 * category, notes, and actions taken. See report_audit_log in
 * supabase/migrations/0015_reports_moderation.sql. */
export function ReportsAuditLogAdminClient() {
  const [entries, setEntries] = useState<ReportAuditEntryRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number) => {
    setError(null);
    try {
      const result = await fetchGlobalAuditLogAdmin(nextPage);
      setEntries(result.entries);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the audit log.");
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Audit Log</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          {entries ? `${total} entr${total === 1 ? "y" : "ies"}` : "Loading…"} — every status, assignment, note, and
          action across every report.
        </p>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {entries === null && (
        <div className="flex items-center justify-center py-20 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {entries?.length === 0 && (
        <div className="glass rounded-xl px-4 py-10 text-center text-text-faint">No audit entries yet.</div>
      )}

      <div className="flex flex-col gap-2">
        {entries?.map((e) => (
          <div key={e.id} className="glass flex items-center gap-3 rounded-xl p-3">
            <History size={14} className="shrink-0 text-text-faint" />
            <p className="text-sm text-white/85">
              <span className="font-semibold text-white">{e.actor_name}</span> {ACTION_LABELS[e.action] ?? e.action}
              {e.details && Object.keys(e.details).length > 0 && (
                <span className="text-text-faint"> — {JSON.stringify(e.details)}</span>
              )}
            </p>
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
