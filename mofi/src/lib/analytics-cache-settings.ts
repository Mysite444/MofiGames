// Shared between CacheAnalyticsAdminClient and the API routes under
// src/app/api/admin/cache/analytics/**. Pure mapper, no IO. See migration
// 0046_analytics_cache.sql for the table and the reasoning behind the
// five-pillar split (Dashboard Statistics / Visitor Counts / Popular Games /
// Reports / Aggregated Metrics).

export type VisitorCountsResolution = "realtime" | "minutely" | "hourly" | "daily";
export type AggregationWindow = "hourly" | "daily" | "weekly" | "monthly";
export type AnalyticsPurgeScope =
  | "all"
  | "dashboard_stats"
  | "visitor_counts"
  | "popular_games"
  | "reports"
  | "aggregated_metrics";
export type AggregationStatus = "success" | "partial" | "failed";

export interface PopularGamesScoreWeights {
  plays: number;    // 0–1, sum must equal 1
  rating: number;
  recency: number;
}

export interface AnalyticsCacheSettings {
  // ── 1. Dashboard Statistics ───────────────────────────────────────────────
  dashboardStatsEnabled: boolean;
  dashboardStatsTtlSeconds: number;
  dashboardStatsStaleWhileRevalidate: number;

  // ── 2. Visitor Counts ─────────────────────────────────────────────────────
  visitorCountsEnabled: boolean;
  visitorCountsTtlSeconds: number;
  visitorCountsResolution: VisitorCountsResolution;
  visitorCountsRetentionDays: number;
  visitorCountsUniqueTracking: boolean;

  // ── 3. Popular Games ──────────────────────────────────────────────────────
  popularGamesEnabled: boolean;
  popularGamesTtlSeconds: number;
  popularGamesTopN: number;
  popularGamesWindowDays: number;
  popularGamesScoreWeights: PopularGamesScoreWeights;
  popularGamesExcludeNsfw: boolean;

  // ── 4. Reports ────────────────────────────────────────────────────────────
  reportsEnabled: boolean;
  reportsTtlSeconds: number;
  reportsMaxRangeDays: number;
  reportsPrecomputeEnabled: boolean;
  reportsPrecomputeRanges: number[];   // e.g. [7, 30, 90] — day windows

  // ── 5. Aggregated Metrics ─────────────────────────────────────────────────
  aggregatedMetricsEnabled: boolean;
  aggregatedMetricsTtlSeconds: number;
  aggregatedMetricsBatchSize: number;
  aggregatedMetricsWindow: AggregationWindow;
  aggregatedMetricsAutoRun: boolean;
  aggregatedMetricsRunIntervalHours: number;

  // ── Purge tracking ────────────────────────────────────────────────────────
  lastPurgedAt: string | null;
  lastPurgeScope: AnalyticsPurgeScope | null;
  lastPurgeEntriesRemoved: number;

  // ── Aggregation tracking ──────────────────────────────────────────────────
  lastAggregatedAt: string | null;
  lastAggregationStatus: AggregationStatus | null;
  lastAggregationDurationMs: number | null;
  lastAggregationRowsProcessed: number | null;

  updatedAt: string;
}

// ── Validation limits ─────────────────────────────────────────────────────────

export const DASHBOARD_STATS_TTL_LIMITS = { min: 30, max: 3600 } as const;
export const DASHBOARD_STATS_SWR_LIMITS  = { min: 0,  max: 600  } as const;

export const VISITOR_COUNTS_TTL_LIMITS       = { min: 10, max: 86400  } as const;
export const VISITOR_COUNTS_RETENTION_LIMITS = { min: 1,  max: 730    } as const;

export const POPULAR_GAMES_TTL_LIMITS         = { min: 60,  max: 86400 } as const;
export const POPULAR_GAMES_TOP_N_LIMITS       = { min: 5,   max: 200   } as const;
export const POPULAR_GAMES_WINDOW_DAYS_LIMITS = { min: 1,   max: 90    } as const;

export const REPORTS_TTL_LIMITS           = { min: 60,  max: 86400 } as const;
export const REPORTS_MAX_RANGE_LIMITS     = { min: 1,   max: 730   } as const;

export const AGGREGATED_METRICS_TTL_LIMITS           = { min: 60, max: 86400 } as const;
export const AGGREGATED_METRICS_BATCH_SIZE_LIMITS    = { min: 50, max: 10000 } as const;
export const AGGREGATED_METRICS_INTERVAL_HOURS_LIMITS = { min: 1, max: 168   } as const;

// ── Valid enum members ────────────────────────────────────────────────────────

const VISITOR_RESOLUTIONS: VisitorCountsResolution[] = ["realtime", "minutely", "hourly", "daily"];
const AGGREGATION_WINDOWS: AggregationWindow[]        = ["hourly", "daily", "weekly", "monthly"];
const AGGREGATION_STATUSES: AggregationStatus[]       = ["success", "partial", "failed"];
const PURGE_SCOPES: AnalyticsPurgeScope[]             = [
  "all", "dashboard_stats", "visitor_counts", "popular_games", "reports", "aggregated_metrics",
];

// ── Defaults — mirror migration column defaults ───────────────────────────────

export const DEFAULT_POPULAR_GAMES_SCORE_WEIGHTS: PopularGamesScoreWeights = {
  plays: 0.6,
  rating: 0.3,
  recency: 0.1,
};

export const DEFAULT_ANALYTICS_CACHE_SETTINGS: AnalyticsCacheSettings = {
  dashboardStatsEnabled: true,
  dashboardStatsTtlSeconds: 300,
  dashboardStatsStaleWhileRevalidate: 60,

  visitorCountsEnabled: true,
  visitorCountsTtlSeconds: 600,
  visitorCountsResolution: "hourly",
  visitorCountsRetentionDays: 90,
  visitorCountsUniqueTracking: true,

  popularGamesEnabled: true,
  popularGamesTtlSeconds: 900,
  popularGamesTopN: 50,
  popularGamesWindowDays: 7,
  popularGamesScoreWeights: { ...DEFAULT_POPULAR_GAMES_SCORE_WEIGHTS },
  popularGamesExcludeNsfw: true,

  reportsEnabled: true,
  reportsTtlSeconds: 3600,
  reportsMaxRangeDays: 365,
  reportsPrecomputeEnabled: false,
  reportsPrecomputeRanges: [7, 30, 90],

  aggregatedMetricsEnabled: true,
  aggregatedMetricsTtlSeconds: 1800,
  aggregatedMetricsBatchSize: 500,
  aggregatedMetricsWindow: "daily",
  aggregatedMetricsAutoRun: true,
  aggregatedMetricsRunIntervalHours: 6,

  lastPurgedAt: null,
  lastPurgeScope: null,
  lastPurgeEntriesRemoved: 0,

  lastAggregatedAt: null,
  lastAggregationStatus: null,
  lastAggregationDurationMs: null,
  lastAggregationRowsProcessed: null,

  updatedAt: new Date(0).toISOString(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapScoreWeights(raw: unknown): PopularGamesScoreWeights {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_POPULAR_GAMES_SCORE_WEIGHTS };
  const r = raw as Record<string, unknown>;
  const plays   = clamp(Number(r.plays   ?? DEFAULT_POPULAR_GAMES_SCORE_WEIGHTS.plays),   0, 1);
  const rating  = clamp(Number(r.rating  ?? DEFAULT_POPULAR_GAMES_SCORE_WEIGHTS.rating),  0, 1);
  const recency = clamp(Number(r.recency ?? DEFAULT_POPULAR_GAMES_SCORE_WEIGHTS.recency), 0, 1);
  return { plays, rating, recency };
}

function mapPrecomputeRanges(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [7, 30, 90];
  return raw
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0 && n <= REPORTS_MAX_RANGE_LIMITS.max)
    .slice(0, 10); // hard cap: 10 precomputed ranges is more than enough
}

// ── Row mapper — snake_case DB row → camelCase AnalyticsCacheSettings ─────────

export function mapAnalyticsCacheRow(row: Record<string, unknown> | null): AnalyticsCacheSettings {
  if (!row) return DEFAULT_ANALYTICS_CACHE_SETTINGS;
  const d = DEFAULT_ANALYTICS_CACHE_SETTINGS;

  const resolution  = String(row.visitor_counts_resolution ?? "");
  const aggWindow   = String(row.aggregated_metrics_window ?? "");
  const aggStatus   = String(row.last_aggregation_status   ?? "");
  const purgeScope  = String(row.last_purge_scope ?? "");

  return {
    // 1. Dashboard Stats
    dashboardStatsEnabled: Boolean(row.dashboard_stats_enabled ?? d.dashboardStatsEnabled),
    dashboardStatsTtlSeconds: clamp(
      Number(row.dashboard_stats_ttl_seconds ?? d.dashboardStatsTtlSeconds),
      DASHBOARD_STATS_TTL_LIMITS.min,
      DASHBOARD_STATS_TTL_LIMITS.max,
    ),
    dashboardStatsStaleWhileRevalidate: clamp(
      Number(row.dashboard_stats_stale_while_revalidate ?? d.dashboardStatsStaleWhileRevalidate),
      DASHBOARD_STATS_SWR_LIMITS.min,
      DASHBOARD_STATS_SWR_LIMITS.max,
    ),

    // 2. Visitor Counts
    visitorCountsEnabled: Boolean(row.visitor_counts_enabled ?? d.visitorCountsEnabled),
    visitorCountsTtlSeconds: clamp(
      Number(row.visitor_counts_ttl_seconds ?? d.visitorCountsTtlSeconds),
      VISITOR_COUNTS_TTL_LIMITS.min,
      VISITOR_COUNTS_TTL_LIMITS.max,
    ),
    visitorCountsResolution: VISITOR_RESOLUTIONS.includes(resolution as VisitorCountsResolution)
      ? (resolution as VisitorCountsResolution)
      : d.visitorCountsResolution,
    visitorCountsRetentionDays: clamp(
      Number(row.visitor_counts_retention_days ?? d.visitorCountsRetentionDays),
      VISITOR_COUNTS_RETENTION_LIMITS.min,
      VISITOR_COUNTS_RETENTION_LIMITS.max,
    ),
    visitorCountsUniqueTracking: Boolean(row.visitor_counts_unique_tracking ?? d.visitorCountsUniqueTracking),

    // 3. Popular Games
    popularGamesEnabled: Boolean(row.popular_games_enabled ?? d.popularGamesEnabled),
    popularGamesTtlSeconds: clamp(
      Number(row.popular_games_ttl_seconds ?? d.popularGamesTtlSeconds),
      POPULAR_GAMES_TTL_LIMITS.min,
      POPULAR_GAMES_TTL_LIMITS.max,
    ),
    popularGamesTopN: clamp(
      Number(row.popular_games_top_n ?? d.popularGamesTopN),
      POPULAR_GAMES_TOP_N_LIMITS.min,
      POPULAR_GAMES_TOP_N_LIMITS.max,
    ),
    popularGamesWindowDays: clamp(
      Number(row.popular_games_window_days ?? d.popularGamesWindowDays),
      POPULAR_GAMES_WINDOW_DAYS_LIMITS.min,
      POPULAR_GAMES_WINDOW_DAYS_LIMITS.max,
    ),
    popularGamesScoreWeights: mapScoreWeights(row.popular_games_score_weights),
    popularGamesExcludeNsfw: Boolean(row.popular_games_exclude_nsfw ?? d.popularGamesExcludeNsfw),

    // 4. Reports
    reportsEnabled: Boolean(row.reports_enabled ?? d.reportsEnabled),
    reportsTtlSeconds: clamp(
      Number(row.reports_ttl_seconds ?? d.reportsTtlSeconds),
      REPORTS_TTL_LIMITS.min,
      REPORTS_TTL_LIMITS.max,
    ),
    reportsMaxRangeDays: clamp(
      Number(row.reports_max_range_days ?? d.reportsMaxRangeDays),
      REPORTS_MAX_RANGE_LIMITS.min,
      REPORTS_MAX_RANGE_LIMITS.max,
    ),
    reportsPrecomputeEnabled: Boolean(row.reports_precompute_enabled ?? d.reportsPrecomputeEnabled),
    reportsPrecomputeRanges: mapPrecomputeRanges(row.reports_precompute_ranges),

    // 5. Aggregated Metrics
    aggregatedMetricsEnabled: Boolean(row.aggregated_metrics_enabled ?? d.aggregatedMetricsEnabled),
    aggregatedMetricsTtlSeconds: clamp(
      Number(row.aggregated_metrics_ttl_seconds ?? d.aggregatedMetricsTtlSeconds),
      AGGREGATED_METRICS_TTL_LIMITS.min,
      AGGREGATED_METRICS_TTL_LIMITS.max,
    ),
    aggregatedMetricsBatchSize: clamp(
      Number(row.aggregated_metrics_batch_size ?? d.aggregatedMetricsBatchSize),
      AGGREGATED_METRICS_BATCH_SIZE_LIMITS.min,
      AGGREGATED_METRICS_BATCH_SIZE_LIMITS.max,
    ),
    aggregatedMetricsWindow: AGGREGATION_WINDOWS.includes(aggWindow as AggregationWindow)
      ? (aggWindow as AggregationWindow)
      : d.aggregatedMetricsWindow,
    aggregatedMetricsAutoRun: Boolean(row.aggregated_metrics_auto_run ?? d.aggregatedMetricsAutoRun),
    aggregatedMetricsRunIntervalHours: clamp(
      Number(row.aggregated_metrics_run_interval_hours ?? d.aggregatedMetricsRunIntervalHours),
      AGGREGATED_METRICS_INTERVAL_HOURS_LIMITS.min,
      AGGREGATED_METRICS_INTERVAL_HOURS_LIMITS.max,
    ),

    // Purge tracking
    lastPurgedAt: row.last_purged_at ? String(row.last_purged_at) : null,
    lastPurgeScope: PURGE_SCOPES.includes(purgeScope as AnalyticsPurgeScope)
      ? (purgeScope as AnalyticsPurgeScope)
      : null,
    lastPurgeEntriesRemoved: Number(row.last_purge_entries_removed ?? 0),

    // Aggregation tracking
    lastAggregatedAt: row.last_aggregated_at ? String(row.last_aggregated_at) : null,
    lastAggregationStatus: AGGREGATION_STATUSES.includes(aggStatus as AggregationStatus)
      ? (aggStatus as AggregationStatus)
      : null,
    lastAggregationDurationMs:
      row.last_aggregation_duration_ms == null ? null : Number(row.last_aggregation_duration_ms),
    lastAggregationRowsProcessed:
      row.last_aggregation_rows_processed == null ? null : Number(row.last_aggregation_rows_processed),

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}
