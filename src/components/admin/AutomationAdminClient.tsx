"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Play,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Circle,
  Bell,
  ScrollText,
  Download,
} from "lucide-react";
import {
  fetchAutomationJobs,
  updateAutomationJob,
  runAutomationJob,
  fetchAutomationNotifications,
  markNotificationsRead,
  type AutomationJob,
  type AutomationNotification,
} from "@/lib/supabase/automation-content";

const CATEGORY_ORDER = ["Publishing", "Import", "Media", "Health", "SEO", "Infra", "Security", "Maintenance", "Notifications"];

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
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

function timeUntil(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "due now";
  const min = Math.round(ms / 60000);
  if (min < 60) return `in ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ${hr}h`;
  return `in ${Math.round(hr / 24)}d`;
}

function StatusBadge({ status }: { status: AutomationJob["last_status"] }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-text-faint">
        <Circle size={10} /> Never run
      </span>
    );
  }
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    success: { cls: "bg-emerald-500/15 text-emerald-400", icon: <CheckCircle2 size={12} />, label: "Success" },
    partial: { cls: "bg-amber-500/15 text-amber-400", icon: <AlertTriangle size={12} />, label: "Partial" },
    failed: { cls: "bg-hot/15 text-hot", icon: <XCircle size={12} />, label: "Failed" },
    running: { cls: "bg-blue-500/15 text-blue-400", icon: <Loader2 size={12} className="animate-spin" />, label: "Running" },
  };
  const m = map[status] ?? map.success;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${m.cls}`}>
      {m.icon} {m.label}
    </span>
  );
}

function ConfigEditor({
  config,
  onSave,
}: {
  config: Record<string, unknown>;
  onSave: (next: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(config);
  const [saving, setSaving] = useState(false);
  const entries = Object.entries(draft);

  if (entries.length === 0) return <p className="text-xs text-text-faint">No configurable options for this job.</p>;

  return (
    <div className="flex flex-col gap-2">
      {entries.map(([k, v]) => (
        <label key={k} className="flex items-center justify-between gap-3 text-xs">
          <span className="font-mono text-text-faint">{k}</span>
          {typeof v === "boolean" ? (
            <input
              type="checkbox"
              checked={v}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.checked }))}
              className="h-4 w-4"
            />
          ) : typeof v === "number" ? (
            <input
              type="number"
              value={v}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: Number(e.target.value) }))}
              className="w-28 rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-2 py-1 text-right text-white"
            />
          ) : (
            <input
              type="text"
              value={String(v ?? "")}
              onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
              className="w-56 rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-2 py-1 text-white"
            />
          )}
        </label>
      ))}
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(draft);
          } finally {
            setSaving(false);
          }
        }}
        className="mt-1 self-start rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
    </div>
  );
}

function JobCard({
  job,
  onToggle,
  onScheduleChange,
  onConfigSave,
  onRun,
}: {
  job: AutomationJob;
  onToggle: (job: AutomationJob) => void;
  onScheduleChange: (job: AutomationJob, cron: string) => void;
  onConfigSave: (job: AutomationJob, config: Record<string, unknown>) => Promise<void>;
  onRun: (job: AutomationJob) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [cronDraft, setCronDraft] = useState(job.schedule_cron);
  const [running, setRunning] = useState(false);

  const summaryPreview = useMemo(() => {
    if (!job.last_summary) return null;
    const entries = Object.entries(job.last_summary).filter(([, v]) => typeof v === "number" || typeof v === "string");
    return entries.slice(0, 4);
  }, [job.last_summary]);

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-sm font-bold text-white">{job.name}</p>
            <StatusBadge status={job.last_status} />
          </div>
          <p className="mt-1 text-xs text-text-faint">{job.description}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-faint">
            <span>Last run: {timeAgo(job.last_run_at)}</span>
            {job.enabled && <span>Next: {timeUntil(job.next_run_at)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              setRunning(true);
              try {
                await onRun(job);
              } finally {
                setRunning(false);
              }
            }}
            disabled={running}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/20 disabled:opacity-60"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Run now
          </button>
          <button
            type="button"
            onClick={() => onToggle(job)}
            role="switch"
            aria-checked={job.enabled}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              job.enabled ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                job.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-full p-1.5 text-text-faint transition-colors hover:bg-white/10 hover:text-white"
          >
            <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {!open && summaryPreview && summaryPreview.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-[var(--color-surface-border)] px-4 py-2">
          {summaryPreview.map(([k, v]) => (
            <span key={k} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-text-faint">
              {k}: <span className="font-semibold text-white/80">{String(v)}</span>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="border-t border-[var(--color-surface-border)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-text-faint">Schedule (cron)</span>
            <input
              value={cronDraft}
              onChange={(e) => setCronDraft(e.target.value)}
              onBlur={() => cronDraft !== job.schedule_cron && onScheduleChange(job, cronDraft)}
              className="w-40 rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-2 py-1 font-mono text-xs text-white"
            />
            <Link
              href={`/admin/automation/logs?jobKey=${job.key}`}
              className="ml-auto flex items-center gap-1 text-xs font-semibold text-text-faint hover:text-white"
            >
              <ScrollText size={13} /> View logs
            </Link>
          </div>
          <ConfigEditor config={job.config} onSave={(cfg) => onConfigSave(job, cfg)} />
          {job.last_summary && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-text-faint hover:text-white">
                Last run summary (raw)
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] text-white/70">
                {JSON.stringify(job.last_summary, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

/** Admin → Automation — the Cron Job Manager: every automation feature as
 * a toggleable, schedulable job with a manual "Run now" and its last
 * result inline. See supabase/migrations/0016_automation.sql for the
 * job registry and src/lib/automation/* for what each job actually does. */
export function AutomationAdminClient() {
  const [jobs, setJobs] = useState<AutomationJob[] | null>(null);
  const [notifications, setNotifications] = useState<AutomationNotification[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [j, n] = await Promise.all([fetchAutomationJobs(), fetchAutomationNotifications(true)]);
      setJobs(j);
      setNotifications(n);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load automation jobs.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(job: AutomationJob) {
    setJobs((js) => js?.map((j) => (j.key === job.key ? { ...j, enabled: !j.enabled } : j)) ?? js);
    try {
      const updated = await updateAutomationJob(job.key, { enabled: !job.enabled });
      setJobs((js) => js?.map((j) => (j.key === job.key ? updated : j)) ?? js);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update job.");
      await load();
    }
  }

  async function handleScheduleChange(job: AutomationJob, cron: string) {
    try {
      const updated = await updateAutomationJob(job.key, { schedule_cron: cron });
      setJobs((js) => js?.map((j) => (j.key === job.key ? updated : j)) ?? js);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid schedule.");
      await load();
    }
  }

  async function handleConfigSave(job: AutomationJob, config: Record<string, unknown>) {
    try {
      const updated = await updateAutomationJob(job.key, { config });
      setJobs((js) => js?.map((j) => (j.key === job.key ? updated : j)) ?? js);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    }
  }

  async function handleRun(job: AutomationJob) {
    try {
      await runAutomationJob(job.key);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Job run failed.");
      await load();
    }
  }

  async function dismissNotifications() {
    if (notifications.length === 0) return;
    await markNotificationsRead(notifications.map((n) => n.id));
    setNotifications([]);
  }

  const grouped = useMemo(() => {
    if (!jobs) return [];
    const byCategory = new Map<string, AutomationJob[]>();
    for (const job of jobs) {
      byCategory.set(job.category, [...(byCategory.get(job.category) ?? []), job]);
    }
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({ category: c, jobs: byCategory.get(c)! }));
  }, [jobs]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Automation</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Every job runs on its own schedule via the automation cron endpoint — toggle, reschedule, or run any of
            them manually below.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/admin/automation/imports"
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20"
          >
            <Download size={15} /> Import manager
          </Link>
          <Link
            href="/admin/automation/logs"
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20"
          >
            <ScrollText size={15} /> Job logs
          </Link>
        </div>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {notifications.length > 0 && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl bg-hot/10 px-4 py-3">
          <div className="flex items-start gap-2">
            <Bell size={16} className="mt-0.5 shrink-0 text-hot" />
            <div className="flex flex-col gap-1 text-sm text-white/90">
              {notifications.slice(0, 5).map((n) => (
                <p key={n.id}>{n.message}</p>
              ))}
            </div>
          </div>
          <button type="button" onClick={dismissNotifications} className="shrink-0 text-xs font-bold text-hot hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {jobs === null && (
        <div className="flex items-center justify-center py-20 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      <div className="flex flex-col gap-8">
        {grouped.map(({ category, jobs: categoryJobs }) => (
          <div key={category}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-text-faint">{category}</h2>
            <div className="flex flex-col gap-3">
              {categoryJobs.map((job) => (
                <JobCard
                  key={job.key}
                  job={job}
                  onToggle={handleToggle}
                  onScheduleChange={handleScheduleChange}
                  onConfigSave={handleConfigSave}
                  onRun={handleRun}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
