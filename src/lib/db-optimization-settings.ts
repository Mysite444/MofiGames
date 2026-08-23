// Shared between the admin client (CacheDbOptimizationAdminClient) and the
// API routes under src/app/api/admin/cache/db-optimization/**. Mirrors the
// object-cache-settings.ts pattern — pure mapper, no IO.
//
// Sensitive note: redis_query_password follows the same redaction contract as
// object_cache_settings.redis_password — the mapper does NOT strip it; route
// handlers redact it to a boolean + short preview before any row reaches the
// browser.

export type PoolMode = "session" | "transaction" | "statement";
export type QueryCacheTestStatus = "success" | "failed";
export type ReindexStatus = "pending" | "running" | "done" | "failed";

export interface CachedQuerySlot {
  name: string;
  pattern: string;
  ttlSeconds: number;
  enabled: boolean;
}

export interface ReindexRequest {
  table: string;
  requestedAt: string;
  status: ReindexStatus;
}

export interface IndexRecommendation {
  table: string;
  columns: string[];
  reason: string;
  estimatedImpact: "high" | "medium" | "low";
  suggestedSql: string;
}

export interface SlowQueryEntry {
  id: number;
  queryHash: string;
  queryLabel: string | null;
  durationMs: number;
  loggedAt: string;
  context: Record<string, unknown> | null;
}

export interface DbOptimizationSettings {
  // 1. Redis Query Cache
  redisQueryCacheEnabled: boolean;
  redisQueryHost: string;
  redisQueryPort: number;
  redisQueryDatabase: number;
  redisQueryTlsEnabled: boolean;
  redisQueryUsername: string;
  /** Never sent raw to the browser — always redacted. */
  redisQueryPasswordSet: boolean;
  redisQueryPasswordPreview: string | null;
  redisQueryConnectTimeoutMs: number;

  // 2. Cached Query Results
  queryCacheDefaultTtlSeconds: number;
  queryCacheKeyPrefix: string;
  cachedQuerySlots: CachedQuerySlot[];

  // 3. Prepared Statements
  preparedStatementsEnabled: boolean;
  maxPreparedStatements: number;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
  idleInTransactionTimeoutMs: number;

  // 4. Query Optimisation
  slowQueryThresholdMs: number;
  workMemKb: number;
  poolMode: PoolMode;
  poolSize: number;
  explainAnalyzeEnabled: boolean;

  // 5. Index Optimisation
  autoAnalyzeEnabled: boolean;
  autoAnalyzeSchedule: string;
  pendingReindexRequests: ReindexRequest[];
  lastAnalyzeRunAt: string | null;
  lastAnalyzeSummary: Record<string, unknown> | null;
  indexRecommendations: IndexRecommendation[];
  lastIndexScanAt: string | null;

  // Diagnostics
  lastQueryCacheTestedAt: string | null;
  lastQueryCacheTestStatus: QueryCacheTestStatus | null;
  lastQueryCacheTestMessage: string | null;
  lastQueryCacheFlushedAt: string | null;

  updatedAt: string;
}

const POOL_MODES: PoolMode[] = ["session", "transaction", "statement"];
const TEST_STATUSES: QueryCacheTestStatus[] = ["success", "failed"];

const DEFAULT_CACHED_QUERY_SLOTS: CachedQuerySlot[] = [
  { name: "homepage_games",  pattern: "SELECT … FROM games ORDER BY plays",    ttlSeconds: 120,  enabled: true },
  { name: "category_list",   pattern: "SELECT * FROM categories",              ttlSeconds: 600,  enabled: true },
  { name: "featured_games",  pattern: "SELECT … WHERE is_featured = true",     ttlSeconds: 180,  enabled: true },
  { name: "tag_list",        pattern: "SELECT * FROM tags",                    ttlSeconds: 1800, enabled: true },
  { name: "leaderboard_top", pattern: "SELECT … ORDER BY score DESC LIMIT 20", ttlSeconds: 60,   enabled: false },
];

export const DEFAULT_DB_OPTIMIZATION_SETTINGS: DbOptimizationSettings = {
  redisQueryCacheEnabled: false,
  redisQueryHost: "127.0.0.1",
  redisQueryPort: 6379,
  redisQueryDatabase: 1,
  redisQueryTlsEnabled: false,
  redisQueryUsername: "",
  redisQueryPasswordSet: false,
  redisQueryPasswordPreview: null,
  redisQueryConnectTimeoutMs: 2000,

  queryCacheDefaultTtlSeconds: 300,
  queryCacheKeyPrefix: "pbq_",
  cachedQuerySlots: DEFAULT_CACHED_QUERY_SLOTS,

  preparedStatementsEnabled: true,
  maxPreparedStatements: 0,
  statementTimeoutMs: 30000,
  lockTimeoutMs: 5000,
  idleInTransactionTimeoutMs: 10000,

  slowQueryThresholdMs: 500,
  workMemKb: 4096,
  poolMode: "transaction",
  poolSize: 25,
  explainAnalyzeEnabled: false,

  autoAnalyzeEnabled: true,
  autoAnalyzeSchedule: "0 3 * * *",
  pendingReindexRequests: [],
  lastAnalyzeRunAt: null,
  lastAnalyzeSummary: null,
  indexRecommendations: [],
  lastIndexScanAt: null,

  lastQueryCacheTestedAt: null,
  lastQueryCacheTestStatus: null,
  lastQueryCacheTestMessage: null,
  lastQueryCacheFlushedAt: null,

  updatedAt: new Date(0).toISOString(),
};

function safeCachedQuerySlots(raw: unknown): CachedQuerySlot[] {
  if (!Array.isArray(raw)) return DEFAULT_CACHED_QUERY_SLOTS;
  return raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => ({
      name: String(s.name ?? ""),
      pattern: String(s.pattern ?? ""),
      ttlSeconds: Math.max(5, Math.min(86400, Number(s.ttlSeconds ?? 300))),
      enabled: Boolean(s.enabled),
    }));
}

function safeReindexRequests(raw: unknown): ReindexRequest[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      table: String(r.table ?? ""),
      requestedAt: String(r.requestedAt ?? new Date().toISOString()),
      status: (["pending", "running", "done", "failed"].includes(String(r.status))
        ? r.status
        : "pending") as ReindexStatus,
    }));
}

function safeIndexRecommendations(raw: unknown): IndexRecommendation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
    .map((r) => ({
      table: String(r.table ?? ""),
      columns: Array.isArray(r.columns) ? r.columns.map(String) : [],
      reason: String(r.reason ?? ""),
      estimatedImpact: (["high", "medium", "low"].includes(String(r.estimatedImpact))
        ? r.estimatedImpact
        : "medium") as "high" | "medium" | "low",
      suggestedSql: String(r.suggestedSql ?? ""),
    }));
}

export function mapDbOptimizationRow(
  row: Record<string, unknown> | null
): DbOptimizationSettings {
  if (!row) return DEFAULT_DB_OPTIMIZATION_SETTINGS;
  const d = DEFAULT_DB_OPTIMIZATION_SETTINGS;

  const poolModeRaw = String(row.pool_mode ?? d.poolMode);
  const poolMode: PoolMode = (POOL_MODES.includes(poolModeRaw as PoolMode)
    ? poolModeRaw
    : d.poolMode) as PoolMode;

  const testStatusRaw = row.last_query_cache_test_status
    ? String(row.last_query_cache_test_status)
    : null;
  const lastQueryCacheTestStatus: QueryCacheTestStatus | null =
    testStatusRaw && TEST_STATUSES.includes(testStatusRaw as QueryCacheTestStatus)
      ? (testStatusRaw as QueryCacheTestStatus)
      : null;

  return {
    redisQueryCacheEnabled: Boolean(row.redis_query_cache_enabled ?? d.redisQueryCacheEnabled),
    redisQueryHost: String(row.redis_query_host ?? d.redisQueryHost),
    redisQueryPort: Math.min(65535, Math.max(1, Number(row.redis_query_port ?? d.redisQueryPort))),
    redisQueryDatabase: Math.min(15, Math.max(0, Number(row.redis_query_database ?? d.redisQueryDatabase))),
    redisQueryTlsEnabled: Boolean(row.redis_query_tls_enabled ?? d.redisQueryTlsEnabled),
    redisQueryUsername: String(row.redis_query_username ?? d.redisQueryUsername),
    // Passwords are redacted by the route before this mapper runs on the browser side.
    redisQueryPasswordSet: Boolean(row.redis_query_password_set),
    redisQueryPasswordPreview: row.redis_query_password_preview
      ? String(row.redis_query_password_preview)
      : null,
    redisQueryConnectTimeoutMs: Math.min(30000, Math.max(100,
      Number(row.redis_query_connect_timeout_ms ?? d.redisQueryConnectTimeoutMs))),

    queryCacheDefaultTtlSeconds: Math.min(86400, Math.max(5,
      Number(row.query_cache_default_ttl_seconds ?? d.queryCacheDefaultTtlSeconds))),
    queryCacheKeyPrefix: String(row.query_cache_key_prefix ?? d.queryCacheKeyPrefix),
    cachedQuerySlots: safeCachedQuerySlots(row.cached_query_slots),

    preparedStatementsEnabled: Boolean(row.prepared_statements_enabled ?? d.preparedStatementsEnabled),
    maxPreparedStatements: Math.min(10000, Math.max(0,
      Number(row.max_prepared_statements ?? d.maxPreparedStatements))),
    statementTimeoutMs: Math.min(600000, Math.max(0,
      Number(row.statement_timeout_ms ?? d.statementTimeoutMs))),
    lockTimeoutMs: Math.min(300000, Math.max(0,
      Number(row.lock_timeout_ms ?? d.lockTimeoutMs))),
    idleInTransactionTimeoutMs: Math.min(300000, Math.max(0,
      Number(row.idle_in_transaction_timeout_ms ?? d.idleInTransactionTimeoutMs))),

    slowQueryThresholdMs: Math.min(60000, Math.max(0,
      Number(row.slow_query_threshold_ms ?? d.slowQueryThresholdMs))),
    workMemKb: Math.min(524288, Math.max(1024,
      Number(row.work_mem_kb ?? d.workMemKb))),
    poolMode,
    poolSize: Math.min(500, Math.max(1, Number(row.pool_size ?? d.poolSize))),
    explainAnalyzeEnabled: Boolean(row.explain_analyze_enabled ?? d.explainAnalyzeEnabled),

    autoAnalyzeEnabled: Boolean(row.auto_analyze_enabled ?? d.autoAnalyzeEnabled),
    autoAnalyzeSchedule: String(row.auto_analyze_schedule ?? d.autoAnalyzeSchedule),
    pendingReindexRequests: safeReindexRequests(row.pending_reindex_requests),
    lastAnalyzeRunAt: row.last_analyze_run_at ? String(row.last_analyze_run_at) : null,
    lastAnalyzeSummary: (row.last_analyze_summary as Record<string, unknown> | null) ?? null,
    indexRecommendations: safeIndexRecommendations(row.index_recommendations),
    lastIndexScanAt: row.last_index_scan_at ? String(row.last_index_scan_at) : null,

    lastQueryCacheTestedAt: row.last_query_cache_tested_at
      ? String(row.last_query_cache_tested_at)
      : null,
    lastQueryCacheTestStatus,
    lastQueryCacheTestMessage: row.last_query_cache_test_message
      ? String(row.last_query_cache_test_message)
      : null,
    lastQueryCacheFlushedAt: row.last_query_cache_flushed_at
      ? String(row.last_query_cache_flushed_at)
      : null,

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}

/** Redacts a plaintext secret to { set, preview } exactly as
 * object-cache-settings.ts does. */
export function redactSecret(value: string | null): { set: boolean; preview: string | null } {
  if (!value) return { set: false, preview: null };
  return {
    set: true,
    preview: value.length <= 4 ? "****" : `${value.slice(0, 2)}${"*".repeat(value.length - 4)}${value.slice(-2)}`,
  };
}

/** Generates a .env snippet for the query-cache Redis connection,
 * matching the style of generateRedisConfig() in object-cache-settings.ts. */
export function generateQueryCacheEnvSnippet(s: DbOptimizationSettings): string {
  const lines: string[] = [
    "# Redis Query Cache — add to .env.local",
    `REDIS_QUERY_HOST=${s.redisQueryHost}`,
    `REDIS_QUERY_PORT=${s.redisQueryPort}`,
    `REDIS_QUERY_DB=${s.redisQueryDatabase}`,
  ];
  if (s.redisQueryTlsEnabled) lines.push("REDIS_QUERY_TLS=true");
  if (s.redisQueryUsername) lines.push(`REDIS_QUERY_USERNAME=${s.redisQueryUsername}`);
  lines.push("REDIS_QUERY_PASSWORD=<your_password>");
  lines.push(`REDIS_QUERY_KEY_PREFIX=${s.queryCacheKeyPrefix}`);
  lines.push(`REDIS_QUERY_DEFAULT_TTL=${s.queryCacheDefaultTtlSeconds}`);
  return lines.join("\n");
}

/** Generates a Supavisor / PgBouncer .ini snippet for prepared-statement +
 * pool settings. */
export function generatePoolerConfigSnippet(s: DbOptimizationSettings): string {
  return [
    "; PgBouncer / Supavisor connection-pool config",
    `pool_mode = ${s.poolMode}`,
    `default_pool_size = ${s.poolSize}`,
    `max_prepared_statements = ${s.maxPreparedStatements}`,
    "",
    "; Per-session GUCs (set in your DB client init)",
    `SET statement_timeout = '${s.statementTimeoutMs}ms';`,
    `SET lock_timeout = '${s.lockTimeoutMs}ms';`,
    `SET idle_in_transaction_session_timeout = '${s.idleInTransactionTimeoutMs}ms';`,
    `SET work_mem = '${s.workMemKb}kB';`,
  ].join("\n");
}
