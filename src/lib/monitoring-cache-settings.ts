// Shared between CacheMonitoringAdminClient and the API routes under
// src/app/api/admin/cache/monitoring/**. Pure mapper, no IO. Mirrors the
// compression-cache-settings.ts pattern. See migration
// 0053_cache_monitoring.sql for the table schema.
//
// "Cache Monitoring & Observability" owns the cross-layer view of every
// cache type in the system — distinct from the individual cache sections
// (Browser, Full Page, CDN, Object, …) which each own their own settings.
// This section answers: how much is stored, what type backs it, when was
// it last purged, and how should it clean itself up?
//
//   1. Cache Status & Type        — Redis / File / Memcached; healthy /
//                                   degraded / offline status; real-time
//                                   storage usage and entry counts.
//   2. Cache TTL Configuration    — per-layer default TTL settings: page,
//                                   API, object, fragment, image, static.
//   3. Purge Controls             — Purge All, Purge Selected (by layer),
//                                   with a log written to cache_purge_logs
//                                   on every action.
//   4. Automatic Cache Cleanup    — scheduled self-maintenance that removes
//                                   expired and least-recently-used entries
//                                   before storage fills up.

// ── Types ────────────────────────────────────────────────────────────────────

export type CacheBackendType = "redis" | "file" | "memcached";
export type CacheHealthStatus = "healthy" | "degraded" | "offline" | "unknown";
export type PurgeStatus = "success" | "failed" | "partial";
export type PurgeType = "all" | "selected" | "auto_cleanup";

export type CacheLayerKey =
  | "page"
  | "api"
  | "object"
  | "fragment"
  | "image"
  | "static"
  | "session"
  | "dns"
  | "search"
  | "feed";

export const CACHE_LAYER_LABELS: Record<CacheLayerKey, string> = {
  page: "Full Page",
  api: "API",
  object: "Object",
  fragment: "Fragment",
  image: "Image",
  static: "Static Assets",
  session: "Session",
  dns: "DNS",
  search: "Search",
  feed: "Feed",
};

export interface CacheTtlSettings {
  /** Default TTL for full-page cached responses, in seconds. */
  pageTtlSeconds: number;
  /** Default TTL for API response cache entries, in seconds. */
  apiTtlSeconds: number;
  /** Default TTL for object cache entries (Redis/Memcached), in seconds. */
  objectTtlSeconds: number;
  /** Default TTL for fragment cache entries, in seconds. */
  fragmentTtlSeconds: number;
  /** Default TTL for image cache entries, in seconds. */
  imageTtlSeconds: number;
  /** Default TTL for static asset cache entries, in seconds. */
  staticTtlSeconds: number;
  /** Default TTL for session cache entries, in seconds. */
  sessionTtlSeconds: number;
  /** Default TTL for DNS cache entries, in seconds. */
  dnsTtlSeconds: number;
  /** Default TTL for search result cache entries, in seconds. */
  searchTtlSeconds: number;
  /** Default TTL for feed cache entries (RSS/Atom/JSON), in seconds. */
  feedTtlSeconds: number;
}

export interface AutoCleanupConfig {
  enabled: boolean;
  /** How often the cleanup job runs, in hours. */
  intervalHours: number;
  /** Entries older than this (hours) are always evicted regardless of usage. */
  maxAgeHours: number;
  /** Cleanup triggers when storage usage exceeds this percentage. */
  targetUsagePct: number;
  /** Timestamp of the last successful cleanup run. */
  lastCleanupAt: string | null;
  /** 'success' | 'failed' | null — result of the last cleanup attempt. */
  lastCleanupStatus: "success" | "failed" | null;
  /** Bytes freed by the last cleanup run. */
  lastCleanupFreedBytes: number;
  /** Number of cache entries removed in the last cleanup run. */
  lastCleanupRemovedCount: number;
}

export interface MonitoringCacheSettings {
  /** Master switch — disables all monitoring/cleanup without discarding config. */
  enabled: boolean;

  /** Which cache backend powers this app's object/session/fragment caches. */
  cacheType: CacheBackendType;

  /** Redis-specific connection details (display-only in the UI — never a
   * full connection string; just enough to confirm the right server). */
  redisHost: string;
  redisPort: number;
  redisDb: number;

  /** Memcached server list, one "host:port" per entry. */
  memcachedServers: string[];

  /** Maximum cache storage ceiling in MB (0 = no hard limit configured). */
  maxStorageMb: number;

  /** Per-layer TTL defaults. Individual sections (Object, Fragment, etc.)
   * carry their own TTL settings; these are the fallback / global defaults
   * shown in the monitoring view for quick reference. */
  ttl: CacheTtlSettings;

  /** Automatic cleanup / eviction configuration. */
  autoCleanup: AutoCleanupConfig;

  updatedAt: string;
}

/** One row from cache_purge_logs — sent to the client. */
export interface CachePurgeLogEntry {
  id: number;
  purgeType: PurgeType;
  /** Which layers were explicitly included in a "selected" purge. */
  purgeScope: CacheLayerKey[];
  /** Number of cache entries removed. */
  purgeCount: number;
  /** Bytes freed, if known. */
  purgeSizeBytes: number;
  status: PurgeStatus;
  message: string | null;
  triggeredAt: string;
  /** Display name of the admin who triggered the purge. */
  triggeredByEmail: string | null;
}

/** Real-time stats returned by GET /api/admin/cache/monitoring/stats —
 * not persisted (computed on demand from the cache backend). */
export interface CacheStorageStats {
  /** Current cache backend type (mirrors MonitoringCacheSettings.cacheType). */
  cacheType: CacheBackendType;
  /** Overall health from the backend's perspective. */
  status: CacheHealthStatus;
  /** Total bytes currently stored in the cache. */
  usedBytes: number;
  /** Maximum bytes available (0 = unbounded / unknown). */
  maxBytes: number;
  /** Number of active cache entries / keys. */
  entryCount: number;
  /** Cache hit rate over the last collection window (0–100). */
  hitRate: number | null;
  /** Bytes evicted since the process/server started. */
  evictedBytes: number | null;
  /** Timestamp at which this snapshot was taken. */
  snapshotAt: string;
  /** Per-layer breakdown (best-effort; may be empty if the backend
   * doesn't support namespace/prefix statistics). */
  layers: Partial<Record<CacheLayerKey, { usedBytes: number; entryCount: number }>>;
}

// ── Limits ───────────────────────────────────────────────────────────────────

export const TTL_LIMITS = {
  min: 60,        // 1 minute
  max: 31536000,  // 1 year
} as const;

export const CLEANUP_INTERVAL_LIMITS = { min: 1, max: 168 } as const;   // 1h – 1 week
export const CLEANUP_MAX_AGE_LIMITS  = { min: 1, max: 8760 } as const;  // 1h – 1 year
export const CLEANUP_USAGE_PCT_LIMITS = { min: 10, max: 95 } as const;
export const MAX_STORAGE_MB_LIMITS   = { min: 0, max: 102400 } as const; // 0 – 100 GB

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_TTL_SETTINGS: CacheTtlSettings = {
  pageTtlSeconds:     86400,    // 1 day
  apiTtlSeconds:      300,      // 5 minutes
  objectTtlSeconds:   3600,     // 1 hour
  fragmentTtlSeconds: 1800,     // 30 minutes
  imageTtlSeconds:    31536000, // 1 year
  staticTtlSeconds:   31536000, // 1 year
  sessionTtlSeconds:  86400,    // 1 day
  dnsTtlSeconds:      300,      // 5 minutes
  searchTtlSeconds:   600,      // 10 minutes
  feedTtlSeconds:     3600,     // 1 hour
};

export const DEFAULT_AUTO_CLEANUP: AutoCleanupConfig = {
  enabled: true,
  intervalHours: 24,
  maxAgeHours: 168,       // 1 week
  targetUsagePct: 80,
  lastCleanupAt: null,
  lastCleanupStatus: null,
  lastCleanupFreedBytes: 0,
  lastCleanupRemovedCount: 0,
};

export const DEFAULT_MONITORING_CACHE_SETTINGS: MonitoringCacheSettings = {
  enabled: true,
  cacheType: "redis",
  redisHost: "127.0.0.1",
  redisPort: 6379,
  redisDb: 0,
  memcachedServers: [],
  maxStorageMb: 0,
  ttl: DEFAULT_TTL_SETTINGS,
  autoCleanup: DEFAULT_AUTO_CLEANUP,
  updatedAt: new Date(0).toISOString(),
};

// ── Mapper ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function stringArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  return v.filter((x): x is string => typeof x === "string");
}

function parseCacheType(v: unknown): CacheBackendType {
  if (v === "redis" || v === "file" || v === "memcached") return v;
  return DEFAULT_MONITORING_CACHE_SETTINGS.cacheType;
}

function parseCleanupStatus(v: unknown): "success" | "failed" | null {
  if (v === "success" || v === "failed") return v;
  return null;
}

/** Maps the snake_case Supabase row to the camelCase MonitoringCacheSettings. */
export function mapMonitoringCacheRow(
  row: Record<string, unknown> | null,
): MonitoringCacheSettings {
  if (!row) return DEFAULT_MONITORING_CACHE_SETTINGS;
  const d = DEFAULT_MONITORING_CACHE_SETTINGS;

  return {
    enabled: Boolean(row.enabled ?? d.enabled),

    cacheType: parseCacheType(row.cache_type),
    redisHost: String(row.redis_host ?? d.redisHost),
    redisPort: clamp(Number(row.redis_port ?? d.redisPort), 1, 65535),
    redisDb: clamp(Number(row.redis_db ?? d.redisDb), 0, 15),
    memcachedServers: stringArray(row.memcached_servers, d.memcachedServers),
    maxStorageMb: clamp(
      Number(row.max_storage_mb ?? d.maxStorageMb),
      MAX_STORAGE_MB_LIMITS.min,
      MAX_STORAGE_MB_LIMITS.max,
    ),

    ttl: {
      pageTtlSeconds: clamp(
        Number(row.page_ttl_seconds ?? d.ttl.pageTtlSeconds),
        TTL_LIMITS.min,
        TTL_LIMITS.max,
      ),
      apiTtlSeconds: clamp(
        Number(row.api_ttl_seconds ?? d.ttl.apiTtlSeconds),
        TTL_LIMITS.min,
        TTL_LIMITS.max,
      ),
      objectTtlSeconds: clamp(
        Number(row.object_ttl_seconds ?? d.ttl.objectTtlSeconds),
        TTL_LIMITS.min,
        TTL_LIMITS.max,
      ),
      fragmentTtlSeconds: clamp(
        Number(row.fragment_ttl_seconds ?? d.ttl.fragmentTtlSeconds),
        TTL_LIMITS.min,
        TTL_LIMITS.max,
      ),
      imageTtlSeconds: clamp(
        Number(row.image_ttl_seconds ?? d.ttl.imageTtlSeconds),
        TTL_LIMITS.min,
        TTL_LIMITS.max,
      ),
      staticTtlSeconds: clamp(
        Number(row.static_ttl_seconds ?? d.ttl.staticTtlSeconds),
        TTL_LIMITS.min,
        TTL_LIMITS.max,
      ),
      sessionTtlSeconds: clamp(
        Number(row.session_ttl_seconds ?? d.ttl.sessionTtlSeconds),
        TTL_LIMITS.min,
        TTL_LIMITS.max,
      ),
      dnsTtlSeconds: clamp(
        Number(row.dns_ttl_seconds ?? d.ttl.dnsTtlSeconds),
        TTL_LIMITS.min,
        TTL_LIMITS.max,
      ),
      searchTtlSeconds: clamp(
        Number(row.search_ttl_seconds ?? d.ttl.searchTtlSeconds),
        TTL_LIMITS.min,
        TTL_LIMITS.max,
      ),
      feedTtlSeconds: clamp(
        Number(row.feed_ttl_seconds ?? d.ttl.feedTtlSeconds),
        TTL_LIMITS.min,
        TTL_LIMITS.max,
      ),
    },

    autoCleanup: {
      enabled: Boolean(row.auto_cleanup_enabled ?? d.autoCleanup.enabled),
      intervalHours: clamp(
        Number(row.auto_cleanup_interval_hours ?? d.autoCleanup.intervalHours),
        CLEANUP_INTERVAL_LIMITS.min,
        CLEANUP_INTERVAL_LIMITS.max,
      ),
      maxAgeHours: clamp(
        Number(row.auto_cleanup_max_age_hours ?? d.autoCleanup.maxAgeHours),
        CLEANUP_MAX_AGE_LIMITS.min,
        CLEANUP_MAX_AGE_LIMITS.max,
      ),
      targetUsagePct: clamp(
        Number(row.auto_cleanup_target_usage_pct ?? d.autoCleanup.targetUsagePct),
        CLEANUP_USAGE_PCT_LIMITS.min,
        CLEANUP_USAGE_PCT_LIMITS.max,
      ),
      lastCleanupAt: row.last_cleanup_at ? String(row.last_cleanup_at) : null,
      lastCleanupStatus: parseCleanupStatus(row.last_cleanup_status),
      lastCleanupFreedBytes: Number(row.last_cleanup_freed_bytes ?? 0),
      lastCleanupRemovedCount: Number(row.last_cleanup_removed_count ?? 0),
    },

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}

/** Maps a raw purge_logs row to the client-facing CachePurgeLogEntry shape. */
export function mapPurgeLogRow(row: Record<string, unknown>): CachePurgeLogEntry {
  const purgeType: PurgeType =
    row.purge_type === "all" || row.purge_type === "selected" || row.purge_type === "auto_cleanup"
      ? row.purge_type
      : "all";

  const status: PurgeStatus =
    row.status === "success" || row.status === "failed" || row.status === "partial"
      ? row.status
      : "success";

  return {
    id: Number(row.id),
    purgeType,
    purgeScope: stringArray(row.purge_scope, []) as CacheLayerKey[],
    purgeCount: Number(row.purge_count ?? 0),
    purgeSizeBytes: Number(row.purge_size_bytes ?? 0),
    status,
    message: row.message ? String(row.message) : null,
    triggeredAt: String(row.triggered_at ?? new Date(0).toISOString()),
    triggeredByEmail: row.triggered_by_email ? String(row.triggered_by_email) : null,
  };
}

/** Client-side fetch. Fails soft to defaults. */
export async function fetchMonitoringCacheSettings(): Promise<MonitoringCacheSettings> {
  try {
    const res = await fetch("/api/admin/cache/monitoring/settings", {
      cache: "no-store",
    });
    if (!res.ok) return DEFAULT_MONITORING_CACHE_SETTINGS;
    const data = await res.json();
    return mapMonitoringCacheRow(data.settings ?? null);
  } catch {
    return DEFAULT_MONITORING_CACHE_SETTINGS;
  }
}

// ── Formatting helpers ───────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatTtl(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  const days = Math.round(seconds / 86400);
  return days === 365 ? "1 year" : `${days}d`;
}
