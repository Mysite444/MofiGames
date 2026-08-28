"use client";

import { useEffect, useState } from "react";
import { Loader2, PlayCircle, RefreshCw, ChevronDown, CheckCircle2, AlertTriangle, XCircle, Wrench } from "lucide-react";

interface CheckResult {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

interface MaintenanceJob {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  last_run_at: string | null;
  last_status: "success" | "partial" | "failed" | null;
  last_summary: { checks?: CheckResult[]; failed?: number; warned?: number } | null;
}

const STATUS_ICON: Record<CheckResult["status"], React.ReactNode> = {
  pass: <CheckCircle2 size={15} className="text-emerald-400" />,
  warn: <AlertTriangle size={15} className="text-amber-400" />,
  fail: <XCircle size={15} className="text-hot" />,
};

const JOB_STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-400",
  partial: "bg-amber-500/15 text-amber-400",
  failed: "bg-hot/15 text-hot",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "never run";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function JobCard({ job, onRun, running }: { job: MaintenanceJob; onRun: (key: string) => void; running: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const checks = job.last_summary?.checks ?? [];
  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-white">{job.name}</h3>
            {job.last_status && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${JOB_STATUS_STYLES[job.last_status]}`}>
                {job.last_status}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-text-faint">{job.description}</p>
          <p className="mt-1.5 text-xs text-text-faint">
            Last run {timeAgo(job.last_run_at)}
            {checks.length > 0 && (
              <>
                {" · "}
                {checks.length} check{checks.length === 1 ? "" : "s"}
                {failed > 0 && <span className="text-hot"> · {failed} failing</span>}
                {warned > 0 && <span className="text-amber-400"> · {warned} warning{warned === 1 ? "" : "s"}</span>}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRun(job.key)}
          disabled={running}
          className="glow-yellow-button flex shrink-0 items-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
          {running ? "Running…" : "Run now"}
        </button>
      </div>

      {checks.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-white/70 hover:text-white"
          >
            <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "Hide details" : "Show details"}
          </button>

          {expanded && (
            <div className="mt-2 flex flex-col gap-1.5">
              {checks.map((c) => (
                <div key={c.id} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <span className="mt-0.5 shrink-0">{STATUS_ICON[c.status]}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white">{c.label}</p>
                    <p className="text-xs text-text-faint">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Admin → Security → Maintenance. Phase 5 — Security Health Check,
 * Dependency Security Check, System Integrity Check. All three are
 * ordinary automation jobs (see src/lib/automation/maintenance-executors.ts
 * and migration 0021_maintenance.sql); this page reads their last-run
 * summary and lets an admin re-run any of them on demand, the same
 * "Run now" endpoint the generic Automation dashboard uses. */
export function SecurityMaintenanceAdminClient() {
  const [jobs, setJobs] = useState<MaintenanceJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningKey, setRunningKey] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/security/maintenance");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load maintenance checks.");
      setJobs(data.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load maintenance checks.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function run(key: string) {
    setRunningKey(key);
    setError(null);
    try {
      const res = await fetch(`/api/admin/automation/jobs/${key}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed.");
    } finally {
      setRunningKey(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Maintenance</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Security Scanner, Dependency Security Check, and System Integrity Check. Each runs on its own schedule
            (Admin → Automation) or on demand here.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="glass flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white/80 hover:text-white"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {jobs === null && (
        <div className="flex items-center justify-center py-16 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {jobs?.length === 0 && (
        <div className="glass flex flex-col items-center gap-2 rounded-xl px-4 py-10 text-center text-text-faint">
          <Wrench size={20} />
          Maintenance jobs aren&apos;t seeded yet — run migration 0021_maintenance.sql.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {jobs?.map((job) => (
          <JobCard key={job.key} job={job} onRun={run} running={runningKey === job.key} />
        ))}
      </div>
    </div>
  );
}
