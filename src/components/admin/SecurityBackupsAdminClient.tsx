"use client";

import { useEffect, useState } from "react";
import { Loader2, Download, Trash2, RefreshCw, Lock, LockOpen, HardDriveDownload, PlayCircle } from "lucide-react";

interface BackupRow {
  name: string;
  sizeBytes: number | null;
  createdAt: string | null;
  encrypted: boolean;
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Admin → Security → Backups. Manual/scheduled backups already run via
 * the `scheduled_backups` automation job (Admin → Automation) writing to
 * the automation-backups storage bucket — this page is the dedicated
 * view for that bucket: browse, download, delete, and (the genuinely new
 * part) restore. See supabase/migrations/0016_automation.sql for the
 * backup pipeline itself and 0020_backup_recovery.sql for the restore
 * audit trail. */
export function SecurityBackupsAdminClient() {
  const [backups, setBackups] = useState<BackupRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [restoreResult, setRestoreResult] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/security/backups");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load backups.");
      setBackups(data.backups);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load backups.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function runBackupNow() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/automation/jobs/scheduled_backups/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backup failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed.");
    } finally {
      setRunning(false);
    }
  }

  async function download(name: string) {
    setBusyName(name);
    try {
      const res = await fetch(`/api/admin/security/backups/${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create download link.");
      window.open(data.url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download.");
    } finally {
      setBusyName(null);
    }
  }

  async function remove(name: string) {
    if (!window.confirm(`Delete backup "${name}"? This can't be undone.`)) return;
    setBusyName(name);
    try {
      const res = await fetch(`/api/admin/security/backups/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete backup.");
      }
      setBackups((prev) => (prev ? prev.filter((b) => b.name !== name) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setBusyName(null);
    }
  }

  async function restore(name: string) {
    setBusyName(name);
    setRestoreResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/security/backups/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restore failed.");
      setRestoreResult(
        `Restored from "${name}": ${Object.entries(data.rowCounts as Record<string, number>)
          .map(([t, n]) => `${n} ${t}`)
          .join(", ")}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setBusyName(null);
      setConfirmRestore(null);
      setConfirmText("");
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Backups</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Games, categories, tags, pages, and posts — exported to <code>automation-backups</code> storage.
            Scheduling lives in Admin → Automation (job: Scheduled Backups).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="glass flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white/80 hover:text-white"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            onClick={runBackupNow}
            disabled={running}
            className="glow-yellow-button flex shrink-0 items-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {running ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16} />}
            {running ? "Backing up…" : "Back up now"}
          </button>
        </div>
      </div>

      {restoreResult && (
        <div className="mb-4 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-400">
          {restoreResult}
        </div>
      )}
      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {backups === null && (
        <div className="flex items-center justify-center py-16 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {backups?.length === 0 && (
        <div className="glass flex flex-col items-center gap-2 rounded-xl px-4 py-10 text-center text-text-faint">
          <HardDriveDownload size={20} />
          No backups yet — run one now, or wait for the next scheduled run.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {backups?.map((b) => (
          <div key={b.name} className="glass flex flex-wrap items-center gap-3 rounded-xl p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-text-faint">
              {b.encrypted ? <Lock size={15} /> : <LockOpen size={15} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{b.name}</p>
              <p className="text-xs text-text-faint">
                {formatSize(b.sizeBytes)} · {b.createdAt ? new Date(b.createdAt).toLocaleString() : "unknown date"}
                {b.encrypted ? " · encrypted" : ""}
              </p>
            </div>

            {confirmRestore === b.name ? (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder='Type "restore" to confirm'
                  className="glass-strong rounded-full px-3.5 py-2 text-xs text-white placeholder:text-text-faint focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => restore(b.name)}
                  disabled={confirmText !== "restore" || busyName === b.name}
                  className="rounded-full bg-hot px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  {busyName === b.name ? "Restoring…" : "Confirm restore"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRestore(null);
                    setConfirmText("");
                  }}
                  className="text-xs font-semibold text-text-faint hover:text-white"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => download(b.name)}
                  disabled={busyName === b.name}
                  className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white disabled:opacity-50"
                >
                  <Download size={12} /> Download
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRestore(b.name)}
                  disabled={busyName === b.name}
                  className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-amber-400 disabled:opacity-50"
                >
                  <HardDriveDownload size={12} /> Restore
                </button>
                <button
                  type="button"
                  onClick={() => remove(b.name)}
                  disabled={busyName === b.name}
                  className="glass shrink-0 rounded-full p-2 text-text-faint hover:text-hot disabled:opacity-50"
                  aria-label="Delete backup"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-text-faint">
        Restore merges the backup back in (updates rows that still exist, re-creates rows that don&apos;t) — it
        never deletes anything, so it can&apos;t undo a deletion by itself. Set <code>BACKUP_ENCRYPTION_KEY</code>{" "}
        in your deployment environment to encrypt future backups at rest.
      </p>
    </div>
  );
}
