"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, XCircle, AlertTriangle, Loader } from "lucide-react";
import { fetchAutomationJobs, fetchAutomationRuns, type AutomationJob, type AutomationJobRun } from "@/lib/supabase/automation-content";

const STATUS_OPTIONS = ["", "success", "partial", "failed", "running"] as const;

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

function StatusIcon({ status }: { status: AutomationJobRun["status"] }) {
  if (status === "success") return <CheckCircle2 size={14} className="text-emerald-400" />;
  if (status === "partial") return <AlertTriangle size={14} className="text-amber-400" />;
  if (status === "failed") return <XCircle size={14} className="text-hot" />;
  return <Loader size={14} className="animate-spin text-blue-400" />;
}

/** Admin → Automation → Job Logs — the Task Queue & Job Log. Every job
 * run, whether triggered by cron or an admin. Filtering by ?jobKey=
 * doubles this as the Import Logs / Import History / Import Error
 * Reports view when linked from the Imports page. */
export function AutomationLogsAdminClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const jobKey = searchParams.get("jobKey") ?? "";
  const status = searchParams.get("status") ?? "";
  const page = Number(searchParams.get("page") ?? "1");

  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [runs, setRuns] = useState<AutomationJobRun[] | null>(null);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAutomationJobs().then(setJobs).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await fetchAutomationRuns({ page, jobKey: jobKey || undefined, status: status || undefined });
      setRuns(result.runs);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load job logs.");
    }
  }, [page, jobKey, status]);

  useEffect(() => {
    load();
  }, [load]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  const totalPages = Math.max(1, Math.ceil(total / 30));
  const jobName = jobs.find((j) => j.key === jobKey)?.name;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Automation — Job Logs</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          {jobName ? `${jobName} — ` : ""}
          {total} run{total === 1 ? "" : "s"} logged.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={jobKey}
          onChange={(e) => setParam("jobKey", e.target.value)}
          className="rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-3 py-2 text-xs text-white"
        >
          <option value="">All jobs</option>
          {jobs.map((j) => (
            <option key={j.key} value={j.key}>
              {j.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          className="rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-3 py-2 text-xs text-white"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? s[0].toUpperCase() + s.slice(1) : "All statuses"}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {runs === null && (
        <div className="flex items-center justify-center py-20 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {runs?.length === 0 && <div className="glass rounded-xl px-4 py-10 text-center text-text-faint">No runs yet.</div>}

      <div className="flex flex-col gap-2">
        {runs?.map((r) => (
          <div key={r.id} className="glass overflow-hidden rounded-xl">
            <button
              type="button"
              onClick={() => setExpanded((id) => (id === r.id ? null : r.id))}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <StatusIcon status={r.status} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {jobs.find((j) => j.key === r.job_key)?.name ?? r.job_key}
                  </p>
                  <p className="text-[11px] text-text-faint">
                    {timeAgo(r.started_at)} · {r.triggered_by} · {r.items_ok}/{r.items_processed} ok
                    {r.duration_ms != null ? ` · ${(r.duration_ms / 1000).toFixed(1)}s` : ""}
                  </p>
                </div>
              </div>
              {r.error && <span className="shrink-0 truncate text-xs text-hot">{r.error}</span>}
            </button>
            {expanded === r.id && (
              <pre className="max-h-80 overflow-auto border-t border-[var(--color-surface-border)] bg-black/30 p-3 text-[11px] text-white/70">
                {JSON.stringify(r.summary, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>

      {total > 30 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-text-faint">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setParam("page", String(page - 1))}
            className="rounded-full p-1.5 hover:bg-white/10 disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          Page {page} of {totalPages}
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setParam("page", String(page + 1))}
            className="rounded-full p-1.5 hover:bg-white/10 disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
