"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Database,
  HardDrive,
  Layers3,
  Loader2,
  RefreshCcw,
  Save,
  Server,
  Trash2,
  X,
} from "lucide-react";
import {
  fetchMonitoringCacheSettings,
  formatBytes,
  formatTtl,
  CACHE_LAYER_LABELS,
  CLEANUP_INTERVAL_LIMITS,
  CLEANUP_MAX_AGE_LIMITS,
  CLEANUP_USAGE_PCT_LIMITS,
  MAX_STORAGE_MB_LIMITS,
  TTL_LIMITS,
  DEFAULT_TTL_SETTINGS,
  type CacheBackendType,
  type CacheHealthStatus,
  type CacheLayerKey,
  type CachePurgeLogEntry,
  type CacheStorageStats,
  type MonitoringCacheSettings,
} from "@/lib/monitoring-cache-settings";

// ── Local building blocks ────────────────────────────────────────────────────
// Mirrors the Section / ToggleField / NumberField pattern used across
// all Cache admin clients (CacheCompressionAdminClient,
// CacheSecurityAdminClient, etc.)

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
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">
              {title}
            </h2>
            {hint && open && (
              <p className="mt-0.5 text-xs text-text-faint">{hint}</p>
            )}
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
    <label
      className={`flex items-center justify-between gap-4 py-1 ${disabled ? "opacity-50" : ""}`}
    >
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {hint && (
          <span className="block text-xs text-text-faint">{hint}</span>
        )}
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
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) =>
            onChange(
              Math.min(max, Math.max(min, Number(e.target.value) || min)),
            )
          }
          className="glass w-36 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed"
        />
        {suffix && <span className="text-xs text-text-faint">{suffix}</span>}
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
        {label}
      </span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

// ── Health / status chips ────────────────────────────────────────────────────

function HealthChip({ status }: { status: CacheHealthStatus }) {
  const map: Record<
    CacheHealthStatus,
    { label: string; cls: string; icon: React.ReactNode }
  > = {
    healthy: {
      label: "Healthy",
      cls: "bg-emerald-500/15 text-emerald-400",
      icon: <CircleCheck size={12} />,
    },
    degraded: {
      label: "Degraded",
      cls: "bg-amber-500/15 text-amber-400",
      icon: <CircleAlert size={12} />,
    },
    offline: {
      label: "Offline",
      cls: "bg-red-500/15 text-red-400",
      icon: <CircleX size={12} />,
    },
    unknown: {
      label: "Unknown",
      cls: "bg-white/10 text-text-faint",
      icon: <CircleDashed size={12} />,
    },
  };
  const { label, cls, icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}
    >
      {icon} {label}
    </span>
  );
}

function CacheTypeChip({ type }: { type: CacheBackendType }) {
  const map: Record<CacheBackendType, { label: string; icon: React.ReactNode }> =
    {
      redis: { label: "Redis", icon: <Server size={11} /> },
      file: { label: "File", icon: <HardDrive size={11} /> },
      memcached: { label: "Memcached", icon: <Database size={11} /> },
    };
  const { label, icon } = map[type];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white">
      {icon} {label}
    </span>
  );
}

// ── Storage usage bar ────────────────────────────────────────────────────────

function StorageBar({
  usedBytes,
  maxBytes,
}: {
  usedBytes: number;
  maxBytes: number;
}) {
  if (maxBytes <= 0) {
    return (
      <span className="text-xs text-text-faint">
        {formatBytes(usedBytes)} used (no ceiling configured)
      </span>
    );
  }
  const pct = Math.min(100, Math.round((usedBytes / maxBytes) * 100));
  const barColor =
    pct >= 90
      ? "bg-red-500"
      : pct >= 70
        ? "bg-amber-400"
        : "bg-[var(--color-menu-yellow)]";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs text-text-faint">
        <span>
          {formatBytes(usedBytes)} of {formatBytes(maxBytes)} used
        </span>
        <span className="font-bold text-white">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Purge log table row ──────────────────────────────────────────────────────

function PurgeLogRow({ log }: { log: CachePurgeLogEntry }) {
  const statusMap = {
    success: { cls: "text-emerald-400", icon: <Check size={13} /> },
    failed: { cls: "text-red-400", icon: <X size={13} /> },
    partial: { cls: "text-amber-400", icon: <AlertTriangle size={13} /> },
  };
  const { cls, icon } = statusMap[log.status];

  const when = new Date(log.triggeredAt).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <tr className="border-b border-white/5 last:border-0">
      <td className="py-2.5 pr-4 text-xs text-text-faint">{when}</td>
      <td className="py-2.5 pr-4">
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white capitalize">
          {log.purgeType === "auto_cleanup" ? "Auto Cleanup" : log.purgeType}
        </span>
      </td>
      <td className="py-2.5 pr-4 text-xs text-text-faint">
        {log.purgeScope.length > 0
          ? log.purgeScope
              .map((k) => CACHE_LAYER_LABELS[k])
              .join(", ")
          : "All layers"}
      </td>
      <td className="py-2.5 pr-4 text-xs text-white tabular-nums">
        {log.purgeCount.toLocaleString()} entries
      </td>
      <td className={`py-2.5 pr-4 text-xs font-semibold ${cls}`}>
        <span className="flex items-center gap-1">
          {icon}{" "}
          {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
        </span>
      </td>
      <td className="py-2.5 text-xs text-text-faint">
        {log.triggeredByEmail ?? "—"}
      </td>
    </tr>
  );
}

// ── Save button ──────────────────────────────────────────────────────────────

type SaveState = "idle" | "saving" | "saved" | "error";

function SaveButton({
  state,
  onClick,
}: {
  state: SaveState;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "saving"}
      className="flex items-center gap-2 rounded-full bg-[var(--color-menu-yellow)] px-5 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {state === "saving" ? (
        <Loader2 size={15} className="animate-spin" />
      ) : state === "saved" ? (
        <Check size={15} />
      ) : state === "error" ? (
        <X size={15} />
      ) : (
        <Save size={15} />
      )}
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? "Saved"
          : state === "error"
            ? "Error — retry"
            : "Save changes"}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TTL_LAYERS: { key: keyof MonitoringCacheSettings["ttl"]; label: string; hint: string }[] = [
  {
    key: "pageTtlSeconds",
    label: "Full Page",
    hint: "How long a fully rendered HTML response may be cached before a fresh render is required.",
  },
  {
    key: "apiTtlSeconds",
    label: "API",
    hint: "Default TTL for JSON API response cache entries — overridden per-endpoint in the API Cache section.",
  },
  {
    key: "objectTtlSeconds",
    label: "Object",
    hint: "Default TTL for key-value object cache entries in Redis / Memcached.",
  },
  {
    key: "fragmentTtlSeconds",
    label: "Fragment",
    hint: "Default TTL for partial-page (fragment) cache entries — trending games, navigation menus, sidebars, etc.",
  },
  {
    key: "imageTtlSeconds",
    label: "Image",
    hint: "Default TTL for optimised image variants (WebP, AVIF, thumbnails). Long values are fine because image URLs are fingerprinted.",
  },
  {
    key: "staticTtlSeconds",
    label: "Static Assets",
    hint: "Default TTL for CSS, JS, fonts, and SVG. Long values are fine because Next.js build output is content-addressed.",
  },
  {
    key: "sessionTtlSeconds",
    label: "Session",
    hint: "How long a session cache entry remains valid before the user's session data must be refreshed from the database.",
  },
  {
    key: "dnsTtlSeconds",
    label: "DNS",
    hint: "DNS resolution TTL for outbound requests this app makes — affects how long resolved IPs are cached in the OS / Node resolver.",
  },
  {
    key: "searchTtlSeconds",
    label: "Search",
    hint: "How long search suggestion, autocomplete, and filter result cache entries are considered fresh.",
  },
  {
    key: "feedTtlSeconds",
    label: "Feed",
    hint: "How long RSS, Atom, JSON Feed, and XML Sitemap responses are cached before regeneration.",
  },
];

export function CacheMonitoringAdminClient() {
  const [settings, setSettings] = useState<MonitoringCacheSettings | null>(null);
  const [stats, setStats] = useState<CacheStorageStats | null>(null);
  const [logs, setLogs] = useState<CachePurgeLogEntry[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsOffset, setLogsOffset] = useState(0);

  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const [purgeAllState, setPurgeAllState] = useState<"idle" | "confirming" | "purging" | "done" | "error">("idle");
  const [purgeAllMsg, setPurgeAllMsg] = useState<string | null>(null);

  const [selectedLayers, setSelectedLayers] = useState<Set<CacheLayerKey>>(new Set());
  const [purgeSelState, setPurgeSelState] = useState<"idle" | "purging" | "done" | "error">("idle");
  const [purgeSelMsg, setPurgeSelMsg] = useState<string | null>(null);

  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    const s = await fetchMonitoringCacheSettings();
    setSettings(s);
    setLoadingSettings(false);
  }, []);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setStatsError(null);
    try {
      const res = await fetch("/api/admin/cache/monitoring/stats", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data.stats ?? null);
    } catch (err) {
      setStatsError(
        err instanceof Error ? err.message : "Failed to load cache stats.",
      );
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadLogs = useCallback(
    async (offset = 0) => {
      setLoadingLogs(true);
      try {
        const res = await fetch(
          `/api/admin/cache/monitoring/purge-logs?limit=20&offset=${offset}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setLogs(data.logs ?? []);
        setLogsTotal(data.total ?? 0);
        setLogsOffset(offset);
      } catch {
        // Silently ignore — logs table just stays empty.
      } finally {
        setLoadingLogs(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadSettings();
    loadStats();
    loadLogs(0);

    // Auto-refresh stats every 30 s while the page is open.
    statsTimerRef.current = setInterval(() => {
      loadStats();
    }, 30000);

    return () => {
      if (statsTimerRef.current) clearInterval(statsTimerRef.current);
    };
  }, [loadSettings, loadStats, loadLogs]);

  // ── Patch helpers ──────────────────────────────────────────────────────────

  function patchSettings(partial: Partial<MonitoringCacheSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  function patchTtl(partial: Partial<MonitoringCacheSettings["ttl"]>) {
    setSettings((prev) =>
      prev ? { ...prev, ttl: { ...prev.ttl, ...partial } } : prev,
    );
  }

  function patchAutoCleanup(
    partial: Partial<MonitoringCacheSettings["autoCleanup"]>,
  ) {
    setSettings((prev) =>
      prev
        ? { ...prev, autoCleanup: { ...prev.autoCleanup, ...partial } }
        : prev,
    );
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!settings) return;
    setSaveState("saving");
    setSaveError(null);

    try {
      const res = await fetch("/api/admin/cache/monitoring/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings.enabled,
          cacheType: settings.cacheType,
          redisHost: settings.redisHost,
          redisPort: settings.redisPort,
          redisDb: settings.redisDb,
          memcachedServers: settings.memcachedServers,
          maxStorageMb: settings.maxStorageMb,
          ttl: settings.ttl,
          autoCleanup: {
            enabled: settings.autoCleanup.enabled,
            intervalHours: settings.autoCleanup.intervalHours,
            maxAgeHours: settings.autoCleanup.maxAgeHours,
            targetUsagePct: settings.autoCleanup.targetUsagePct,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }

      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch (err) {
      setSaveState("error");
      setSaveError(
        err instanceof Error ? err.message : "Save failed — please retry.",
      );
      setTimeout(() => setSaveState("idle"), 4000);
    }
  }

  // ── Purge All ──────────────────────────────────────────────────────────────

  async function handlePurgeAll() {
    if (purgeAllState === "idle") {
      setPurgeAllState("confirming");
      return;
    }
    if (purgeAllState !== "confirming") return;

    setPurgeAllState("purging");
    setPurgeAllMsg(null);

    try {
      const res = await fetch("/api/admin/cache/monitoring/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }

      const { purgeCount, purgeSizeBytes, message } = data as {
        purgeCount: number;
        purgeSizeBytes: number;
        message: string | null;
      };

      setPurgeAllMsg(
        `Cleared ${purgeCount.toLocaleString()} entries${purgeSizeBytes > 0 ? ` (${formatBytes(purgeSizeBytes)} freed)` : ""}${message ? ` — ${message}` : ""}`,
      );
      setPurgeAllState("done");
      loadLogs(0);
      loadStats();
    } catch (err) {
      setPurgeAllState("error");
      setPurgeAllMsg(
        err instanceof Error ? err.message : "Purge failed — check logs.",
      );
    } finally {
      setTimeout(() => {
        setPurgeAllState("idle");
        setPurgeAllMsg(null);
      }, 5000);
    }
  }

  // ── Purge Selected ─────────────────────────────────────────────────────────

  function toggleLayer(key: CacheLayerKey) {
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handlePurgeSelected() {
    if (selectedLayers.size === 0) return;
    setPurgeSelState("purging");
    setPurgeSelMsg(null);

    try {
      const res = await fetch("/api/admin/cache/monitoring/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "selected",
          scope: [...selectedLayers],
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ?? `HTTP ${res.status}`,
        );
      }

      const { purgeCount, purgeSizeBytes, message } = data as {
        purgeCount: number;
        purgeSizeBytes: number;
        message: string | null;
      };

      setPurgeSelMsg(
        `Cleared ${purgeCount.toLocaleString()} entries${purgeSizeBytes > 0 ? ` (${formatBytes(purgeSizeBytes)} freed)` : ""}${message ? ` — ${message}` : ""}`,
      );
      setPurgeSelState("done");
      setSelectedLayers(new Set());
      loadLogs(0);
      loadStats();
    } catch (err) {
      setPurgeSelState("error");
      setPurgeSelMsg(
        err instanceof Error ? err.message : "Purge failed — check logs.",
      );
    } finally {
      setTimeout(() => {
        setPurgeSelState("idle");
        setPurgeSelMsg(null);
      }, 5000);
    }
  }

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (loadingSettings && !settings) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-faint">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  if (!settings) return null;

  const usagePct =
    stats && stats.maxBytes > 0
      ? Math.round((stats.usedBytes / stats.maxBytes) * 100)
      : null;

  const lastPurge =
    logs.length > 0
      ? new Date(logs[0].triggeredAt).toLocaleString(undefined, {
          dateStyle: "short",
          timeStyle: "short",
        })
      : null;

  const allLayerKeys = Object.keys(CACHE_LAYER_LABELS) as CacheLayerKey[];

  return (
    <div className="max-w-4xl">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">
          Cache Monitoring &amp; Observability
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-text-faint">
          Cross-layer visibility into what is stored, how much space it
          occupies, when it was last cleared, and how it maintains itself.
          Configure per-layer TTLs, trigger manual purges, and schedule
          automatic cleanup from one place.
        </p>
      </div>

      {/* ── 1. Live Status Dashboard ─────────────────────────────────────────  */}
      <h2 className="mb-2 mt-0 flex items-center gap-2 text-sm font-bold text-white">
        <Activity size={15} className="text-[var(--color-menu-yellow)]" />
        1. Cache Status
      </h2>
      <div className="glass mb-4 flex flex-col gap-5 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <HealthChip status={stats?.status ?? "unknown"} />
            <CacheTypeChip type={settings.cacheType} />
          </div>
          <button
            type="button"
            onClick={loadStats}
            disabled={loadingStats}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingStats ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCcw size={12} />
            )}
            Refresh
          </button>
        </div>

        {statsError && (
          <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-4 py-3 text-xs text-red-400">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {statsError}
          </div>
        )}

        {stats && !statsError && (
          <>
            {/* Storage usage bar */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-text-faint">
                Cache Storage Usage
              </span>
              <StorageBar usedBytes={stats.usedBytes} maxBytes={stats.maxBytes} />
              {usagePct !== null && usagePct >= settings.autoCleanup.targetUsagePct && (
                <span className="text-xs text-amber-400">
                  ⚠ Above auto-cleanup threshold (
                  {settings.autoCleanup.targetUsagePct}%)
                </span>
              )}
            </div>

            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                  Cache Size
                </span>
                <span className="text-sm font-bold text-white">
                  {formatBytes(stats.usedBytes)}
                </span>
              </div>
              <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                  Entries
                </span>
                <span className="text-sm font-bold text-white">
                  {stats.entryCount.toLocaleString()}
                </span>
              </div>
              <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                  Hit Rate
                </span>
                <span className="text-sm font-bold text-white">
                  {stats.hitRate !== null ? `${stats.hitRate}%` : "—"}
                </span>
              </div>
              <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                  Last Purge
                </span>
                <span className="text-sm font-bold text-white">
                  {lastPurge ?? "Never"}
                </span>
              </div>
            </div>

            {/* Snapshot timestamp */}
            <p className="text-[11px] text-text-faint">
              Snapshot at{" "}
              {new Date(stats.snapshotAt).toLocaleTimeString(undefined, {
                timeStyle: "medium",
              })}{" "}
              · auto-refreshes every 30 s
            </p>
          </>
        )}

        {/* Cache type selector */}
        <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
          <span className="text-xs font-bold uppercase tracking-wider text-text-faint">
            Cache Type
          </span>
          <div className="flex flex-wrap gap-2">
            {(["redis", "file", "memcached"] as CacheBackendType[]).map(
              (type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => patchSettings({ cacheType: type })}
                  className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                    settings.cacheType === type
                      ? "bg-[var(--color-menu-yellow)] text-black"
                      : "bg-white/10 text-white hover:bg-white/15"
                  }`}
                >
                  <CacheTypeChip type={type} />
                  {type === settings.cacheType && <Check size={11} />}
                </button>
              ),
            )}
          </div>

          {settings.cacheType === "redis" && (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-white">
                  Redis Host
                </span>
                <input
                  type="text"
                  value={settings.redisHost}
                  onChange={(e) =>
                    patchSettings({ redisHost: e.target.value })
                  }
                  placeholder="127.0.0.1"
                  className="glass rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                />
              </div>
              <NumberField
                label="Port"
                value={settings.redisPort}
                min={1}
                max={65535}
                onChange={(v) => patchSettings({ redisPort: v })}
              />
              <NumberField
                label="Database"
                value={settings.redisDb}
                min={0}
                max={15}
                onChange={(v) => patchSettings({ redisDb: v })}
              />
            </div>
          )}

          <NumberField
            label="Maximum storage ceiling"
            hint="Entries exceeding this limit will be evicted by the cache backend. Set to 0 for no hard limit."
            value={settings.maxStorageMb}
            min={MAX_STORAGE_MB_LIMITS.min}
            max={MAX_STORAGE_MB_LIMITS.max}
            suffix="MB"
            onChange={(v) => patchSettings({ maxStorageMb: v })}
          />
        </div>
      </div>

      {/* ── 2. Purge Controls ────────────────────────────────────────────────── */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Trash2 size={15} className="text-[var(--color-menu-yellow)]" />
        2. Purge Controls
      </h2>

      {/* Purge All */}
      <Section
        title="Purge All Cache"
        hint="Immediately flush every cache layer — full page, API, objects, fragments, images, static assets, sessions, DNS, search, and feeds. Use during deployments or after data changes that affect the whole site."
        icon={<Trash2 size={16} />}
        defaultOpen={true}
      >
        <div className="flex flex-col gap-3">
          {purgeAllMsg && (
            <div
              className={`flex items-start gap-2 rounded-xl px-4 py-3 text-xs ${
                purgeAllState === "error"
                  ? "bg-red-500/10 text-red-400"
                  : "bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {purgeAllState === "error" ? (
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              ) : (
                <Check size={13} className="mt-0.5 shrink-0" />
              )}
              {purgeAllMsg}
            </div>
          )}

          {purgeAllState === "confirming" && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              This will immediately clear all cached entries across every layer.
              Click again to confirm.
            </div>
          )}

          <button
            type="button"
            onClick={handlePurgeAll}
            disabled={
              purgeAllState === "purging" || purgeAllState === "done"
            }
            className={`flex w-fit items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              purgeAllState === "confirming"
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-white/10 text-white hover:bg-white/15"
            }`}
          >
            {purgeAllState === "purging" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : purgeAllState === "done" ? (
              <Check size={15} />
            ) : (
              <Trash2 size={15} />
            )}
            {purgeAllState === "confirming"
              ? "Confirm — Purge All"
              : purgeAllState === "purging"
                ? "Purging…"
                : purgeAllState === "done"
                  ? "Purged"
                  : "Purge All Cache"}
          </button>
        </div>
      </Section>

      {/* Purge Selected */}
      <Section
        title="Purge Selected Cache"
        hint="Flush only the cache layers you choose. Useful for targeting stale data after a partial deployment or content update."
        icon={<Layers3 size={16} />}
        defaultOpen={true}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {allLayerKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleLayer(key)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition-colors ${
                  selectedLayers.has(key)
                    ? "bg-[var(--color-menu-yellow)] text-black"
                    : "bg-white/10 text-white hover:bg-white/15"
                }`}
              >
                {selectedLayers.has(key) && <Check size={11} />}
                {CACHE_LAYER_LABELS[key]}
              </button>
            ))}
          </div>

          {purgeSelMsg && (
            <div
              className={`flex items-start gap-2 rounded-xl px-4 py-3 text-xs ${
                purgeSelState === "error"
                  ? "bg-red-500/10 text-red-400"
                  : "bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {purgeSelState === "error" ? (
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              ) : (
                <Check size={13} className="mt-0.5 shrink-0" />
              )}
              {purgeSelMsg}
            </div>
          )}

          <button
            type="button"
            onClick={handlePurgeSelected}
            disabled={
              selectedLayers.size === 0 ||
              purgeSelState === "purging" ||
              purgeSelState === "done"
            }
            className="flex w-fit items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {purgeSelState === "purging" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : purgeSelState === "done" ? (
              <Check size={15} />
            ) : (
              <Trash2 size={15} />
            )}
            {purgeSelState === "purging"
              ? "Purging…"
              : purgeSelState === "done"
                ? "Done"
                : selectedLayers.size > 0
                  ? `Purge ${selectedLayers.size} layer${selectedLayers.size > 1 ? "s" : ""}`
                  : "Select layers above"}
          </button>
        </div>
      </Section>

      {/* ── 3. Cache TTL Configuration ───────────────────────────────────────── */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Clock size={15} className="text-[var(--color-menu-yellow)]" />
        3. Cache TTL (Expiration Time)
      </h2>
      <Section
        title="Per-Layer TTL Defaults"
        hint="Default time-to-live for each cache layer. Individual sections (Object Cache, Fragment Cache, etc.) carry their own fine-grained TTL controls — these are the cross-layer reference values shown in monitoring dashboards."
        icon={<Clock size={16} />}
      >
        <ToggleField
          label="Monitoring enabled"
          hint="Master switch — disables live stats polling and automatic cleanup without discarding TTL or cleanup configuration."
          checked={settings.enabled}
          onChange={(v) => patchSettings({ enabled: v })}
        />
        <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {TTL_LAYERS.map(({ key, label, hint }) => {
            const value = settings.ttl[key];
            return (
              <div key={key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">
                    {label}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-bold text-[var(--color-menu-yellow)]">
                    {formatTtl(value)}
                  </span>
                </div>
                <span className="text-xs text-text-faint">{hint}</span>
                <input
                  type="number"
                  min={TTL_LIMITS.min}
                  max={TTL_LIMITS.max}
                  value={value}
                  onChange={(e) =>
                    patchTtl({
                      [key]: Math.min(
                        TTL_LIMITS.max,
                        Math.max(
                          TTL_LIMITS.min,
                          Number(e.target.value) || TTL_LIMITS.min,
                        ),
                      ),
                    })
                  }
                  className="glass mt-1 w-40 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                />
                <span className="text-[11px] text-text-faint">
                  seconds (default:{" "}
                  {formatTtl(
                    DEFAULT_TTL_SETTINGS[key],
                  )})
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── 4. Automatic Cache Cleanup ───────────────────────────────────────── */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <RefreshCcw size={15} className="text-[var(--color-menu-yellow)]" />
        4. Automatic Cache Cleanup
      </h2>
      <Section
        title="Auto Cleanup"
        hint="Scheduled self-maintenance that evicts expired and least-recently-used entries before storage fills up — works independently of each layer's own TTL-based expiry."
        icon={<RefreshCcw size={16} />}
      >
        <ToggleField
          label="Enable automatic cleanup"
          hint="Runs the cleanup job on the configured interval. Disable only if you manage eviction through the cache backend itself (e.g. Redis maxmemory-policy)."
          checked={settings.autoCleanup.enabled}
          onChange={(v) => patchAutoCleanup({ enabled: v })}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NumberField
            label="Cleanup interval"
            hint="How often the cleanup job runs."
            value={settings.autoCleanup.intervalHours}
            min={CLEANUP_INTERVAL_LIMITS.min}
            max={CLEANUP_INTERVAL_LIMITS.max}
            suffix="hours"
            disabled={!settings.autoCleanup.enabled}
            onChange={(v) => patchAutoCleanup({ intervalHours: v })}
          />
          <NumberField
            label="Max entry age"
            hint="Entries older than this are always evicted, regardless of hit frequency."
            value={settings.autoCleanup.maxAgeHours}
            min={CLEANUP_MAX_AGE_LIMITS.min}
            max={CLEANUP_MAX_AGE_LIMITS.max}
            suffix="hours"
            disabled={!settings.autoCleanup.enabled}
            onChange={(v) => patchAutoCleanup({ maxAgeHours: v })}
          />
          <NumberField
            label="Usage trigger threshold"
            hint="Cleanup runs early when storage usage exceeds this percentage, even outside the normal interval."
            value={settings.autoCleanup.targetUsagePct}
            min={CLEANUP_USAGE_PCT_LIMITS.min}
            max={CLEANUP_USAGE_PCT_LIMITS.max}
            suffix="%"
            disabled={!settings.autoCleanup.enabled}
            onChange={(v) => patchAutoCleanup({ targetUsagePct: v })}
          />
        </div>

        {/* Last cleanup stats */}
        <div className="mt-1 grid grid-cols-2 gap-2 rounded-xl bg-white/5 px-4 py-3 sm:grid-cols-4">
          <StatRow
            label="Last cleanup"
            value={
              settings.autoCleanup.lastCleanupAt
                ? new Date(
                    settings.autoCleanup.lastCleanupAt,
                  ).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "Never"
            }
          />
          <StatRow
            label="Status"
            value={
              settings.autoCleanup.lastCleanupStatus ? (
                <span
                  className={
                    settings.autoCleanup.lastCleanupStatus === "success"
                      ? "text-emerald-400"
                      : "text-red-400"
                  }
                >
                  {settings.autoCleanup.lastCleanupStatus
                    .charAt(0)
                    .toUpperCase() +
                    settings.autoCleanup.lastCleanupStatus.slice(1)}
                </span>
              ) : (
                "—"
              )
            }
          />
          <StatRow
            label="Freed"
            value={formatBytes(settings.autoCleanup.lastCleanupFreedBytes)}
          />
          <StatRow
            label="Entries removed"
            value={settings.autoCleanup.lastCleanupRemovedCount.toLocaleString()}
          />
        </div>
      </Section>

      {/* ── Save bar ─────────────────────────────────────────────────────────── */}
      <div className="sticky bottom-4 z-10 mt-4">
        <div className="glass flex items-center justify-between gap-4 rounded-2xl px-6 py-4">
          <div>
            {saveError ? (
              <p className="text-xs text-red-400">{saveError}</p>
            ) : (
              <p className="text-xs text-text-faint">
                Changes apply to TTL defaults and cleanup configuration. Cache
                type and Redis connection take effect on next server restart.
              </p>
            )}
          </div>
          <SaveButton state={saveState} onClick={handleSave} />
        </div>
      </div>

      {/* ── 5. Purge Logs ────────────────────────────────────────────────────── */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <BarChart3 size={15} className="text-[var(--color-menu-yellow)]" />
        5. Cache Purge Logs
      </h2>
      <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-faint">
            Every purge action — manual or automatic — is logged here.{" "}
            {logsTotal > 0 && (
              <span className="text-white">
                {logsTotal.toLocaleString()} total entries.
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => loadLogs(0)}
            disabled={loadingLogs}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {loadingLogs ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCcw size={12} />
            )}
            Refresh
          </button>
        </div>

        {loadingLogs && logs.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm text-text-faint">
            <Loader2 size={14} className="animate-spin" /> Loading logs…
          </div>
        ) : logs.length === 0 ? (
          <p className="py-4 text-sm text-text-faint">
            No purge operations logged yet. Purge actions appear here
            immediately.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="pb-2 pr-4 text-[11px] font-bold uppercase tracking-wider text-text-faint">
                      When
                    </th>
                    <th className="pb-2 pr-4 text-[11px] font-bold uppercase tracking-wider text-text-faint">
                      Type
                    </th>
                    <th className="pb-2 pr-4 text-[11px] font-bold uppercase tracking-wider text-text-faint">
                      Scope
                    </th>
                    <th className="pb-2 pr-4 text-[11px] font-bold uppercase tracking-wider text-text-faint">
                      Cleared
                    </th>
                    <th className="pb-2 pr-4 text-[11px] font-bold uppercase tracking-wider text-text-faint">
                      Status
                    </th>
                    <th className="pb-2 text-[11px] font-bold uppercase tracking-wider text-text-faint">
                      By
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <PurgeLogRow key={log.id} log={log} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {logsTotal > 20 && (
              <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-3">
                <span className="text-xs text-text-faint">
                  Showing {logsOffset + 1}–
                  {Math.min(logsOffset + 20, logsTotal)} of{" "}
                  {logsTotal.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => loadLogs(Math.max(0, logsOffset - 20))}
                    disabled={logsOffset === 0 || loadingLogs}
                    className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => loadLogs(logsOffset + 20)}
                    disabled={
                      logsOffset + 20 >= logsTotal || loadingLogs
                    }
                    className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
