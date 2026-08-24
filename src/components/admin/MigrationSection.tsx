"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Download,
  Upload,
  RefreshCw,
  Rocket,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface CatalogResponse {
  tables: { name: string; estimatedRows: number }[];
  storageBuckets: { id: string; public: boolean; objectCount: number; totalBytes: number }[];
  totalStorageBytes: number;
  applicationVersion: string;
  nextVersion: string;
  warnings: string[];
}

interface MigrationRun {
  id: string;
  kind: "export" | "import" | "import_dry_run";
  status: "running" | "success" | "partial" | "failed";
  filename: string | null;
  size_bytes: number | null;
  manifest: { applicationVersion?: string; databaseSchemaVersion?: string; includesStorage?: boolean; includesStorageFiles?: boolean } | null;
  warnings: string[];
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

interface ValidatePreview {
  ok: boolean;
  manifest?: {
    backupVersion: number;
    applicationVersion: string;
    databaseSchemaVersion: string;
    createdAt: string;
    sourceEnvironment: string;
    includesStorage: boolean;
    includesStorageFiles: boolean;
  };
  currentSchemaVersion?: string;
  rowPlan?: { table: string; rowCount: number }[];
  bucketsToCreate?: string[];
  errors?: string[];
  warnings: string[];
}

interface RestoreResult {
  ok: boolean;
  status: "success" | "partial" | "failed";
  results: { table: string; inserted: number; updated: number; skipped: number; failed: number }[];
  totals: { inserted: number; updated: number; skipped: number; failed: number };
  bucketsCreated: string[];
  bucketErrors: { bucket: string; error: string }[];
  warnings: string[];
  applicationFilesNote: string;
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

const STORAGE_FILE_THRESHOLD_BYTES = 200 * 1024 * 1024;

export function MigrationSection() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [runs, setRuns] = useState<MigrationRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [includeStorageFiles, setIncludeStorageFiles] = useState(true);
  const [preview, setPreview] = useState<ValidatePreview | null>(null);
  const [pendingStorageKey, setPendingStorageKey] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backup/migration/catalog");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load migration catalog.");
      setCatalog(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load migration catalog.");
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/backup/migration/history");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load migration history.");
      setRuns(data.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load migration history.");
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    loadHistory();
  }, [loadCatalog, loadHistory]);

  const storageOverThreshold = (catalog?.totalStorageBytes ?? 0) > STORAGE_FILE_THRESHOLD_BYTES;

  async function downloadMigration() {
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/backup/migration/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeStorageFiles: includeStorageFiles && !storageOverThreshold }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Migration export failed.");
      if (data.downloadUrl) window.open(data.downloadUrl, "_blank");
      setNotice(`Migration package "${data.filename}" created (${formatSize(data.sizeBytes)}).`);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Migration export failed.");
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
      const { error: uploadError } = await supabase.storage.from("site-migrations").upload(storageKey, file, {
        contentType: "application/zip",
      });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const res = await fetch("/api/admin/backup/migration/validate", {
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
      const res = await fetch("/api/admin/backup/migration/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey: pendingStorageKey, dryRun: false, createMissingBuckets: true }),
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

  const lastExport = runs?.find((r) => r.kind === "export" && r.status === "success");

  return (
    <section className="glass rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Rocket size={18} className="text-[var(--color-menu-yellow)]" />
            Complete Site Migration
          </h2>
          <p className="mt-0.5 text-sm text-text-faint">
            Export or restore the complete application, database structure, database data, and supported storage
            configuration.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            onClick={downloadMigration}
            disabled={exporting}
            className="glow-yellow-button flex shrink-0 items-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {exporting ? "Building package…" : "Download Complete Migration"}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="glass flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white/85 hover:text-white disabled:opacity-60"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? "Validating…" : "Upload Complete Migration"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
            }}
          />
        </div>
      </div>

      <label className="mb-4 flex items-center gap-2 text-xs text-text-faint">
        <input
          type="checkbox"
          checked={includeStorageFiles}
          disabled={storageOverThreshold}
          onChange={(e) => setIncludeStorageFiles(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-white/30"
        />
        Include storage file bytes in the ZIP
        {catalog && (
          <span>
            ({formatSize(catalog.totalStorageBytes)} across {catalog.storageBuckets.length} bucket(s)
            {storageOverThreshold ? " — over the 200MB inline limit, manifest only, see storage/README.md in the ZIP" : ""})
          </span>
        )}
      </label>

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

      {/* Last-package summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="glass-strong rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-text-faint">Last migration package</p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white">{lastExport?.filename ?? "Never"}</p>
        </div>
        <div className="glass-strong rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-text-faint">Package size</p>
          <p className="mt-0.5 text-sm font-semibold text-white">{formatSize(lastExport?.size_bytes)}</p>
        </div>
        <div className="glass-strong rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-text-faint">App / DB version</p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            {lastExport?.manifest?.applicationVersion ?? "—"} / {lastExport?.manifest?.databaseSchemaVersion ?? "—"}
          </p>
        </div>
        <div className="glass-strong rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-text-faint">Storage included</p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            {lastExport?.manifest?.includesStorage ? (lastExport.manifest.includesStorageFiles ? "Files + config" : "Config only") : "No"}
          </p>
        </div>
      </div>

      {/* Upload validation / restore-confirmation preview */}
      {preview && (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          {!preview.ok ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-bold text-hot">
                <XCircle size={15} /> This migration package can&apos;t be restored
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
                App v{preview.manifest?.applicationVersion}, schema {preview.manifest?.databaseSchemaVersion} (currently running{" "}
                {preview.currentSchemaVersion}), from {preview.manifest?.sourceEnvironment}, created{" "}
                {preview.manifest?.createdAt ? new Date(preview.manifest.createdAt).toLocaleString() : "unknown time"}.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {preview.rowPlan?.map((p) => (
                  <span key={p.table} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/85">
                    {p.table}: {p.rowCount.toLocaleString()} rows
                  </span>
                ))}
              </div>
              {preview.bucketsToCreate && preview.bucketsToCreate.length > 0 && (
                <p className="mt-2 text-[11px] text-text-faint">
                  Will create storage bucket(s): {preview.bucketsToCreate.join(", ")}
                </p>
              )}
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-text-faint">
                <Info size={13} className="mt-0.5 shrink-0" />
                Only database data and missing storage bucket config are restored here. Application source and schema
                SQL must be applied manually — see README_MIGRATION.md in the package.
              </p>
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
            {restoreResult.bucketsCreated.length > 0 ? `, ${restoreResult.bucketsCreated.length} bucket(s) created` : ""}
          </p>
          <p className="mt-2 text-[11px] text-text-faint">{restoreResult.applicationFilesNote}</p>
        </div>
      )}

      {/* History */}
      {runs && runs.length > 0 && (
        <div className="mt-2">
          <p className="mb-2 text-xs font-bold text-white">Migration history</p>
          <div className="flex flex-col gap-1.5">
            {runs.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                <span className="truncate text-white/80">
                  {r.kind === "export" ? "Exported" : "Restored"} {r.filename ?? ""}
                </span>
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
