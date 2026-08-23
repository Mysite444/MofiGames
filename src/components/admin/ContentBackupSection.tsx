"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Download,
  Upload,
  RefreshCw,
  Database,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface CatalogGroup {
  id: string;
  label: string;
  description: string;
  tables: { name: string; estimatedRows: number | null; existsInSchema: boolean }[];
}
interface CatalogResponse {
  groups: CatalogGroup[];
  missingFromRegistry: string[];
  needsReview: { name: string; estimatedRows: number }[];
  excludedCount: number;
  excludedReasons: Record<string, string>;
}

interface ExportHistoryRow {
  id: string;
  filename: string;
  size_bytes: number;
  backup_version: number;
  tables: Record<string, number>;
  warnings: string[];
  created_by_email: string | null;
  created_at: string;
}
interface RestoreHistoryRow {
  id: string;
  filename: string;
  status: "running" | "success" | "partial" | "failed";
  row_counts: Record<string, { inserted: number; updated: number; skipped: number; failed: number }>;
  warnings: string[];
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

interface ValidatePreview {
  ok: boolean;
  manifest?: { backupVersion: number; createdAt: string; sourceEnvironment: string; tables: { name: string; rowCount: number }[] };
  order?: string[];
  plan?: { table: string; rowCount: number }[];
  errors?: string[];
  warnings: string[];
}

interface RestoreResult {
  ok: boolean;
  status: "success" | "partial" | "failed";
  results: { table: string; rowCount: number; inserted: number; updated: number; skipped: number; failed: number; errors: { error: string }[] }[];
  totals: { inserted: number; updated: number; skipped: number; failed: number };
  warnings: string[];
}

function formatSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeStorageKey(filename: string): string {
  const cleaned = filename.replace(/[^\w.\-]/g, "_");
  return `uploads/${Date.now()}-${cleaned}`;
}

export function ContentBackupSection() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);
  const [exports, setExports] = useState<ExportHistoryRow[] | null>(null);
  const [restores, setRestores] = useState<RestoreHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<ValidatePreview | null>(null);
  const [pendingStorageKey, setPendingStorageKey] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backup/content/catalog");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load table catalog.");
      setCatalog(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load table catalog.");
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backup/content/history");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load backup history.");
      setExports(data.exports);
      setRestores(data.restores);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load backup history.");
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    loadHistory();
  }, [loadCatalog, loadHistory]);

  async function downloadBackup() {
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/backup/content/export", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backup failed.");
      if (data.downloadUrl) window.open(data.downloadUrl, "_blank");
      setNotice(`Backup "${data.filename}" created (${formatSize(data.sizeBytes)}, ${data.tables.length} tables).`);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed.");
    } finally {
      setExporting(false);
    }
  }

  async function handleFileSelected(file: File) {
    setUploading(true);
    setError(null);
    setNotice(null);
    setPreview(null);
    setRestoreResult(null);
    try {
      const supabase = createClient();
      const storageKey = safeStorageKey(file.name);
      const { error: uploadError } = await supabase.storage.from("content-backups").upload(storageKey, file, {
        contentType: "application/json",
      });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const res = await fetch("/api/admin/backup/content/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey }),
      });
      const data: ValidatePreview = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Validation failed.");
      setPreview(data);
      setPendingStorageKey(storageKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmRestore() {
    if (!pendingStorageKey) return;
    setRestoring(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/backup/content/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey: pendingStorageKey, dryRun: false }),
      });
      const data: RestoreResult = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error?: string }).error ?? "Restore failed.");
      setRestoreResult(data);
      setPreview(null);
      setPendingStorageKey(null);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(false);
    }
  }

  function cancelPreview() {
    setPreview(null);
    setPendingStorageKey(null);
  }

  const totalTables = catalog?.groups.reduce((n, g) => n + g.tables.filter((t) => t.existsInSchema).length, 0) ?? 0;
  const lastExport = exports?.[0];

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Database size={18} className="text-[var(--color-menu-yellow)]" />
            Site Content Backup
          </h2>
          <p className="mt-0.5 text-sm text-text-faint">Back up and restore your site&apos;s content and database records.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              loadCatalog();
              loadHistory();
            }}
            className="glass flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white/80 hover:text-white"
            aria-label="Refresh"
          >
            <RefreshCw size={15} />
          </button>
          <button
            type="button"
            onClick={downloadBackup}
            disabled={exporting}
            className="glow-yellow-button flex shrink-0 items-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {exporting ? "Backing up…" : "Download Content Backup"}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="glass flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white/85 hover:text-white disabled:opacity-60"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? "Validating…" : "Upload Content Backup"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
            }}
          />
        </div>
      </div>

      {notice && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-medium text-emerald-400">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> {notice}
        </div>
      )}
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">
          <XCircle size={16} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {/* Last-backup summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass-strong rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-text-faint">Last backup</p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            {lastExport ? new Date(lastExport.created_at).toLocaleString() : "Never"}
          </p>
        </div>
        <div className="glass-strong rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-text-faint">Size</p>
          <p className="mt-0.5 text-sm font-semibold text-white">{formatSize(lastExport?.size_bytes)}</p>
        </div>
        <div className="glass-strong rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-text-faint">Backup version</p>
          <p className="mt-0.5 text-sm font-semibold text-white">{lastExport?.backup_version ?? "—"}</p>
        </div>
        <div className="glass-strong rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-text-faint">Tables covered</p>
          <p className="mt-0.5 text-sm font-semibold text-white">{totalTables || "—"}</p>
        </div>
      </div>

      {/* Catalog audit view */}
      <button
        type="button"
        onClick={() => setShowCatalog((v) => !v)}
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-text-faint hover:text-white"
      >
        {showCatalog ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {catalog
          ? `${totalTables} tables detected for backup, ${catalog.excludedCount} excluded${
              catalog.needsReview.length ? `, ${catalog.needsReview.length} need review` : ""
            }`
          : "Loading table catalog…"}
      </button>
      {showCatalog && catalog && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-white/10 p-3">
          {catalog.groups.map((g) => (
            <div key={g.id}>
              <p className="text-xs font-bold text-white">{g.label}</p>
              <p className="text-[11px] text-text-faint">{g.description}</p>
              <p className="mt-1 text-[11px] text-text-faint">
                {g.tables.map((t) => `${t.name}${t.existsInSchema ? ` (${t.estimatedRows ?? 0})` : " (missing)"}`).join(", ")}
              </p>
            </div>
          ))}
          {catalog.needsReview.length > 0 && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                <AlertTriangle size={13} /> Needs review — not backed up automatically
              </p>
              <p className="mt-1 text-[11px] text-text-faint">
                {catalog.needsReview.map((t) => `${t.name} (${t.estimatedRows})`).join(", ")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Upload validation / restore-confirmation preview */}
      {preview && (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          {!preview.ok ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-bold text-hot">
                <XCircle size={15} /> This backup can&apos;t be restored
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs text-text-faint">
                {preview.errors?.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
              <button type="button" onClick={cancelPreview} className="mt-3 text-xs font-semibold text-text-faint hover:text-white">
                Dismiss
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-white">Restore preview</p>
              <p className="mt-0.5 text-xs text-text-faint">
                Backup v{preview.manifest?.backupVersion} from {preview.manifest?.sourceEnvironment}, created{" "}
                {preview.manifest?.createdAt ? new Date(preview.manifest.createdAt).toLocaleString() : "unknown time"}.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {preview.plan?.map((p) => (
                  <span key={p.table} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/85">
                    {p.table}: {p.rowCount.toLocaleString()} rows
                  </span>
                ))}
              </div>
              {preview.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-[11px] text-amber-400">
                  {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={confirmRestore}
                  disabled={restoring}
                  className="rounded-full bg-hot px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  {restoring ? "Restoring…" : "Confirm restore"}
                </button>
                <button type="button" onClick={cancelPreview} className="text-xs font-semibold text-text-faint hover:text-white">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {restoreResult && (
        <div className="mb-4 rounded-xl border border-white/10 p-4">
          <p
            className={`flex items-center gap-1.5 text-sm font-bold ${
              restoreResult.status === "success" ? "text-emerald-400" : restoreResult.status === "partial" ? "text-amber-400" : "text-hot"
            }`}
          >
            {restoreResult.status === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            Restore {restoreResult.status}: +{restoreResult.totals.inserted} inserted, {restoreResult.totals.updated} updated,{" "}
            {restoreResult.totals.skipped} skipped, {restoreResult.totals.failed} failed
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {restoreResult.results.map((r) => (
              <span key={r.table} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/85">
                {r.table}: +{r.inserted}/{r.updated}✓/{r.skipped}↷/{r.failed}✗
              </span>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {restores && restores.length > 0 && (
        <div className="mt-2">
          <p className="mb-2 text-xs font-bold text-white">Restore history</p>
          <div className="flex flex-col gap-1.5">
            {restores.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                <span className="truncate text-white/80">{r.filename}</span>
                <span
                  className={
                    r.status === "success"
                      ? "text-emerald-400"
                      : r.status === "partial"
                        ? "text-amber-400"
                        : r.status === "failed"
                          ? "text-hot"
                          : "text-text-faint"
                  }
                >
                  {r.status}
                </span>
                <span className="text-text-faint">{new Date(r.started_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
