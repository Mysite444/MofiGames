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
  Cpu,
  Loader2,
  RefreshCw,
  Save,
  RotateCcw,
  Zap,
  FileCode2,
  BookMarked,
  XCircle,
  Info,
  Terminal,
} from "lucide-react";
import {
  mapPhpOpcacheRow,
  DEFAULT_PHP_OPCODE_SETTINGS,
  generatePhpIniSnippet,
  JIT_MODE_LABELS,
  type PhpOpcacheSettings,
  type JitMode,
} from "@/lib/php-opcode-settings";

// ── Shared sub-components ─────────────────────────────────────────────────────
// Mirrors the exact pattern from CacheDbOptimizationAdminClient.

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
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled?: boolean;
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
          disabled={disabled}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-36 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50"
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
  disabled,
  onChange,
  mono,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50 ${
          mono ? "font-mono" : ""
        }`}
      />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`flex flex-col rounded-xl border px-3.5 py-2 text-left text-xs transition-colors disabled:opacity-50 ${
              value === opt.value
                ? "border-[var(--color-menu-yellow)] bg-[var(--color-menu-yellow)]/10 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10"
            }`}
          >
            <span className="font-bold">{opt.label}</span>
            {opt.hint && <span className="mt-0.5 text-[11px] text-text-faint">{opt.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Code snippet copy box ─────────────────────────────────────────────────────

function CodeBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative mt-1 rounded-xl border border-white/10 bg-black/30">
      <pre className="max-h-64 overflow-auto p-4 text-[11px] leading-relaxed text-white/80">
        {code}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
      >
        {copied ? (
          <>
            <ClipboardCheck size={13} className="text-emerald-400" /> Copied
          </>
        ) : (
          <>
            <ClipboardCopy size={13} /> Copy
          </>
        )}
      </button>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({
  result,
}: {
  result: "success" | "failed" | "unavailable" | null;
}) {
  if (!result) return null;
  const map = {
    success:     { cls: "bg-emerald-500/15 text-emerald-400", icon: <CheckCircle2 size={12} />, label: "Reachable" },
    failed:      { cls: "bg-red-500/15 text-red-400",         icon: <XCircle size={12} />,     label: "Failed" },
    unavailable: { cls: "bg-amber-500/15 text-amber-400",     icon: <AlertTriangle size={12} />, label: "Not configured" },
  };
  const { cls, icon, label } = map[result];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {icon} {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ActionStatus = "idle" | "running" | "done" | "error";

interface LiveStats {
  opcache_enabled: boolean;
  cache_full: boolean;
  restart_pending: boolean;
  memory_usage?: {
    used_memory: number;
    free_memory: number;
    wasted_memory: number;
    current_wasted_percentage: number;
  };
  opcache_statistics?: {
    num_cached_scripts: number;
    num_cached_keys: number;
    hits: number;
    misses: number;
    opcache_hit_rate: number;
    last_restart_time: number;
  };
  jit?: {
    enabled: boolean;
    buffer_size: number;
    buffer_free: number;
  };
  interned_strings_usage?: {
    buffer_size: number;
    used_memory: number;
    free_memory: number;
    number_of_strings: number;
  };
}

export function CachePhpOpcacheAdminClient() {
  const [settings, setSettings]       = useState<PhpOpcacheSettings>(DEFAULT_PHP_OPCODE_SETTINGS);
  const [draft, setDraft]             = useState<PhpOpcacheSettings>(DEFAULT_PHP_OPCODE_SETTINGS);
  const [loading, setLoading]         = useState(true);
  const [saveStatus, setSaveStatus]   = useState<SaveStatus>("idle");
  const [checkStatus, setCheckStatus] = useState<ActionStatus>("idle");
  const [resetStatus, setResetStatus] = useState<ActionStatus>("idle");
  const [liveStats, setLiveStats]     = useState<LiveStats | null>(null);
  const [liveError, setLiveError]     = useState<string | null>(null);
  const [showSnippet, setShowSnippet] = useState(false);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/admin/cache/php-opcode/settings")
      .then((r) => r.json())
      .then((d) => {
        const mapped = mapPhpOpcacheRow(d.settings);
        setSettings(mapped);
        setDraft(mapped);
      })
      .catch(() => {
        setSettings(DEFAULT_PHP_OPCODE_SETTINGS);
        setDraft(DEFAULT_PHP_OPCODE_SETTINGS);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Patch helpers ─────────────────────────────────────────────────────────

  const patch = useCallback(<K extends keyof PhpOpcacheSettings>(key: K, value: PhpOpcacheSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/admin/cache/php-opcode/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      const updated = mapPhpOpcacheRow(data.settings);
      setSettings(updated);
      setDraft(updated);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // ── Live status check ─────────────────────────────────────────────────────

  const handleCheck = async () => {
    setCheckStatus("running");
    setLiveError(null);
    try {
      const res = await fetch("/api/admin/cache/php-opcode/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check" }),
      });
      const data = await res.json();
      if (data.result === "success" && data.stats) {
        setLiveStats(data.stats as LiveStats);
      } else {
        setLiveError(data.message ?? "Status check returned no data.");
      }
      // Refresh settings row (diagnostic timestamps updated).
      const settingsRes = await fetch("/api/admin/cache/php-opcode/settings");
      const settingsData = await settingsRes.json();
      const updated = mapPhpOpcacheRow(settingsData.settings);
      setSettings(updated);
      setDraft(updated);
      setCheckStatus("done");
      setTimeout(() => setCheckStatus("idle"), 3000);
    } catch {
      setLiveError("Network error contacting the PHP status endpoint.");
      setCheckStatus("error");
      setTimeout(() => setCheckStatus("idle"), 3000);
    }
  };

  // ── OPcache reset ─────────────────────────────────────────────────────────

  const handleReset = async () => {
    setResetStatus("running");
    try {
      const res = await fetch("/api/admin/cache/php-opcode/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const data = await res.json();
      if (!res.ok || data.result === "failed") {
        setLiveError(data.message ?? "OPcache reset failed.");
        setResetStatus("error");
      } else {
        setLiveStats(null); // stats are stale after a reset
        setResetStatus("done");
        // Refresh settings for lastResetAt timestamp.
        const settingsRes = await fetch("/api/admin/cache/php-opcode/settings");
        const settingsData = await settingsRes.json();
        const updated = mapPhpOpcacheRow(settingsData.settings);
        setSettings(updated);
        setDraft(updated);
      }
      setTimeout(() => setResetStatus("idle"), 3000);
    } catch {
      setLiveError("Network error calling the PHP reset endpoint.");
      setResetStatus("error");
      setTimeout(() => setResetStatus("idle"), 3000);
    }
  };

  // ── Memory bar helper ─────────────────────────────────────────────────────

  const formatBytes = (bytes: number) => {
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const hitRate = liveStats?.opcache_statistics?.opcache_hit_rate ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-faint">
        <Loader2 size={16} className="animate-spin" /> Loading PHP OPcache settings…
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">PHP OPcache</h1>
          <p className="mt-1 max-w-xl text-sm text-text-faint">
            OPcache stores compiled PHP bytecode in shared memory so scripts are never
            parsed more than once. JIT compiles hot paths to native machine code (PHP 8+).
            Preloading warms classes into shared memory at FPM startup. Interned Strings
            de-duplicates immutable strings across workers.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleCheck}
            disabled={checkStatus === "running"}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-60"
          >
            {checkStatus === "running" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : checkStatus === "done" ? (
              <Check size={13} className="text-emerald-400" />
            ) : (
              <RefreshCw size={13} />
            )}
            Check Status
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveStatus === "saving"}
            className="flex items-center gap-1.5 rounded-full bg-[var(--color-menu-yellow)] px-4 py-2 text-xs font-bold text-black hover:opacity-90 disabled:opacity-50"
          >
            {saveStatus === "saving" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : saveStatus === "saved" ? (
              <Check size={13} />
            ) : (
              <Save size={13} />
            )}
            {saveStatus === "saved" ? "Saved" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* ── Live stats panel ─────────────────────────────────────────────── */}
      {(liveStats || liveError) && (
        <div className="glass mb-4 rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">
              Live OPcache Status
            </h2>
            <div className="flex items-center gap-2">
              {settings.lastStatusResult && (
                <StatusBadge result={settings.lastStatusResult} />
              )}
              {settings.lastStatusCheckedAt && (
                <span className="text-[11px] text-text-faint">
                  {new Date(settings.lastStatusCheckedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>

          {liveError && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{liveError}</span>
            </div>
          )}

          {liveStats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Memory */}
              {liveStats.memory_usage && (() => {
                const mu = liveStats.memory_usage!;
                const total = mu.used_memory + mu.free_memory + mu.wasted_memory;
                const usedPct = total > 0 ? Math.round((mu.used_memory / total) * 100) : 0;
                return (
                  <div className="col-span-2 flex flex-col gap-1.5 rounded-xl bg-white/5 p-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                      Memory
                    </span>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[var(--color-menu-yellow)] transition-all"
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-white/70">
                      <span>{formatBytes(mu.used_memory)} used</span>
                      <span>{formatBytes(mu.free_memory)} free</span>
                    </div>
                    {mu.wasted_memory > 0 && (
                      <span className="text-[11px] text-amber-400">
                        {formatBytes(mu.wasted_memory)} wasted ({mu.current_wasted_percentage.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Hit rate */}
              {hitRate !== null && (
                <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                    Hit Rate
                  </span>
                  <span
                    className={`text-xl font-bold ${
                      hitRate >= 95
                        ? "text-emerald-400"
                        : hitRate >= 80
                          ? "text-amber-400"
                          : "text-red-400"
                    }`}
                  >
                    {hitRate.toFixed(1)}%
                  </span>
                  <span className="text-[11px] text-text-faint">
                    {(liveStats.opcache_statistics?.hits ?? 0).toLocaleString()} hits /{" "}
                    {(liveStats.opcache_statistics?.misses ?? 0).toLocaleString()} misses
                  </span>
                </div>
              )}

              {/* Cached scripts */}
              {liveStats.opcache_statistics && (
                <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                    Cached Scripts
                  </span>
                  <span className="text-xl font-bold text-white">
                    {liveStats.opcache_statistics.num_cached_scripts.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-text-faint">
                    {liveStats.opcache_statistics.num_cached_keys.toLocaleString()} keys
                  </span>
                </div>
              )}

              {/* JIT stats */}
              {liveStats.jit && (
                <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                    JIT Buffer
                  </span>
                  <span className="text-sm font-bold text-white">
                    {formatBytes(liveStats.jit.buffer_free)} free
                  </span>
                  <span className="text-[11px] text-text-faint">
                    of {formatBytes(liveStats.jit.buffer_size)}
                  </span>
                </div>
              )}

              {/* Interned strings */}
              {liveStats.interned_strings_usage && (
                <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                    Interned Strings
                  </span>
                  <span className="text-sm font-bold text-white">
                    {formatBytes(liveStats.interned_strings_usage.used_memory)} used
                  </span>
                  <span className="text-[11px] text-text-faint">
                    {liveStats.interned_strings_usage.number_of_strings.toLocaleString()} strings
                  </span>
                </div>
              )}

              {/* Flags */}
              {(liveStats.cache_full || liveStats.restart_pending) && (
                <div className="col-span-2 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 sm:col-span-4">
                  <AlertTriangle size={14} className="text-amber-400" />
                  <span className="text-xs text-amber-300">
                    {liveStats.cache_full && "Cache is full — consider increasing memory_consumption. "}
                    {liveStats.restart_pending && "A restart is pending. "}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ENV not configured notice ────────────────────────────────────── */}
      {settings.lastStatusResult === "unavailable" && !liveStats && (
        <div className="glass mb-4 flex items-start gap-3 rounded-2xl p-5">
          <Info size={18} className="mt-0.5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-semibold text-white">Status endpoint not configured</p>
            <p className="mt-0.5 text-xs text-text-faint">
              Add <code className="text-white">OPCACHE_STATUS_URL</code> and{" "}
              <code className="text-white">OPCACHE_RESET_URL</code> to{" "}
              <code className="text-white">.env.local</code>, then deploy a minimal PHP helper:
            </p>
            <CodeBox
              code={`<?php\n// opcache-status.php — protect behind a secret header or IP allowlist\nif ($_SERVER['HTTP_X_OPCACHE_SECRET'] !== getenv('OPCACHE_SECRET_HEADER')) {\n    http_response_code(403); exit;\n}\nheader('Content-Type: application/json');\necho json_encode(opcache_get_status(false));`}
            />
          </div>
        </div>
      )}

      {/* ── 1. OPcache ───────────────────────────────────────────────────── */}
      <Section
        title="OPcache"
        hint="Stores compiled PHP bytecode in shared memory — the single biggest PHP performance lever."
        icon={<Cpu size={16} />}
      >
        <ToggleField
          label="Enable OPcache"
          hint="opcache.enable — master switch. Disabling drops all cached scripts immediately."
          checked={draft.opcacheEnabled}
          onChange={(v) => patch("opcacheEnabled", v)}
        />

        <div className="my-1 h-px bg-white/5" />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <NumberField
            label="Memory Consumption"
            hint="opcache.memory_consumption — shared-memory segment size."
            value={draft.opcacheMemoryConsumptionMb}
            min={16}
            max={1024}
            suffix="MB"
            disabled={!draft.opcacheEnabled}
            onChange={(v) => patch("opcacheMemoryConsumptionMb", v)}
          />
          <NumberField
            label="Max Accelerated Files"
            hint="opcache.max_accelerated_files — maximum number of PHP files cached. Round up to the nearest prime."
            value={draft.opcacheMaxAcceleratedFiles}
            min={200}
            max={1000000}
            suffix="files"
            disabled={!draft.opcacheEnabled}
            onChange={(v) => patch("opcacheMaxAcceleratedFiles", v)}
          />
          <NumberField
            label="Max Wasted Memory"
            hint="opcache.max_wasted_percentage — triggers a restart when this % of memory is wasted by stale entries."
            value={draft.opcacheMaxWastedPercentage}
            min={1}
            max={50}
            suffix="%"
            disabled={!draft.opcacheEnabled}
            onChange={(v) => patch("opcacheMaxWastedPercentage", v)}
          />
          <NumberField
            label="Revalidate Frequency"
            hint="opcache.revalidate_freq — how often PHP checks if a cached file has changed on disk. 0 = never (use opcache_reset() on deploy)."
            value={draft.opcacheRevalidateFreqSeconds}
            min={0}
            max={3600}
            suffix="seconds"
            disabled={!draft.opcacheEnabled}
            onChange={(v) => patch("opcacheRevalidateFreqSeconds", v)}
          />
        </div>

        <div className="my-1 h-px bg-white/5" />

        <ToggleField
          label="Save Comments"
          hint="opcache.save_comments — required for PHP attributes and doctrine/symfony annotations. Keep on unless you're certain no library uses them."
          checked={draft.opcacheSaveComments}
          disabled={!draft.opcacheEnabled}
          onChange={(v) => patch("opcacheSaveComments", v)}
        />
        <ToggleField
          label="Validate Permissions"
          hint="opcache.validate_permission — re-check file read permissions on every access. Minor security benefit at a small performance cost."
          checked={draft.opcacheValidatePermission}
          disabled={!draft.opcacheEnabled}
          onChange={(v) => patch("opcacheValidatePermission", v)}
        />

        <div className="my-1 h-px bg-white/5" />

        <p className="text-xs font-bold uppercase tracking-wider text-text-faint">
          File Cache (secondary tier)
        </p>
        <ToggleField
          label="Enable File Cache"
          hint="opcache.file_cache — writes a disk copy of cached bytecode so the shared-memory cache survives PHP-FPM restarts."
          checked={draft.opcacheFileCacheEnabled}
          disabled={!draft.opcacheEnabled}
          onChange={(v) => patch("opcacheFileCacheEnabled", v)}
        />
        {draft.opcacheFileCacheEnabled && (
          <>
            <TextField
              label="File Cache Path"
              hint="opcache.file_cache — must be writable by the PHP-FPM user."
              value={draft.opcacheFileCachePath}
              placeholder="/tmp/opcache"
              mono
              onChange={(v) => patch("opcacheFileCachePath", v)}
            />
            <ToggleField
              label="File Cache Only"
              hint="opcache.file_cache_only — serve bytecode from disk without shared memory. Use on systems where SHM is unavailable (rare)."
              checked={draft.opcacheFileCacheOnly}
              onChange={(v) => patch("opcacheFileCacheOnly", v)}
            />
          </>
        )}

        {/* Reset button */}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            disabled={resetStatus === "running"}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {resetStatus === "running" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : resetStatus === "done" ? (
              <Check size={13} className="text-emerald-400" />
            ) : (
              <RotateCcw size={13} />
            )}
            {resetStatus === "done" ? "Reset done" : "Reset OPcache"}
          </button>
          {settings.lastResetAt && (
            <span className="text-[11px] text-text-faint">
              Last reset {new Date(settings.lastResetAt).toLocaleString()}
            </span>
          )}
        </div>
      </Section>

      {/* ── 2. JIT Compilation ───────────────────────────────────────────── */}
      <Section
        title="JIT Compilation (PHP 8+)"
        hint="Compiles hot PHP code paths to native machine code. Most effective on CPU-intensive workloads; the gain is smaller for I/O-bound apps."
        icon={<Zap size={16} />}
        defaultOpen={false}
      >
        <ToggleField
          label="Enable JIT"
          hint="Requires opcache.enable = 1. JIT has no effect without OPcache."
          checked={draft.jitEnabled}
          disabled={!draft.opcacheEnabled}
          onChange={(v) => patch("jitEnabled", v)}
        />

        <div className="my-1 h-px bg-white/5" />

        <SelectField<JitMode>
          label="JIT Mode"
          hint='Ignored when JIT is disabled. "Tracing" is recommended for general web workloads.'
          value={draft.jitMode}
          disabled={!draft.jitEnabled || !draft.opcacheEnabled}
          options={(["tracing", "function", "off"] as JitMode[]).map((m) => ({
            value: m,
            label: JIT_MODE_LABELS[m].label,
            hint:  JIT_MODE_LABELS[m].hint,
          }))}
          onChange={(v) => patch("jitMode", v)}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <NumberField
            label="JIT Buffer Size"
            hint="opcache.jit_buffer_size — native code store. Start at 64 MB; increase if JIT stops compiling new traces."
            value={draft.jitBufferSizeMb}
            min={8}
            max={512}
            suffix="MB"
            disabled={!draft.jitEnabled || !draft.opcacheEnabled}
            onChange={(v) => patch("jitBufferSizeMb", v)}
          />
          <NumberField
            label="Hot Function Threshold"
            hint="opcache.jit_hot_func — call count before JIT kicks in. Lower = more compiled code; 0 = compile everything."
            value={draft.jitHotFunctionThreshold}
            min={0}
            max={4096}
            suffix="calls"
            disabled={!draft.jitEnabled || !draft.opcacheEnabled}
            onChange={(v) => patch("jitHotFunctionThreshold", v)}
          />
          <NumberField
            label="Max Root Traces"
            hint="opcache.jit_max_root_traces — caps the number of JIT trace trees. Higher = more coverage, more buffer usage."
            value={draft.jitMaxRootTraces}
            min={64}
            max={32768}
            suffix="traces"
            disabled={!draft.jitEnabled || !draft.opcacheEnabled}
            onChange={(v) => patch("jitMaxRootTraces", v)}
          />
        </div>

        {!draft.opcacheEnabled && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            <AlertTriangle size={14} className="shrink-0" />
            OPcache must be enabled for JIT to function.
          </div>
        )}
      </Section>

      {/* ── 3. PHP Preloading ────────────────────────────────────────────── */}
      <Section
        title="PHP Preloading"
        hint="Loads classes, interfaces, and functions into shared memory once at FPM startup. Workers get access to them with zero parse or compile overhead."
        icon={<FileCode2 size={16} />}
        defaultOpen={false}
      >
        <ToggleField
          label="Enable Preloading"
          hint="Requires opcache.enable = 1 and a restart of PHP-FPM to take effect. Changes to preloaded files require another restart."
          checked={draft.preloadEnabled}
          disabled={!draft.opcacheEnabled}
          onChange={(v) => patch("preloadEnabled", v)}
        />

        <div className="my-1 h-px bg-white/5" />

        <TextField
          label="Preload Script Path"
          hint="opcache.preload — absolute path to the PHP bootstrap that calls opcache_compile_file() or require for each class you want preloaded."
          value={draft.preloadScriptPath}
          placeholder="/var/www/html/preload.php"
          mono
          disabled={!draft.preloadEnabled || !draft.opcacheEnabled}
          onChange={(v) => patch("preloadScriptPath", v)}
        />
        <TextField
          label="Preload User"
          hint="opcache.preload_user — must be the same OS user as the PHP-FPM worker process (commonly www-data, nginx, or nobody)."
          value={draft.preloadUser}
          placeholder="www-data"
          mono
          disabled={!draft.preloadEnabled || !draft.opcacheEnabled}
          onChange={(v) => patch("preloadUser", v)}
        />

        {draft.preloadEnabled && !draft.preloadScriptPath && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            <AlertTriangle size={14} className="shrink-0" />
            Set the preload script path before enabling preloading in php.ini.
          </div>
        )}

        <div className="mt-1 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
          <p className="text-xs font-semibold text-white">Example preload.php</p>
          <CodeBox
            code={`<?php\n// preload.php — run once at FPM startup\n$files = new RecursiveIteratorIterator(\n    new RecursiveDirectoryIterator(__DIR__ . '/src')\n);\nforeach ($files as $file) {\n    if ($file->isFile() && $file->getExtension() === 'php') {\n        opcache_compile_file($file->getPathname());\n    }\n}`}
          />
        </div>
      </Section>

      {/* ── 4. Interned Strings ──────────────────────────────────────────── */}
      <Section
        title="Interned Strings"
        hint='PHP interns (de-duplicates) immutable strings — function names, class names, string literals — into a single shared pool. More buffer = fewer duplicate allocations across workers.'
        icon={<BookMarked size={16} />}
        defaultOpen={false}
      >
        <NumberField
          label="Interned Strings Buffer"
          hint="opcache.interned_strings_buffer — shared pool for deduplicated strings. Increase if you see 'Interned strings buffer overflow' warnings."
          value={draft.internedStringsBufferMb}
          min={4}
          max={512}
          suffix="MB"
          disabled={!draft.opcacheEnabled}
          onChange={(v) => patch("internedStringsBufferMb", v)}
        />

        {liveStats?.interned_strings_usage && (() => {
          const isu = liveStats.interned_strings_usage!;
          const pct = isu.buffer_size > 0
            ? Math.round((isu.used_memory / isu.buffer_size) * 100)
            : 0;
          return (
            <div className="flex flex-col gap-1.5 rounded-xl bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Live usage</span>
                <span
                  className={`text-xs font-bold ${
                    pct > 85 ? "text-red-400" : pct > 65 ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  {pct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct > 85 ? "bg-red-400" : pct > 65 ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-text-faint">
                <span>{formatBytes(isu.used_memory)} used</span>
                <span>{isu.number_of_strings.toLocaleString()} strings</span>
                <span>{formatBytes(isu.buffer_size)} total</span>
              </div>
              {pct > 85 && (
                <p className="text-[11px] text-red-400">
                  Buffer nearing capacity — consider increasing the size above.
                </p>
              )}
            </div>
          );
        })()}

        <p className="text-xs text-text-faint">
          A typical Next.js / PHP-FPM stack fits comfortably in 8–16 MB. Raise to 32 MB+ only if
          you have very large frameworks or many string-heavy constants.
        </p>
      </Section>

      {/* ── php.ini snippet ──────────────────────────────────────────────── */}
      <div className="glass rounded-2xl p-5">
        <button
          type="button"
          onClick={() => setShowSnippet((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
              <Terminal size={16} />
            </span>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">
                php.ini Snippet
              </h2>
              <p className="mt-0.5 text-xs text-text-faint">
                Ready-to-paste configuration reflecting your current settings.
              </p>
            </div>
          </div>
          {showSnippet ? (
            <ChevronDown size={15} className="shrink-0 text-text-faint" />
          ) : (
            <ChevronRight size={15} className="shrink-0 text-text-faint" />
          )}
        </button>

        {showSnippet && (
          <div className="mt-4">
            <CodeBox code={generatePhpIniSnippet(draft)} />
            <p className="mt-2 text-[11px] text-text-faint">
              Add to <code className="text-white">/etc/php/8.x/fpm/conf.d/10-opcache.ini</code> or
              your server&apos;s <code className="text-white">php.ini</code>. Restart PHP-FPM after
              any change.{" "}
              {draft.preloadEnabled &&
                "Preloading changes require a full FPM restart — not just a reload."}
            </p>
          </div>
        )}
      </div>

      {/* ── Save error notice ────────────────────────────────────────────── */}
      {saveStatus === "error" && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={15} className="shrink-0" />
          Failed to save settings. Check your connection and try again.
        </div>
      )}

      {/* ── Sticky save bar ──────────────────────────────────────────────── */}
      {isDirty && (
        <div className="glass sticky bottom-4 mt-4 flex items-center justify-between gap-4 rounded-2xl px-5 py-3">
          <p className="text-xs text-text-faint">You have unsaved changes.</p>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveStatus === "saving"}
            className="flex items-center gap-1.5 rounded-full bg-[var(--color-menu-yellow)] px-5 py-2 text-xs font-bold text-black hover:opacity-90 disabled:opacity-50"
          >
            {saveStatus === "saving" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Save size={13} />
            )}
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
}
