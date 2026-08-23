"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardCheck,
  Database,
  Eye,
  EyeOff,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
  XCircle,
  Zap,
  Activity,
  BarChart2,
  Layers,
  SlidersHorizontal,
  TableProperties,
} from "lucide-react";
import {
  mapDbOptimizationRow,
  DEFAULT_DB_OPTIMIZATION_SETTINGS,
  generateQueryCacheEnvSnippet,
  generatePoolerConfigSnippet,
  type DbOptimizationSettings,
  type CachedQuerySlot,
  type SlowQueryEntry,
} from "@/lib/db-optimization-settings";

// ── Shared sub-components ─────────────────────────────────────────────────────
// Mirrors the exact pattern from CacheObjectAdminClient / CacheCdnAdminClient.

function Section({
  title,
  hint,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          {icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
              {icon}
            </span>
          )}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">{title}</h2>
            {hint && open && <p className="mt-0.5 text-xs text-text-faint">{hint}</p>}
          </div>
        </div>
        {open ? (
          <ChevronDown size={15} className="shrink-0 text-text-faint" />
        ) : (
          <ChevronRight size={15} className="shrink-0 text-text-faint" />
        )}
      </button>
      {open && children}
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 py-1 ${disabled ? "opacity-50" : ""}`}>
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {hint && <span className="block text-xs text-text-faint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
        } ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) =>
            onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))
          }
          className="glass w-36 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        {suffix && <span className="text-xs text-text-faint">{suffix}</span>}
      </div>
    </div>
  );
}

function TextField({
  label,
  hint,
  value,
  placeholder,
  maxLength,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="glass rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-white/40"
      />
    </div>
  );
}

function PasswordField({
  label,
  hint,
  passwordSet,
  preview,
  value,
  onChange,
  onClear,
}: {
  label: string;
  hint?: string;
  passwordSet: boolean;
  preview: string | null;
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      {!editing ? (
        <div className="flex items-center gap-2">
          <div className="glass flex flex-1 items-center justify-between rounded-xl px-3.5 py-2.5">
            <span className="text-sm text-text-faint font-mono">
              {passwordSet && preview ? preview : "Not set"}
            </span>
            {passwordSet && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                Set
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="glass rounded-xl px-3 py-2.5 text-xs font-bold text-white hover:bg-white/10"
          >
            {passwordSet ? "Change" : "Set"}
          </button>
          {passwordSet && (
            <button
              type="button"
              onClick={onClear}
              className="glass rounded-xl px-3 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/10"
            >
              Clear
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={visible ? "text" : "password"}
              value={value}
              placeholder="New password"
              onChange={(e) => onChange(e.target.value)}
              className="glass w-full rounded-xl px-3.5 py-2.5 pr-10 text-sm text-white placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-white/40"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-white"
            >
              {visible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="glass rounded-xl px-3 py-2.5 text-xs font-bold text-text-faint hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function SelectField({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="glass rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1a1a2e]">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {label && <p className="mb-1 text-xs font-semibold text-text-faint">{label}</p>}
      <pre className="glass overflow-x-auto rounded-xl p-4 text-xs leading-relaxed text-white/80 font-mono whitespace-pre-wrap">
        {code}
      </pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="absolute right-3 top-3 glass rounded-lg p-1.5 text-text-faint hover:text-white"
      >
        {copied ? <ClipboardCheck size={13} /> : <ClipboardCopy size={13} />}
      </button>
    </div>
  );
}

function StatusBadge({ status, message }: { status: "success" | "failed" | null; message?: string | null }) {
  if (!status) return null;
  const isOk = status === "success";
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
        isOk
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/30 bg-red-500/10 text-red-400"
      }`}
    >
      {isOk ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      <span className="font-semibold">{isOk ? "Success" : "Failed"}:</span>
      <span>{message}</span>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  label,
  loadingLabel,
  icon,
  variant = "default",
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
  loadingLabel?: string;
  icon?: React.ReactNode;
  variant?: "default" | "danger" | "success";
}) {
  const cls =
    variant === "danger"
      ? "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
      : variant === "success"
        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
        : "bg-white/10 border-white/10 text-white hover:bg-white/15";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${cls}`}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
      {loading ? (loadingLabel ?? label) : label}
    </button>
  );
}

// ── Impact badge ─────────────────────────────────────────────────────────────

function ImpactBadge({ impact }: { impact: "high" | "medium" | "low" }) {
  const cls =
    impact === "high"
      ? "bg-red-500/15 text-red-400"
      : impact === "medium"
        ? "bg-amber-500/15 text-amber-400"
        : "bg-white/10 text-text-faint";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${cls}`}>
      {impact} impact
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CacheDbOptimizationAdminClient() {
  const [settings, setSettings] = useState<DbOptimizationSettings>(DEFAULT_DB_OPTIMIZATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [draft, setDraft] = useState<DbOptimizationSettings>(DEFAULT_DB_OPTIMIZATION_SETTINGS);
  const [newPassword, setNewPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);

  // Query-cache actions
  const [testingCache, setTestingCache] = useState(false);
  const [testResult, setTestResult] = useState<{ status: "success" | "failed"; message: string } | null>(null);
  const [flushingCache, setFlushingCache] = useState(false);
  const [flushResult, setFlushResult] = useState<string | null>(null);

  // Analyze actions
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);
  const [scanningIndexes, setScanningIndexes] = useState(false);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [reindexTableInput, setReindexTableInput] = useState("");

  // Slow query log
  const [slowQueries, setSlowQueries] = useState<SlowQueryEntry[]>([]);
  const [loadingSlowQueries, setLoadingSlowQueries] = useState(false);
  const [clearingSlowLog, setClearingSlowLog] = useState(false);

  // Config generators
  const [showEnvSnippet, setShowEnvSnippet] = useState(false);
  const [showPoolerSnippet, setShowPoolerSnippet] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/cache/db-optimization/settings")
      .then((r) => r.json())
      .then((data) => {
        const s = mapDbOptimizationRow(data.settings);
        setSettings(s);
        setDraft(s);
      })
      .catch(() => {
        setSettings(DEFAULT_DB_OPTIMIZATION_SETTINGS);
        setDraft(DEFAULT_DB_OPTIMIZATION_SETTINGS);
      })
      .finally(() => setLoading(false));
  }, []);

  const loadSlowQueries = useCallback(() => {
    setLoadingSlowQueries(true);
    fetch("/api/admin/cache/db-optimization/slow-queries?limit=20")
      .then((r) => r.json())
      .then((data) => setSlowQueries(data.entries ?? []))
      .catch(() => setSlowQueries([]))
      .finally(() => setLoadingSlowQueries(false));
  }, []);

  useEffect(() => {
    load();
    loadSlowQueries();
  }, [load, loadSlowQueries]);

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);

    const body: Record<string, unknown> = {
      redisQueryCacheEnabled: draft.redisQueryCacheEnabled,
      redisQueryHost: draft.redisQueryHost,
      redisQueryPort: draft.redisQueryPort,
      redisQueryDatabase: draft.redisQueryDatabase,
      redisQueryTlsEnabled: draft.redisQueryTlsEnabled,
      redisQueryUsername: draft.redisQueryUsername,
      redisQueryConnectTimeoutMs: draft.redisQueryConnectTimeoutMs,
      queryCacheDefaultTtlSeconds: draft.queryCacheDefaultTtlSeconds,
      queryCacheKeyPrefix: draft.queryCacheKeyPrefix,
      cachedQuerySlots: draft.cachedQuerySlots,
      preparedStatementsEnabled: draft.preparedStatementsEnabled,
      maxPreparedStatements: draft.maxPreparedStatements,
      statementTimeoutMs: draft.statementTimeoutMs,
      lockTimeoutMs: draft.lockTimeoutMs,
      idleInTransactionTimeoutMs: draft.idleInTransactionTimeoutMs,
      slowQueryThresholdMs: draft.slowQueryThresholdMs,
      workMemKb: draft.workMemKb,
      poolMode: draft.poolMode,
      poolSize: draft.poolSize,
      explainAnalyzeEnabled: draft.explainAnalyzeEnabled,
      autoAnalyzeEnabled: draft.autoAnalyzeEnabled,
      autoAnalyzeSchedule: draft.autoAnalyzeSchedule,
      pendingReindexRequests: draft.pendingReindexRequests,
    };
    if (clearPassword) body.clearRedisQueryPassword = true;
    else if (newPassword) body.redisQueryPassword = newPassword;

    try {
      const res = await fetch("/api/admin/cache/db-optimization/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      const s = mapDbOptimizationRow(data.settings);
      setSettings(s);
      setDraft(s);
      setNewPassword("");
      setClearPassword(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown error.");
    } finally {
      setSaving(false);
    }
  }

  // ── Query-cache actions ───────────────────────────────────────────────────

  async function handleCacheAction(action: "test" | "flush") {
    if (action === "test") setTestingCache(true);
    else setFlushingCache(true);
    setTestResult(null);
    setFlushResult(null);

    try {
      const res = await fetch("/api/admin/cache/db-optimization/query-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (action === "test") {
        setTestResult({ status: data.status === "success" ? "success" : "failed", message: data.message });
      } else {
        setFlushResult(data.message ?? "Flushed.");
      }
      load();
    } catch {
      if (action === "test") setTestResult({ status: "failed", message: "Network error." });
      else setFlushResult("Flush failed — network error.");
    } finally {
      if (action === "test") setTestingCache(false);
      else setFlushingCache(false);
    }
  }

  // ── Analyze actions ───────────────────────────────────────────────────────

  async function handleAnalyzeAction(action: "analyze" | "scan_indexes" | "reindex", table?: string) {
    if (action === "analyze") setAnalyzing(true);
    else if (action === "scan_indexes") setScanningIndexes(true);
    else if (table) setReindexing(table);

    try {
      const res = await fetch("/api/admin/cache/db-optimization/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, table }),
      });
      const data = await res.json();
      if (action === "analyze") {
        const summary = data.summary;
        setAnalyzeResult(
          summary
            ? `Analyzed ${summary.tablesAnalyzed?.length ?? 0} tables in ${summary.durationMs}ms`
            : data.message ?? "Done."
        );
      } else if (action === "scan_indexes") {
        setAnalyzeResult(`Found ${data.recommendationCount ?? 0} index recommendation(s).`);
      } else {
        setReindexTableInput("");
      }
      load();
    } catch {
      setAnalyzeResult("Action failed — network error.");
    } finally {
      if (action === "analyze") setAnalyzing(false);
      else if (action === "scan_indexes") setScanningIndexes(false);
      else setReindexing(null);
    }
  }

  // ── Slow-query log helpers ────────────────────────────────────────────────

  async function handleClearSlowLog() {
    setClearingSlowLog(true);
    try {
      await fetch("/api/admin/cache/db-optimization/slow-queries", { method: "DELETE" });
      setSlowQueries([]);
    } catch {/* ignore */}
    finally { setClearingSlowLog(false); }
  }

  // ── Cached query slot helpers ─────────────────────────────────────────────

  function updateSlot(index: number, patch: Partial<CachedQuerySlot>) {
    const updated = draft.cachedQuerySlots.map((s, i) => (i === index ? { ...s, ...patch } : s));
    setDraft((d) => ({ ...d, cachedQuerySlots: updated }));
  }

  function addSlot() {
    setDraft((d) => ({
      ...d,
      cachedQuerySlots: [
        ...d.cachedQuerySlots,
        { name: `query_${d.cachedQuerySlots.length + 1}`, pattern: "", ttlSeconds: 300, enabled: true },
      ],
    }));
  }

  function removeSlot(index: number) {
    setDraft((d) => ({ ...d, cachedQuerySlots: d.cachedQuerySlots.filter((_, i) => i !== index) }));
  }

  // ── Reindex helpers ───────────────────────────────────────────────────────

  function removeReindexRequest(table: string) {
    setDraft((d) => ({
      ...d,
      pendingReindexRequests: d.pendingReindexRequests.filter((r) => r.table !== table),
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 text-sm text-text-faint">
        <Loader2 size={18} className="animate-spin" /> Loading database optimisation settings…
      </div>
    );
  }

  const ms = (v: number) => (v === 0 ? "Off" : v >= 1000 ? `${v / 1000}s` : `${v}ms`);
  const kb = (v: number) => (v >= 1024 ? `${v / 1024}MB` : `${v}kB`);

  return (
    <div className="max-w-4xl">
      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Database Optimisation</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-faint">
            Redis query cache, cached query results, prepared statements, query optimisation settings,
            and database index recommendations — all in one place.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saveOk && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
              <Check size={13} /> Saved
            </span>
          )}
          {saveError && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
              <AlertTriangle size={13} /> {saveError}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[var(--color-menu-yellow)] px-4 py-2.5 text-xs font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* ── 1. Redis Query Cache ── */}
      <Section
        title="Redis Query Cache"
        hint="Caches the results of expensive database queries in Redis so repeated reads don't hit Postgres."
        icon={<Zap size={16} />}
      >
        <ToggleField
          label="Enable Redis Query Cache"
          hint="Route hot query results through Redis before hitting Supabase/Postgres."
          checked={draft.redisQueryCacheEnabled}
          onChange={(v) => setDraft((d) => ({ ...d, redisQueryCacheEnabled: v }))}
        />

        {draft.redisQueryCacheEnabled && (
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Redis Host"
              value={draft.redisQueryHost}
              placeholder="127.0.0.1"
              onChange={(v) => setDraft((d) => ({ ...d, redisQueryHost: v }))}
            />
            <NumberField
              label="Port"
              value={draft.redisQueryPort}
              min={1}
              max={65535}
              onChange={(v) => setDraft((d) => ({ ...d, redisQueryPort: v }))}
            />
            <NumberField
              label="Database Index"
              hint="Use a separate DB index from the object cache (default: 1)."
              value={draft.redisQueryDatabase}
              min={0}
              max={15}
              onChange={(v) => setDraft((d) => ({ ...d, redisQueryDatabase: v }))}
            />
            <NumberField
              label="Connect Timeout"
              value={draft.redisQueryConnectTimeoutMs}
              min={100}
              max={30000}
              suffix="ms"
              onChange={(v) => setDraft((d) => ({ ...d, redisQueryConnectTimeoutMs: v }))}
            />
            <TextField
              label="Username"
              hint="Leave blank for the default Redis user (pre-ACL)."
              value={draft.redisQueryUsername}
              placeholder="default"
              onChange={(v) => setDraft((d) => ({ ...d, redisQueryUsername: v }))}
            />
            <ToggleField
              label="TLS"
              hint="Enable TLS/SSL for the Redis connection."
              checked={draft.redisQueryTlsEnabled}
              onChange={(v) => setDraft((d) => ({ ...d, redisQueryTlsEnabled: v }))}
            />
            <div className="sm:col-span-2">
              <PasswordField
                label="Redis Password"
                hint="Stored encrypted, never returned to the browser in full."
                passwordSet={draft.redisQueryPasswordSet}
                preview={draft.redisQueryPasswordPreview}
                value={newPassword}
                onChange={(v) => { setNewPassword(v); setClearPassword(false); }}
                onClear={() => { setClearPassword(true); setNewPassword(""); }}
              />
            </div>
          </div>
        )}

        {/* Connection test + flush */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <ActionButton
            onClick={() => handleCacheAction("test")}
            loading={testingCache}
            label="Test Connection"
            loadingLabel="Testing…"
            icon={<Play size={13} />}
          />
          <ActionButton
            onClick={() => handleCacheAction("flush")}
            loading={flushingCache}
            label="Flush Query Cache"
            loadingLabel="Flushing…"
            icon={<RefreshCw size={13} />}
            variant="danger"
          />
          {settings.lastQueryCacheTestedAt && (
            <span className="text-xs text-text-faint">
              Last tested{" "}
              {new Date(settings.lastQueryCacheTestedAt).toLocaleString()}
            </span>
          )}
          {settings.lastQueryCacheFlushedAt && (
            <span className="text-xs text-text-faint">
              Last flushed{" "}
              {new Date(settings.lastQueryCacheFlushedAt).toLocaleString()}
            </span>
          )}
        </div>
        {testResult && <StatusBadge status={testResult.status} message={testResult.message} />}
        {flushResult && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <CheckCircle2 size={13} /> {flushResult}
          </div>
        )}

        {/* .env snippet */}
        <div>
          <button
            type="button"
            onClick={() => setShowEnvSnippet((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-menu-yellow)]"
          >
            <ClipboardCopy size={12} />
            {showEnvSnippet ? "Hide" : "Show"} .env snippet
          </button>
          {showEnvSnippet && (
            <div className="mt-2">
              <CodeBlock code={generateQueryCacheEnvSnippet(draft)} label=".env.local" />
            </div>
          )}
        </div>
      </Section>

      {/* ── 2. Cached Query Results ── */}
      <Section
        title="Cached Query Results"
        hint="Named query slots with individual TTL overrides. Map your application's cache keys to these slot names."
        icon={<BarChart2 size={16} />}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumberField
            label="Default Query TTL"
            hint="Applied to any slot that doesn't specify its own TTL."
            value={draft.queryCacheDefaultTtlSeconds}
            min={5}
            max={86400}
            suffix="seconds"
            onChange={(v) => setDraft((d) => ({ ...d, queryCacheDefaultTtlSeconds: v }))}
          />
          <TextField
            label="Cache Key Prefix"
            hint="Prepended to all query-cache keys to prevent collisions."
            value={draft.queryCacheKeyPrefix}
            placeholder="pbq_"
            maxLength={32}
            onChange={(v) => setDraft((d) => ({ ...d, queryCacheKeyPrefix: v }))}
          />
        </div>

        {/* Slot table */}
        <div className="mt-1">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-text-faint">Query Slots</p>
          <div className="flex flex-col gap-2">
            {draft.cachedQuerySlots.map((slot, i) => (
              <div key={i} className="glass flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <input
                    type="text"
                    value={slot.name}
                    placeholder="slot_name"
                    maxLength={64}
                    onChange={(e) => updateSlot(i, { name: e.target.value })}
                    className="glass w-full rounded-lg px-3 py-1.5 text-xs font-mono text-white sm:w-36 focus:outline-none focus:ring-1 focus:ring-white/30"
                  />
                  <input
                    type="text"
                    value={slot.pattern}
                    placeholder="Query description / hint"
                    maxLength={200}
                    onChange={(e) => updateSlot(i, { pattern: e.target.value })}
                    className="glass flex-1 rounded-lg px-3 py-1.5 text-xs text-text-faint focus:outline-none focus:ring-1 focus:ring-white/30"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={slot.ttlSeconds}
                      min={5}
                      max={86400}
                      onChange={(e) => updateSlot(i, { ttlSeconds: Number(e.target.value) })}
                      className="glass w-20 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/30"
                    />
                    <span className="text-xs text-text-faint">s</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={slot.enabled}
                    onClick={() => updateSlot(i, { enabled: !slot.enabled })}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                      slot.enabled ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                        slot.enabled ? "translate-x-[18px]" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSlot(i)}
                    className="text-text-faint hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addSlot}
            className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-white/20 px-4 py-2.5 text-xs font-bold text-text-faint transition-colors hover:border-white/40 hover:text-white"
          >
            <Plus size={13} /> Add Slot
          </button>
        </div>
      </Section>

      {/* ── 3. Prepared Statements ── */}
      <Section
        title="Prepared Statements"
        hint="Configure session-level timeouts and connection-pool prepared-statement limits."
        icon={<Layers size={16} />}
        defaultOpen={false}
      >
        <ToggleField
          label="Enable Prepared Statements"
          hint="Uses named prepared statements for repeated queries. Requires 'session' pool mode in PgBouncer."
          checked={draft.preparedStatementsEnabled}
          onChange={(v) => setDraft((d) => ({ ...d, preparedStatementsEnabled: v }))}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Max Prepared Statements"
            hint="Per-connection limit. 0 = unlimited (Postgres default)."
            value={draft.maxPreparedStatements}
            min={0}
            max={10000}
            onChange={(v) => setDraft((d) => ({ ...d, maxPreparedStatements: v }))}
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-white">Statement Timeout</span>
            <span className="text-xs text-text-faint">
              Cancel any query running longer than this. 0 = no timeout. Currently: <strong className="text-white">{ms(draft.statementTimeoutMs)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={120000}
              step={500}
              value={draft.statementTimeoutMs}
              onChange={(e) => setDraft((d) => ({ ...d, statementTimeoutMs: Number(e.target.value) }))}
              className="mt-1 accent-[var(--color-menu-yellow)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-white">Lock Timeout</span>
            <span className="text-xs text-text-faint">
              Abort if a lock cannot be acquired within this time. 0 = no timeout. Currently: <strong className="text-white">{ms(draft.lockTimeoutMs)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={60000}
              step={500}
              value={draft.lockTimeoutMs}
              onChange={(e) => setDraft((d) => ({ ...d, lockTimeoutMs: Number(e.target.value) }))}
              className="mt-1 accent-[var(--color-menu-yellow)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-white">Idle-in-Transaction Timeout</span>
            <span className="text-xs text-text-faint">
              Terminate sessions left idle inside a transaction. 0 = off. Currently: <strong className="text-white">{ms(draft.idleInTransactionTimeoutMs)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={60000}
              step={500}
              value={draft.idleInTransactionTimeoutMs}
              onChange={(e) =>
                setDraft((d) => ({ ...d, idleInTransactionTimeoutMs: Number(e.target.value) }))
              }
              className="mt-1 accent-[var(--color-menu-yellow)]"
            />
          </div>
        </div>
      </Section>

      {/* ── 4. Query Optimisation ── */}
      <Section
        title="Query Optimisation"
        hint="Slow-query logging, connection pool mode, work_mem, and EXPLAIN ANALYZE settings."
        icon={<SlidersHorizontal size={16} />}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-white">Slow-Query Threshold</span>
            <span className="text-xs text-text-faint">
              Log queries exceeding this duration. 0 = disabled. Currently:{" "}
              <strong className="text-white">{ms(draft.slowQueryThresholdMs)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={10000}
              step={50}
              value={draft.slowQueryThresholdMs}
              onChange={(e) => setDraft((d) => ({ ...d, slowQueryThresholdMs: Number(e.target.value) }))}
              className="mt-1 accent-[var(--color-menu-yellow)]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-white">work_mem</span>
            <span className="text-xs text-text-faint">
              Memory per sort/hash operation per connection. Higher = fewer disk spills for complex queries.{" "}
              Currently: <strong className="text-white">{kb(draft.workMemKb)}</strong>
            </span>
            <input
              type="range"
              min={1024}
              max={131072}
              step={1024}
              value={draft.workMemKb}
              onChange={(e) => setDraft((d) => ({ ...d, workMemKb: Number(e.target.value) }))}
              className="mt-1 accent-[var(--color-menu-yellow)]"
            />
          </div>

          <SelectField
            label="Connection Pool Mode"
            hint="Transaction mode is safest for Supabase; session mode is needed for prepared statements."
            value={draft.poolMode}
            options={[
              { value: "session", label: "Session — full session state per client" },
              { value: "transaction", label: "Transaction — released after each transaction (recommended)" },
              { value: "statement", label: "Statement — released after each statement" },
            ]}
            onChange={(v) => setDraft((d) => ({ ...d, poolMode: v as typeof d.poolMode }))}
          />

          <NumberField
            label="Pool Size"
            hint="Max number of server connections per pool."
            value={draft.poolSize}
            min={1}
            max={500}
            onChange={(v) => setDraft((d) => ({ ...d, poolSize: v }))}
          />
        </div>

        <ToggleField
          label="EXPLAIN ANALYZE on Demand"
          hint="Allow the admin panel to trigger EXPLAIN ANALYZE on production queries. Has a real execution cost — use sparingly."
          checked={draft.explainAnalyzeEnabled}
          onChange={(v) => setDraft((d) => ({ ...d, explainAnalyzeEnabled: v }))}
        />

        {/* Pooler config snippet */}
        <div>
          <button
            type="button"
            onClick={() => setShowPoolerSnippet((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-menu-yellow)]"
          >
            <ClipboardCopy size={12} />
            {showPoolerSnippet ? "Hide" : "Show"} pooler config snippet
          </button>
          {showPoolerSnippet && (
            <div className="mt-2">
              <CodeBlock code={generatePoolerConfigSnippet(draft)} label="pgbouncer.ini / supavisor" />
            </div>
          )}
        </div>

        {/* Slow-query log */}
        <div className="mt-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-text-faint">
              Slow Query Log (recent 20)
            </p>
            <div className="flex items-center gap-2">
              <ActionButton
                onClick={loadSlowQueries}
                loading={loadingSlowQueries}
                label="Refresh"
                icon={<RefreshCw size={12} />}
              />
              {slowQueries.length > 0 && (
                <ActionButton
                  onClick={handleClearSlowLog}
                  loading={clearingSlowLog}
                  label="Clear Log"
                  icon={<Trash2 size={12} />}
                  variant="danger"
                />
              )}
            </div>
          </div>
          {loadingSlowQueries ? (
            <div className="flex items-center gap-2 text-xs text-text-faint py-4">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : slowQueries.length === 0 ? (
            <p className="text-xs text-text-faint py-4">No slow queries logged yet. Adjust the threshold above and instrument your data-access layer.</p>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
              {slowQueries.map((q, i) => (
                <div key={q.id ?? i} className="glass flex items-center justify-between gap-3 rounded-xl px-4 py-2.5">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="truncate text-xs font-semibold text-white">
                      {q.queryLabel ?? q.queryHash}
                    </span>
                    <span className="text-[11px] text-text-faint">
                      {new Date(q.loggedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      q.durationMs > 2000
                        ? "bg-red-500/15 text-red-400"
                        : q.durationMs > 1000
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-white/10 text-text-faint"
                    }`}
                  >
                    {q.durationMs}ms
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── 5. Database Index Optimisation ── */}
      <Section
        title="Database Index Optimisation"
        hint="Auto-analyze, index recommendations from query statistics, and REINDEX scheduling."
        icon={<TableProperties size={16} />}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ToggleField
            label="Auto-Analyze"
            hint="Run ANALYZE on key tables on a nightly schedule (controlled under Automation)."
            checked={draft.autoAnalyzeEnabled}
            onChange={(v) => setDraft((d) => ({ ...d, autoAnalyzeEnabled: v }))}
          />
          <TextField
            label="Analyze Schedule (cron)"
            hint="UTC cron expression. Picked up by Admin → Automation."
            value={draft.autoAnalyzeSchedule}
            placeholder="0 3 * * *"
            onChange={(v) => setDraft((d) => ({ ...d, autoAnalyzeSchedule: v }))}
          />
        </div>

        {/* Manual analyze + index scan */}
        <div className="flex flex-wrap gap-3">
          <ActionButton
            onClick={() => handleAnalyzeAction("analyze")}
            loading={analyzing}
            label="Run ANALYZE Now"
            loadingLabel="Analyzing…"
            icon={<Activity size={13} />}
          />
          <ActionButton
            onClick={() => handleAnalyzeAction("scan_indexes")}
            loading={scanningIndexes}
            label="Scan for Index Recommendations"
            loadingLabel="Scanning…"
            icon={<Search size={13} />}
          />
        </div>
        {analyzeResult && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <CheckCircle2 size={13} /> {analyzeResult}
          </div>
        )}
        {settings.lastAnalyzeRunAt && (
          <p className="text-xs text-text-faint">
            Last ANALYZE: {new Date(settings.lastAnalyzeRunAt).toLocaleString()}
          </p>
        )}
        {settings.lastIndexScanAt && (
          <p className="text-xs text-text-faint">
            Last index scan: {new Date(settings.lastIndexScanAt).toLocaleString()}
          </p>
        )}

        {/* Index recommendations */}
        {draft.indexRecommendations.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-wider text-text-faint">
              Index Recommendations ({draft.indexRecommendations.length})
            </p>
            {draft.indexRecommendations.map((rec, i) => (
              <div key={i} className="glass flex flex-col gap-3 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-sm font-bold text-white font-mono">
                      {rec.table}
                    </span>
                    <span className="ml-2 text-xs text-text-faint font-mono">
                      ({rec.columns.join(", ")})
                    </span>
                  </div>
                  <ImpactBadge impact={rec.estimatedImpact} />
                </div>
                <p className="text-xs text-text-faint">{rec.reason}</p>
                <CodeBlock code={rec.suggestedSql} label="Suggested SQL" />
                <div className="flex gap-2">
                  <ActionButton
                    onClick={() => handleAnalyzeAction("reindex", rec.table)}
                    loading={reindexing === rec.table}
                    label={`Queue REINDEX on ${rec.table}`}
                    loadingLabel="Queuing…"
                    icon={<Database size={12} />}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {draft.indexRecommendations.length === 0 && (
          <div className="glass flex items-center gap-3 rounded-xl px-4 py-3">
            <Database size={16} className="text-text-faint" />
            <p className="text-xs text-text-faint">
              No index recommendations yet. Run{" "}
              <span className="font-semibold text-white">Scan for Index Recommendations</span> above to
              analyse query statistics.
            </p>
          </div>
        )}

        {/* Pending REINDEX requests */}
        {draft.pendingReindexRequests.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-text-faint">
              Pending REINDEX Requests
            </p>
            {draft.pendingReindexRequests.map((r) => (
              <div
                key={r.table}
                className="glass flex items-center justify-between gap-3 rounded-xl px-4 py-2.5"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-white font-mono">{r.table}</span>
                  <span className="text-xs text-text-faint">
                    Requested {new Date(r.requestedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold capitalize ${
                      r.status === "pending"
                        ? "bg-amber-500/15 text-amber-400"
                        : r.status === "running"
                          ? "bg-blue-500/15 text-blue-400"
                          : r.status === "done"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {r.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeReindexRequest(r.table)}
                    className="text-text-faint hover:text-red-400"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Manual REINDEX input */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <TextField
              label="Queue REINDEX on a Table"
              hint="Runs REINDEX CONCURRENTLY — will not block reads/writes."
              value={reindexTableInput}
              placeholder="e.g. games"
              onChange={setReindexTableInput}
            />
          </div>
          <ActionButton
            onClick={() => reindexTableInput && handleAnalyzeAction("reindex", reindexTableInput)}
            loading={reindexing === reindexTableInput && !!reindexTableInput}
            label="Queue"
            icon={<Plus size={13} />}
          />
        </div>
      </Section>

      {/* ── Bottom save bar ── */}
      <div className="glass mt-2 flex items-center justify-between gap-4 rounded-2xl px-6 py-4">
        <p className="text-xs text-text-faint">
          {settings.updatedAt !== new Date(0).toISOString()
            ? `Last saved ${new Date(settings.updatedAt).toLocaleString()}`
            : "Not yet saved."}
        </p>
        <div className="flex items-center gap-3">
          {saveError && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-400">
              <AlertTriangle size={12} /> {saveError}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-[var(--color-menu-yellow)] px-4 py-2.5 text-xs font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
