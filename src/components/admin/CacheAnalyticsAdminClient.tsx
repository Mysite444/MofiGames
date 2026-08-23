"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Save,
  Check,
  BarChart3,
  Users,
  Trophy,
  FileText,
  Layers,
  Trash2,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  Gamepad2,
} from "lucide-react";
import {
  mapAnalyticsCacheRow,
  DEFAULT_ANALYTICS_CACHE_SETTINGS,
  DASHBOARD_STATS_TTL_LIMITS,
  DASHBOARD_STATS_SWR_LIMITS,
  VISITOR_COUNTS_TTL_LIMITS,
  VISITOR_COUNTS_RETENTION_LIMITS,
  POPULAR_GAMES_TTL_LIMITS,
  POPULAR_GAMES_TOP_N_LIMITS,
  POPULAR_GAMES_WINDOW_DAYS_LIMITS,
  REPORTS_TTL_LIMITS,
  REPORTS_MAX_RANGE_LIMITS,
  AGGREGATED_METRICS_TTL_LIMITS,
  AGGREGATED_METRICS_BATCH_SIZE_LIMITS,
  AGGREGATED_METRICS_INTERVAL_HOURS_LIMITS,
  type AnalyticsCacheSettings,
  type VisitorCountsResolution,
  type AggregationWindow,
} from "@/lib/analytics-cache-settings";

// ── Re-usable building blocks (same pattern as CacheEdgeAdminClient) ─────────

function Section({
  title,
  hint,
  children,
  icon,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
      <div>
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-faint">
          {icon && <span className="text-[var(--color-menu-yellow)]">{icon}</span>}
          {title}
        </h2>
        {hint && <p className="mt-1 text-xs text-text-faint">{hint}</p>}
      </div>
      {children}
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
  unit,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${disabled ? "opacity-50" : ""}`}>
      <span className="text-xs font-semibold text-white/70">{label}</span>
      {hint && <span className="text-[11px] text-text-faint">{hint}</span>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
          className="admin-input w-32"
        />
        {unit && <span className="text-xs text-text-faint">{unit}</span>}
      </div>
    </label>
  );
}

function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-2 ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
            value === opt.value ? "bg-white/10" : "hover:bg-white/5"
          }`}
        >
          <input
            type="radio"
            name={name}
            className="mt-1"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span>
            <span className="block text-sm font-semibold text-white">{opt.label}</span>
            <span className="block text-xs text-text-faint">{opt.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

// ── Stat chips ────────────────────────────────────────────────────────────────

interface LiveStats {
  totalGames: number;
  totalUsers: number;
  cacheAgeSec: number | null;
  shortestTtlSec: number | null;
  lastAggregatedAt: string | null;
  lastAggregationStatus: string | null;
  lastAggregationRowsProcessed: number | null;
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "neutral" | "hot";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-500/15 text-emerald-400"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-400"
        : tone === "hot"
          ? "bg-red-500/15 text-red-400"
          : "bg-white/10 text-text-faint";
  return (
    <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">{label}</span>
      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-bold ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

// ── Resolution options ────────────────────────────────────────────────────────

const RESOLUTION_OPTIONS: { value: VisitorCountsResolution; label: string; hint: string }[] = [
  {
    value: "realtime",
    label: "Real-time (≤ 30 s TTL)",
    hint: "Best for live visitor counter widgets. High DB read rate — use only if you have a live dashboard that polls frequently.",
  },
  {
    value: "minutely",
    label: "Minutely",
    hint: "1-minute buckets. Good for dashboards that refresh every minute. Balances freshness with DB load.",
  },
  {
    value: "hourly",
    label: "Hourly (recommended)",
    hint: "Cached for the TTL you configure above. Best trade-off between freshness and cost for most analytics dashboards.",
  },
  {
    value: "daily",
    label: "Daily",
    hint: "Aggregated once per day. Lowest DB cost — ideal for historical trend charts and end-of-day reports.",
  },
];

const AGGREGATION_WINDOW_OPTIONS: { value: AggregationWindow; label: string; hint: string }[] = [
  {
    value: "hourly",
    label: "Hourly",
    hint: "Roll up every hour. Most granular — suits near-realtime operational dashboards. Higher storage cost.",
  },
  {
    value: "daily",
    label: "Daily (recommended)",
    hint: "Standard analytics granularity. Gives per-day totals for plays, visitors, and conversion metrics.",
  },
  {
    value: "weekly",
    label: "Weekly",
    hint: "Lower storage, faster queries. Best for trend-over-time charts where day-level precision isn't required.",
  },
  {
    value: "monthly",
    label: "Monthly",
    hint: "Highest aggregation. Use for long-range reports (e.g. annual summaries) where storage is a concern.",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

function fmtAge(sec: number | null): string {
  if (sec === null) return "Never purged";
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

type PurgeScope =
  | "all"
  | "dashboard_stats"
  | "visitor_counts"
  | "popular_games"
  | "reports"
  | "aggregated_metrics";

/** Admin → Cache → Analytics Cache.
 * Five distinct analytics data-caching pillars: Dashboard Statistics,
 * Visitor Counts, Popular Games, Reports, and Aggregated Metrics. */
export function CacheAnalyticsAdminClient() {
  const [settings, setSettings] = useState<AnalyticsCacheSettings | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);

  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const [purging, setPurging]       = useState(false);
  const [purgeScope, setPurgeScope] = useState<PurgeScope>("all");
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeResult, setPurgeResult] = useState<{ scope: string; entriesRemoved: number; purgedAt: string } | null>(null);

  const [aggregating, setAggregating]   = useState(false);
  const [aggregateError, setAggregateError] = useState<string | null>(null);
  const [aggregateResult, setAggregateResult] = useState<{
    status: string;
    rowsProcessed: number;
    durationMs: number;
    errors?: string[];
  } | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadSettings = useCallback(() => {
    fetch("/api/admin/cache/analytics/settings")
      .then((r) => r.json())
      .then((data) => setSettings(mapAnalyticsCacheRow(data.settings)))
      .catch(() => setSettings(DEFAULT_ANALYTICS_CACHE_SETTINGS));
  }, []);

  const loadStats = useCallback(() => {
    fetch("/api/admin/cache/analytics/stats")
      .then((r) => r.json())
      .then((data) => setLiveStats(data.stats ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadSettings();
    loadStats();
  }, [loadSettings, loadStats]);

  // ── Patch helper ─────────────────────────────────────────────────────────

  function patch(p: Partial<AnalyticsCacheSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cache/analytics/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // 1. Dashboard Stats
          dashboardStatsEnabled: settings.dashboardStatsEnabled,
          dashboardStatsTtlSeconds: settings.dashboardStatsTtlSeconds,
          dashboardStatsStaleWhileRevalidate: settings.dashboardStatsStaleWhileRevalidate,
          // 2. Visitor Counts
          visitorCountsEnabled: settings.visitorCountsEnabled,
          visitorCountsTtlSeconds: settings.visitorCountsTtlSeconds,
          visitorCountsResolution: settings.visitorCountsResolution,
          visitorCountsRetentionDays: settings.visitorCountsRetentionDays,
          visitorCountsUniqueTracking: settings.visitorCountsUniqueTracking,
          // 3. Popular Games
          popularGamesEnabled: settings.popularGamesEnabled,
          popularGamesTtlSeconds: settings.popularGamesTtlSeconds,
          popularGamesTopN: settings.popularGamesTopN,
          popularGamesWindowDays: settings.popularGamesWindowDays,
          popularGamesScoreWeights: settings.popularGamesScoreWeights,
          popularGamesExcludeNsfw: settings.popularGamesExcludeNsfw,
          // 4. Reports
          reportsEnabled: settings.reportsEnabled,
          reportsTtlSeconds: settings.reportsTtlSeconds,
          reportsMaxRangeDays: settings.reportsMaxRangeDays,
          reportsPrecomputeEnabled: settings.reportsPrecomputeEnabled,
          reportsPrecomputeRanges: settings.reportsPrecomputeRanges,
          // 5. Aggregated Metrics
          aggregatedMetricsEnabled: settings.aggregatedMetricsEnabled,
          aggregatedMetricsTtlSeconds: settings.aggregatedMetricsTtlSeconds,
          aggregatedMetricsBatchSize: settings.aggregatedMetricsBatchSize,
          aggregatedMetricsWindow: settings.aggregatedMetricsWindow,
          aggregatedMetricsAutoRun: settings.aggregatedMetricsAutoRun,
          aggregatedMetricsRunIntervalHours: settings.aggregatedMetricsRunIntervalHours,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      setSettings(mapAnalyticsCacheRow(data.settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // ── Purge ─────────────────────────────────────────────────────────────────

  async function purge() {
    if (!confirm(`Purge analytics cache (${purgeScope})? Application-level cached data for this scope will be marked stale.`)) return;
    setPurging(true);
    setPurgeError(null);
    setPurgeResult(null);
    try {
      const res = await fetch("/api/admin/cache/analytics/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: purgeScope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Purge failed.");
      setPurgeResult({ scope: data.scope, entriesRemoved: data.entriesRemoved, purgedAt: data.purgedAt });
      setSettings(mapAnalyticsCacheRow(data.settings));
      loadStats();
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : "Purge failed.");
    } finally {
      setPurging(false);
    }
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────

  async function runAggregation() {
    setAggregating(true);
    setAggregateError(null);
    setAggregateResult(null);
    try {
      const res = await fetch("/api/admin/cache/analytics/aggregate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Aggregation failed.");
      setAggregateResult({
        status: data.status,
        rowsProcessed: data.rowsProcessed,
        durationMs: data.durationMs,
        errors: data.errors,
      });
      loadSettings();
      loadStats();
    } catch (err) {
      setAggregateError(err instanceof Error ? err.message : "Aggregation failed.");
    } finally {
      setAggregating(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  // ── Score weight display ──────────────────────────────────────────────────

  const weightTotal =
    settings.popularGamesScoreWeights.plays +
    settings.popularGamesScoreWeights.rating +
    settings.popularGamesScoreWeights.recency;
  const weightsUnbalanced = Math.abs(weightTotal - 1) > 0.01;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Analytics Cache</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Five pillars of analytics data caching — Dashboard Statistics, Visitor Counts, Popular Games,
            Reports, and Aggregated Metrics. Each has its own TTL and can be enabled, tuned, or purged
            independently. Save first, then run aggregation or purge as needed.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="glow-yellow-button flex shrink-0 items-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {/* ── Live stat chips ──────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {!liveStats ? (
          <div className="col-span-4 flex items-center gap-2 py-4 text-sm text-text-faint">
            <Loader2 size={16} className="animate-spin" /> Loading live stats…
          </div>
        ) : (
          <>
            <StatChip
              label="Games tracked"
              value={liveStats.totalGames.toLocaleString()}
              tone="neutral"
            />
            <StatChip
              label="Users tracked"
              value={liveStats.totalUsers.toLocaleString()}
              tone="neutral"
            />
            <StatChip
              label="Cache age"
              value={fmtAge(liveStats.cacheAgeSec)}
              tone={
                liveStats.cacheAgeSec === null
                  ? "neutral"
                  : liveStats.cacheAgeSec < (liveStats.shortestTtlSec ?? 300)
                    ? "emerald"
                    : "amber"
              }
            />
            <StatChip
              label="Last aggregation"
              value={
                liveStats.lastAggregationStatus === "success"
                  ? "OK"
                  : liveStats.lastAggregationStatus === "partial"
                    ? "Partial"
                    : liveStats.lastAggregationStatus === "failed"
                      ? "Failed"
                      : "Never run"
              }
              tone={
                liveStats.lastAggregationStatus === "success"
                  ? "emerald"
                  : liveStats.lastAggregationStatus === "partial"
                    ? "amber"
                    : liveStats.lastAggregationStatus === "failed"
                      ? "hot"
                      : "neutral"
              }
            />
          </>
        )}
      </div>

      {/* ══════════════════════ 1. Dashboard Statistics ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <BarChart3 size={15} className="text-[var(--color-menu-yellow)]" /> 1. Dashboard Statistics
      </h2>

      <Section
        title="Dashboard stats cache"
        hint="Caches the computed headline metrics shown on the admin overview — total games, total users, plays today, new signups, and similar aggregates. These are expensive to compute on every page load."
        icon={<BarChart3 size={13} />}
      >
        <ToggleField
          label="Enable Dashboard Statistics cache"
          hint="When disabled, every admin dashboard request computes these stats directly from the database — safe but slow."
          checked={settings.dashboardStatsEnabled}
          onChange={(v) => patch({ dashboardStatsEnabled: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Cache TTL"
            hint="How long the computed stats are served before a fresh DB read."
            value={settings.dashboardStatsTtlSeconds}
            min={DASHBOARD_STATS_TTL_LIMITS.min}
            max={DASHBOARD_STATS_TTL_LIMITS.max}
            unit="seconds"
            disabled={!settings.dashboardStatsEnabled}
            onChange={(v) => patch({ dashboardStatsTtlSeconds: v })}
          />
          <NumberField
            label="Stale-while-revalidate"
            hint="Serve stale stats for this extra window while a fresh computation runs in the background."
            value={settings.dashboardStatsStaleWhileRevalidate}
            min={DASHBOARD_STATS_SWR_LIMITS.min}
            max={DASHBOARD_STATS_SWR_LIMITS.max}
            unit="seconds"
            disabled={!settings.dashboardStatsEnabled}
            onChange={(v) => patch({ dashboardStatsStaleWhileRevalidate: v })}
          />
        </div>
        <p className="text-xs text-text-faint">
          Effective window: {fmtSeconds(settings.dashboardStatsTtlSeconds)} TTL + {fmtSeconds(settings.dashboardStatsStaleWhileRevalidate)} SWR ={" "}
          {fmtSeconds(settings.dashboardStatsTtlSeconds + settings.dashboardStatsStaleWhileRevalidate)} total freshness tolerance.
        </p>
      </Section>

      {/* ══════════════════════ 2. Visitor Counts ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Users size={15} className="text-[var(--color-menu-yellow)]" /> 2. Visitor Counts
      </h2>

      <Section
        title="Visitor count cache"
        hint="Page-view and unique-visitor counts cached at a configurable time resolution. Higher resolution = fresher data but more database reads. Retention controls how far back historical counts are kept."
        icon={<Users size={13} />}
      >
        <ToggleField
          label="Enable Visitor Counts cache"
          hint="When disabled, visitor counters are computed from raw event rows on every request — accurate but expensive at scale."
          checked={settings.visitorCountsEnabled}
          onChange={(v) => patch({ visitorCountsEnabled: v })}
        />
        <ToggleField
          label="Track unique visitors"
          hint="De-duplicates visitors within each time bucket using session or cookie identifiers. Adds a small overhead per event write."
          checked={settings.visitorCountsUniqueTracking}
          disabled={!settings.visitorCountsEnabled}
          onChange={(v) => patch({ visitorCountsUniqueTracking: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Cache TTL"
            hint="How long cached visitor counts are served before re-querying."
            value={settings.visitorCountsTtlSeconds}
            min={VISITOR_COUNTS_TTL_LIMITS.min}
            max={VISITOR_COUNTS_TTL_LIMITS.max}
            unit="seconds"
            disabled={!settings.visitorCountsEnabled}
            onChange={(v) => patch({ visitorCountsTtlSeconds: v })}
          />
          <NumberField
            label="Retention period"
            hint="How many days of visitor count history to keep. Older rows are pruned."
            value={settings.visitorCountsRetentionDays}
            min={VISITOR_COUNTS_RETENTION_LIMITS.min}
            max={VISITOR_COUNTS_RETENTION_LIMITS.max}
            unit="days"
            disabled={!settings.visitorCountsEnabled}
            onChange={(v) => patch({ visitorCountsRetentionDays: v })}
          />
        </div>
      </Section>

      <Section
        title="Count resolution"
        hint="Controls how finely visitor counts are bucketed in time. Finer resolution gives more granular charts but higher DB write volume."
        icon={<Clock size={13} />}
      >
        <RadioGroup<VisitorCountsResolution>
          name="visitor-resolution"
          value={settings.visitorCountsResolution}
          options={RESOLUTION_OPTIONS}
          onChange={(v) => patch({ visitorCountsResolution: v })}
          disabled={!settings.visitorCountsEnabled}
        />
      </Section>

      {/* ══════════════════════ 3. Popular Games ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Trophy size={15} className="text-[var(--color-menu-yellow)]" /> 3. Popular Games
      </h2>

      <Section
        title="Popular games cache"
        hint={`Cached ranked list of the top-${settings.popularGamesTopN} most popular games over the configured look-back window. Feeds the homepage "Popular" rail, category sidebars, and internal analytics reports.`}
        icon={<Gamepad2 size={13} />}
      >
        <ToggleField
          label="Enable Popular Games cache"
          hint="When disabled, the ranking is recomputed on every request — correct but slow for large game libraries."
          checked={settings.popularGamesEnabled}
          onChange={(v) => patch({ popularGamesEnabled: v })}
        />
        <ToggleField
          label="Exclude NSFW-tagged games"
          hint="Filters games with an nsfw=true flag from the popular list before caching. Recommended on unless NSFW content is a first-class part of the product."
          checked={settings.popularGamesExcludeNsfw}
          disabled={!settings.popularGamesEnabled}
          onChange={(v) => patch({ popularGamesExcludeNsfw: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NumberField
            label="Cache TTL"
            hint="How long the ranked list is served before recomputing."
            value={settings.popularGamesTtlSeconds}
            min={POPULAR_GAMES_TTL_LIMITS.min}
            max={POPULAR_GAMES_TTL_LIMITS.max}
            unit="seconds"
            disabled={!settings.popularGamesEnabled}
            onChange={(v) => patch({ popularGamesTtlSeconds: v })}
          />
          <NumberField
            label="Top-N games"
            hint="How many games to include in the ranked cache."
            value={settings.popularGamesTopN}
            min={POPULAR_GAMES_TOP_N_LIMITS.min}
            max={POPULAR_GAMES_TOP_N_LIMITS.max}
            unit="games"
            disabled={!settings.popularGamesEnabled}
            onChange={(v) => patch({ popularGamesTopN: v })}
          />
          <NumberField
            label="Look-back window"
            hint="Only events within this many days influence the score."
            value={settings.popularGamesWindowDays}
            min={POPULAR_GAMES_WINDOW_DAYS_LIMITS.min}
            max={POPULAR_GAMES_WINDOW_DAYS_LIMITS.max}
            unit="days"
            disabled={!settings.popularGamesEnabled}
            onChange={(v) => patch({ popularGamesWindowDays: v })}
          />
        </div>
      </Section>

      <Section
        title="Ranking score weights"
        hint="The popularity score is a weighted sum of three signals. Weights should sum to 1.0 — a non-zero deviation is warned below."
        icon={<BarChart3 size={13} />}
      >
        <div className={`grid grid-cols-3 gap-4 ${!settings.popularGamesEnabled ? "opacity-50 pointer-events-none" : ""}`}>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">Play count</span>
            <span className="text-[11px] text-text-faint">Weight for raw play volume (0–1)</span>
            <input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={settings.popularGamesScoreWeights.plays}
              onChange={(e) =>
                patch({
                  popularGamesScoreWeights: {
                    ...settings.popularGamesScoreWeights,
                    plays: Math.min(1, Math.max(0, Number(e.target.value))),
                  },
                })
              }
              className="admin-input"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">Rating</span>
            <span className="text-[11px] text-text-faint">Weight for average star rating (0–1)</span>
            <input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={settings.popularGamesScoreWeights.rating}
              onChange={(e) =>
                patch({
                  popularGamesScoreWeights: {
                    ...settings.popularGamesScoreWeights,
                    rating: Math.min(1, Math.max(0, Number(e.target.value))),
                  },
                })
              }
              className="admin-input"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">Recency</span>
            <span className="text-[11px] text-text-faint">Boost for recently-released games (0–1)</span>
            <input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={settings.popularGamesScoreWeights.recency}
              onChange={(e) =>
                patch({
                  popularGamesScoreWeights: {
                    ...settings.popularGamesScoreWeights,
                    recency: Math.min(1, Math.max(0, Number(e.target.value))),
                  },
                })
              }
              className="admin-input"
            />
          </label>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-faint">Sum:</span>
          <span className={`font-bold ${weightsUnbalanced ? "text-amber-400" : "text-emerald-400"}`}>
            {weightTotal.toFixed(2)}
          </span>
          {weightsUnbalanced && (
            <span className="text-amber-400">— weights should sum to 1.0 for a normalised score</span>
          )}
        </div>
      </Section>

      {/* ══════════════════════ 4. Reports ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <FileText size={15} className="text-[var(--color-menu-yellow)]" /> 4. Reports
      </h2>

      <Section
        title="Report data cache"
        hint="Pre-computed report payloads — CSV exports, date-range summaries, and funnel analyses. Reports are point-in-time snapshots so a long TTL is appropriate; the precompute option generates common date windows in the background so the first request is always a cache hit."
        icon={<FileText size={13} />}
      >
        <ToggleField
          label="Enable Reports cache"
          hint="Caches generated report data keyed by report type + date range. Disabling forces every report request to recompute from raw data."
          checked={settings.reportsEnabled}
          onChange={(v) => patch({ reportsEnabled: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Cache TTL"
            hint="How long a report result is served before regenerating."
            value={settings.reportsTtlSeconds}
            min={REPORTS_TTL_LIMITS.min}
            max={REPORTS_TTL_LIMITS.max}
            unit="seconds"
            disabled={!settings.reportsEnabled}
            onChange={(v) => patch({ reportsTtlSeconds: v })}
          />
          <NumberField
            label="Max date range"
            hint="Maximum number of days a single report can span. Wider ranges take longer to compute; cap them to protect DB performance."
            value={settings.reportsMaxRangeDays}
            min={REPORTS_MAX_RANGE_LIMITS.min}
            max={REPORTS_MAX_RANGE_LIMITS.max}
            unit="days"
            disabled={!settings.reportsEnabled}
            onChange={(v) => patch({ reportsMaxRangeDays: v })}
          />
        </div>
      </Section>

      <Section
        title="Report precomputation"
        hint="When enabled, the aggregation job pre-generates report data for the day windows listed below so they are served instantly on first request. Each window is one background DB query run during the aggregation pass."
        icon={<Database size={13} />}
      >
        <ToggleField
          label="Pre-compute common report windows"
          hint="Triggers background report generation for the windows listed below during each aggregation run."
          checked={settings.reportsPrecomputeEnabled}
          disabled={!settings.reportsEnabled}
          onChange={(v) => patch({ reportsPrecomputeEnabled: v })}
        />
        <div className={`${settings.reportsPrecomputeEnabled && settings.reportsEnabled ? "" : "pointer-events-none opacity-50"}`}>
          <p className="mb-2 text-xs text-text-faint">
            Day windows to precompute (e.g. 7 = last 7 days). Up to 10 windows.
          </p>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30, 60, 90, 180, 365].map((days) => {
              const active = settings.reportsPrecomputeRanges.includes(days);
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() =>
                    patch({
                      reportsPrecomputeRanges: active
                        ? settings.reportsPrecomputeRanges.filter((d) => d !== days)
                        : [...settings.reportsPrecomputeRanges, days].sort((a, b) => a - b),
                    })
                  }
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-[var(--color-menu-yellow)] text-black"
                      : "bg-white/10 text-white/70 hover:bg-white/15"
                  }`}
                >
                  {days}d
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-text-faint">
            Selected: {settings.reportsPrecomputeRanges.length === 0 ? "none" : settings.reportsPrecomputeRanges.map((d) => `${d}d`).join(", ")}
          </p>
        </div>
      </Section>

      {/* ══════════════════════ 5. Aggregated Metrics ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Layers size={15} className="text-[var(--color-menu-yellow)]" /> 5. Aggregated Metrics
      </h2>

      <Section
        title="Aggregation pipeline"
        hint="Roll-up computations (plays per game per day, session durations, conversion rates) that are too expensive to compute on the fly. The pipeline reads raw event rows, groups them by the configured window, and writes summarised rows that dashboards and reports read from."
        icon={<Layers size={13} />}
      >
        <ToggleField
          label="Enable Aggregated Metrics"
          hint="When disabled, all analytics reads fall back to raw event rows — accurate but slow at any meaningful traffic volume."
          checked={settings.aggregatedMetricsEnabled}
          onChange={(v) => patch({ aggregatedMetricsEnabled: v })}
        />
        <ToggleField
          label="Auto-run on schedule"
          hint="Triggers the aggregation pipeline automatically at the interval below. Disable to run aggregations manually only (useful during debugging or data migrations)."
          checked={settings.aggregatedMetricsAutoRun}
          disabled={!settings.aggregatedMetricsEnabled}
          onChange={(v) => patch({ aggregatedMetricsAutoRun: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NumberField
            label="Cache TTL"
            hint="How long aggregated results are served before re-reading the DB."
            value={settings.aggregatedMetricsTtlSeconds}
            min={AGGREGATED_METRICS_TTL_LIMITS.min}
            max={AGGREGATED_METRICS_TTL_LIMITS.max}
            unit="seconds"
            disabled={!settings.aggregatedMetricsEnabled}
            onChange={(v) => patch({ aggregatedMetricsTtlSeconds: v })}
          />
          <NumberField
            label="Batch size"
            hint="Number of raw event rows processed per aggregation batch. Smaller = more granular progress; larger = fewer round trips."
            value={settings.aggregatedMetricsBatchSize}
            min={AGGREGATED_METRICS_BATCH_SIZE_LIMITS.min}
            max={AGGREGATED_METRICS_BATCH_SIZE_LIMITS.max}
            unit="rows"
            disabled={!settings.aggregatedMetricsEnabled}
            onChange={(v) => patch({ aggregatedMetricsBatchSize: v })}
          />
          <NumberField
            label="Auto-run interval"
            hint="How often the aggregation pipeline runs automatically."
            value={settings.aggregatedMetricsRunIntervalHours}
            min={AGGREGATED_METRICS_INTERVAL_HOURS_LIMITS.min}
            max={AGGREGATED_METRICS_INTERVAL_HOURS_LIMITS.max}
            unit="hours"
            disabled={!settings.aggregatedMetricsEnabled || !settings.aggregatedMetricsAutoRun}
            onChange={(v) => patch({ aggregatedMetricsRunIntervalHours: v })}
          />
        </div>
      </Section>

      <Section
        title="Aggregation window"
        hint="Controls the granularity of the roll-up buckets written to the aggregate table. This affects storage size and the finest time resolution available in analytics charts — it cannot be changed retroactively without a data migration."
        icon={<Clock size={13} />}
      >
        <RadioGroup<AggregationWindow>
          name="agg-window"
          value={settings.aggregatedMetricsWindow}
          options={AGGREGATION_WINDOW_OPTIONS}
          onChange={(v) => patch({ aggregatedMetricsWindow: v })}
          disabled={!settings.aggregatedMetricsEnabled}
        />
        <div className="rounded-xl bg-amber-500/10 px-4 py-3">
          <p className="text-xs font-medium text-amber-300">
            Changing the aggregation window does not retroactively re-bucket existing aggregate rows.
            If you need historical data at a different granularity, run the aggregation manually after
            saving and consider a data migration for old rows.
          </p>
        </div>
      </Section>

      {/* ══════════════════════ Run Aggregation ══════════════════════ */}
      <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Run Aggregation Now</h2>
            <p className="mt-1 text-xs text-text-faint">
              Triggers a synchronous aggregation pass: computes popular-games rankings, visitor roll-ups,
              and dashboard stats in sequence. Save settings first. Results are written to the database
              immediately and served on the next cache miss.
            </p>
          </div>
          <button
            type="button"
            onClick={runAggregation}
            disabled={aggregating || !settings.aggregatedMetricsEnabled}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {aggregating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            {aggregating ? "Running…" : "Run Now"}
          </button>
        </div>

        {!settings.aggregatedMetricsEnabled && (
          <p className="text-sm text-text-faint">Enable Aggregated Metrics above to run the pipeline.</p>
        )}

        {aggregateError && (
          <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{aggregateError}</div>
        )}

        {aggregateResult && (
          <div className="flex flex-col gap-1.5 divide-y divide-white/5">
            <div className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-white/80">
                {aggregateResult.status === "success" ? (
                  <CheckCircle2 size={13} className="text-emerald-400" />
                ) : aggregateResult.status === "partial" ? (
                  <CheckCircle2 size={13} className="text-amber-400" />
                ) : (
                  <XCircle size={13} className="text-hot" />
                )}
                Status
              </span>
              <span className="text-right text-text-faint capitalize">{aggregateResult.status}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="font-semibold text-white/80">Rows processed</span>
              <span className="text-text-faint">{aggregateResult.rowsProcessed.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span className="font-semibold text-white/80">Duration</span>
              <span className="text-text-faint">{aggregateResult.durationMs}ms</span>
            </div>
            {aggregateResult.errors && aggregateResult.errors.length > 0 && (
              <div className="pt-2">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-400">Step errors</p>
                {aggregateResult.errors.map((e) => (
                  <p key={e} className="text-xs text-text-faint">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {settings.lastAggregatedAt && (
          <p className="text-[11px] text-text-faint">
            Last run {new Date(settings.lastAggregatedAt).toLocaleString()} —{" "}
            {settings.lastAggregationStatus === "success"
              ? "all steps succeeded"
              : settings.lastAggregationStatus === "partial"
                ? "some steps failed"
                : settings.lastAggregationStatus === "failed"
                  ? "failed"
                  : "unknown status"}
            {settings.lastAggregationRowsProcessed != null
              ? `, ${settings.lastAggregationRowsProcessed.toLocaleString()} rows`
              : ""}
            {settings.lastAggregationDurationMs != null
              ? `, ${settings.lastAggregationDurationMs}ms`
              : ""}
          </p>
        )}
      </div>

      {/* ══════════════════════ Purge Analytics Cache ══════════════════════ */}
      <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Purge Analytics Cache</h2>
            <p className="mt-1 text-xs text-text-faint">
              Marks the selected analytics cache scope as stale. The next request for that data will
              recompute from the database. Use "All" after a data import or schema migration.
            </p>
          </div>
          <button
            type="button"
            onClick={purge}
            disabled={purging}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {purging ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {purging ? "Purging…" : "Purge"}
          </button>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold text-white/70">Scope</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "all",                label: "All" },
                { value: "dashboard_stats",    label: "Dashboard Stats" },
                { value: "visitor_counts",     label: "Visitor Counts" },
                { value: "popular_games",      label: "Popular Games" },
                { value: "reports",            label: "Reports" },
                { value: "aggregated_metrics", label: "Aggregated Metrics" },
              ] as { value: PurgeScope; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPurgeScope(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  purgeScope === opt.value
                    ? "bg-[var(--color-menu-yellow)] text-black"
                    : "bg-white/10 text-white/70 hover:bg-white/15"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {purgeError && (
          <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{purgeError}</div>
        )}

        {purgeResult && (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <CheckCircle2 size={13} />
            Purged <strong>{purgeResult.scope}</strong> — {purgeResult.entriesRemoved} namespace{purgeResult.entriesRemoved !== 1 ? "s" : ""} invalidated at{" "}
            {new Date(purgeResult.purgedAt).toLocaleTimeString()}.
          </div>
        )}

        {settings.lastPurgedAt && !purgeResult && (
          <p className="text-[11px] text-text-faint">
            Last purge: <strong>{settings.lastPurgeScope ?? "all"}</strong> at{" "}
            {new Date(settings.lastPurgedAt).toLocaleString()}.
          </p>
        )}
      </div>

      {/* ══════════════════════ Notes callout ══════════════════════ */}
      <div className="glass rounded-2xl p-5">
        <h2 className="mb-1 text-sm font-bold text-white">Architecture notes</h2>
        <p className="text-xs text-text-faint">
          Analytics cache TTLs apply at the application layer — not at the CDN or browser level. Dashboard
          routes that read these pillars should respect the TTLs configured here by using{" "}
          <code className="text-white/70">cache: "no-store"</code> on fetch calls to these API routes and
          implementing their own in-process or Redis-backed TTL keyed on{" "}
          <code className="text-white/70">analytics_cache_settings.updated_at</code>. The Auto-run interval
          integrates with Admin → Automation → Infra — if you prefer cron-driven aggregation, set the same
          interval there and disable Auto-run above to avoid double-processing.
        </p>
      </div>
    </div>
  );
}
