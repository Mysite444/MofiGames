// Shared between CacheSmartAdminClient and the API routes under
// src/app/api/admin/cache/smart/**. Pure mapper, no IO. See
// migration 0050_smart_cache.sql for the table schema.
//
// Covers nine Smart Cache Management pillars:
//   1. Automatic Cache Invalidation
//   2. Selective Purge
//   3. Cache Tags
//   4. Scheduled Cache Warming
//   5. Background Cache Regeneration
//   6. Request Coalescing
//   7. Cache Locking
//   8. Stale-While-Revalidate
//   9. Stale-If-Error

export type WarmingStatus = "success" | "partial" | "failed";
export type InvalidationTrigger = "publish" | "update" | "delete" | "manual";
export type PurgeStatus = "success" | "partial" | "failed";
export type TagHeaderName = "Cache-Tag" | "Surrogate-Key" | "X-Cache-Tags";

// ── Sub-types ─────────────────────────────────────────────────────────────────

export interface InvalidationRule {
  id: string;
  name: string;
  /** URL pattern to match, e.g. "/:slug" or "/blog/:slug" */
  pattern: string;
  /** Which CMS events trigger this rule */
  triggers: InvalidationTrigger[];
  enabled: boolean;
}

export interface CacheTag {
  id: string;
  /** Tag identifier, e.g. "game-123", "category-action", "homepage" */
  tag: string;
  /** Human-readable description */
  description: string;
  /** URL patterns that should carry this tag */
  patterns: string[];
}

export interface WarmingRunResult {
  total: number;
  ok: number;
  failed: number;
  durationMs: number;
  results: { path: string; ok: boolean; httpStatus?: number; error?: string }[];
}

export interface PurgeRunResult {
  total: number;
  ok: number;
  failed: number;
  patterns: string[];
  durationMs: number;
}

// ── Main settings shape ───────────────────────────────────────────────────────

export interface SmartCacheSettings {
  // 1. Automatic Cache Invalidation
  autoInvalidationEnabled: boolean;
  invalidationRules: InvalidationRule[];
  invalidateOnPublish: boolean;
  invalidateOnUpdate: boolean;
  invalidateOnDelete: boolean;
  /** Delay (ms) before triggering invalidation after a CMS event */
  invalidationDelayMs: number;

  // 2. Selective Purge
  selectivePurgeEnabled: boolean;
  /** Wildcard-capable URL patterns that were last purged */
  lastPurgeAt: string | null;
  lastPurgeStatus: PurgeStatus | null;
  lastPurgeSummary: PurgeRunResult | null;

  // 3. Cache Tags
  cacheTagsEnabled: boolean;
  cacheTags: CacheTag[];
  /** HTTP response header name used to carry the tags */
  tagHeaderName: TagHeaderName;
  /** Max tags per response */
  maxTagsPerResponse: number;

  // 4. Scheduled Cache Warming
  scheduledWarmingEnabled: boolean;
  /** Standard cron expression, e.g. "0 4 * * *" */
  warmingSchedule: string;
  warmingUrls: string[];
  warmingConcurrency: number;
  warmingTimeoutMs: number;
  lastWarmingAt: string | null;
  lastWarmingStatus: WarmingStatus | null;
  lastWarmingSummary: WarmingRunResult | null;

  // 5. Background Cache Regeneration
  backgroundRegenEnabled: boolean;
  /** Max parallel regeneration fetches */
  regenConcurrency: number;
  /** Milliseconds to wait after invalidation before regenerating */
  regenDelayMs: number;
  /** URLs that always regenerate ahead of regular queue */
  regenPriorityUrls: string[];

  // 6. Request Coalescing
  requestCoalescingEnabled: boolean;
  /** Window (ms) during which duplicate in-flight requests are collapsed */
  coalescingWindowMs: number;
  /** Max requests queued behind the first coalesced fetch */
  coalescingMaxWaiters: number;

  // 7. Cache Locking
  cacheLockingEnabled: boolean;
  /** How long a lock is held before auto-release (ms) */
  lockTtlMs: number;
  /** Max time a waiter will wait for a lock (ms) */
  lockTimeoutMs: number;
  /** Retry interval for lock acquisition polling (ms) */
  lockRetryIntervalMs: number;

  // 8. Stale-While-Revalidate
  staleWhileRevalidateEnabled: boolean;
  /** Seconds after max-age during which stale content is served while
   * a background revalidation is in progress */
  staleWhileRevalidateSeconds: number;
  /** Restrict SWR to these path prefixes (empty = all paths) */
  swiApplyToPaths: string[];

  // 9. Stale-If-Error
  staleIfErrorEnabled: boolean;
  /** Seconds to serve stale content when origin returns 5xx */
  staleIfErrorSeconds: number;
  /** HTTP status codes that activate stale-if-error (default: 500,502,503,504) */
  staleIfErrorCodes: number[];

  updatedAt: string;
}

// ── Limits ───────────────────────────────────────────────────────────────────

export const SMART_CACHE_WARMING_CONCURRENCY = { min: 1, max: 20 } as const;
export const SMART_CACHE_WARMING_TIMEOUT = { min: 1000, max: 30000 } as const;
export const SMART_CACHE_REGEN_CONCURRENCY = { min: 1, max: 10 } as const;
export const SMART_CACHE_REGEN_DELAY = { min: 0, max: 60000 } as const;
export const SMART_CACHE_COALESCING_WINDOW = { min: 50, max: 5000 } as const;
export const SMART_CACHE_COALESCING_WAITERS = { min: 1, max: 200 } as const;
export const SMART_CACHE_LOCK_TTL = { min: 500, max: 30000 } as const;
export const SMART_CACHE_LOCK_TIMEOUT = { min: 500, max: 30000 } as const;
export const SMART_CACHE_LOCK_RETRY = { min: 50, max: 2000 } as const;
export const SMART_CACHE_SWR_SECONDS = { min: 0, max: 86400 } as const;
export const SMART_CACHE_SIE_SECONDS = { min: 0, max: 604800 } as const;
export const SMART_CACHE_MAX_TAGS = { min: 1, max: 100 } as const;
export const SMART_CACHE_INVALIDATION_DELAY = { min: 0, max: 60000 } as const;

export const TAG_HEADER_NAMES: TagHeaderName[] = ["Cache-Tag", "Surrogate-Key", "X-Cache-Tags"];
export const WARMING_STATUSES: WarmingStatus[] = ["success", "partial", "failed"];
export const PURGE_STATUSES: PurgeStatus[] = ["success", "partial", "failed"];

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SMART_CACHE_SETTINGS: SmartCacheSettings = {
  autoInvalidationEnabled: false,
  invalidationRules: [],
  invalidateOnPublish: true,
  invalidateOnUpdate: true,
  invalidateOnDelete: true,
  invalidationDelayMs: 0,

  selectivePurgeEnabled: true,
  lastPurgeAt: null,
  lastPurgeStatus: null,
  lastPurgeSummary: null,

  cacheTagsEnabled: false,
  cacheTags: [],
  tagHeaderName: "Cache-Tag",
  maxTagsPerResponse: 50,

  scheduledWarmingEnabled: false,
  warmingSchedule: "0 4 * * *",
  warmingUrls: ["/", "/games", "/categories"],
  warmingConcurrency: 5,
  warmingTimeoutMs: 8000,
  lastWarmingAt: null,
  lastWarmingStatus: null,
  lastWarmingSummary: null,

  backgroundRegenEnabled: false,
  regenConcurrency: 3,
  regenDelayMs: 500,
  regenPriorityUrls: ["/", "/games"],

  requestCoalescingEnabled: false,
  coalescingWindowMs: 200,
  coalescingMaxWaiters: 50,

  cacheLockingEnabled: false,
  lockTtlMs: 5000,
  lockTimeoutMs: 10000,
  lockRetryIntervalMs: 100,

  staleWhileRevalidateEnabled: false,
  staleWhileRevalidateSeconds: 60,
  swiApplyToPaths: [],

  staleIfErrorEnabled: false,
  staleIfErrorSeconds: 300,
  staleIfErrorCodes: [500, 502, 503, 504],

  updatedAt: new Date(0).toISOString(),
};

// ── Mapper ───────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function safeStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter(Boolean);
}

function safeNumberArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(Number).filter((n) => !isNaN(n));
}

function safeInvalidationRules(raw: unknown): InvalidationRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      id: String((r as Record<string, unknown>).id ?? Math.random().toString(36).slice(2, 10)),
      name: String((r as Record<string, unknown>).name ?? ""),
      pattern: String((r as Record<string, unknown>).pattern ?? ""),
      triggers: Array.isArray((r as Record<string, unknown>).triggers)
        ? ((r as Record<string, unknown>).triggers as string[]).filter((t) =>
            ["publish", "update", "delete", "manual"].includes(t)
          ) as InvalidationTrigger[]
        : ["publish", "update"],
      enabled: Boolean((r as Record<string, unknown>).enabled ?? true),
    }));
}

function safeCacheTags(raw: unknown): CacheTag[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t) => t && typeof t === "object")
    .map((t) => ({
      id: String((t as Record<string, unknown>).id ?? Math.random().toString(36).slice(2, 10)),
      tag: String((t as Record<string, unknown>).tag ?? ""),
      description: String((t as Record<string, unknown>).description ?? ""),
      patterns: safeStringArray((t as Record<string, unknown>).patterns),
    }));
}

/** Maps the raw snake_case DB row to SmartCacheSettings. */
export function mapSmartCacheSettingsRow(row: Record<string, unknown> | null): SmartCacheSettings {
  if (!row) return DEFAULT_SMART_CACHE_SETTINGS;
  const d = DEFAULT_SMART_CACHE_SETTINGS;

  const tagHeader = String(row.tag_header_name ?? "");
  const warmingStatus = String(row.last_warming_status ?? "");
  const purgeStatus = String(row.last_purge_status ?? "");

  return {
    // 1. Auto Invalidation
    autoInvalidationEnabled: Boolean(row.auto_invalidation_enabled ?? d.autoInvalidationEnabled),
    invalidationRules: safeInvalidationRules(row.invalidation_rules),
    invalidateOnPublish: row.invalidate_on_publish === undefined ? d.invalidateOnPublish : Boolean(row.invalidate_on_publish),
    invalidateOnUpdate: row.invalidate_on_update === undefined ? d.invalidateOnUpdate : Boolean(row.invalidate_on_update),
    invalidateOnDelete: row.invalidate_on_delete === undefined ? d.invalidateOnDelete : Boolean(row.invalidate_on_delete),
    invalidationDelayMs: clamp(
      Number(row.invalidation_delay_ms ?? d.invalidationDelayMs),
      SMART_CACHE_INVALIDATION_DELAY.min,
      SMART_CACHE_INVALIDATION_DELAY.max
    ),

    // 2. Selective Purge
    selectivePurgeEnabled: Boolean(row.selective_purge_enabled ?? d.selectivePurgeEnabled),
    lastPurgeAt: row.last_purge_at ? String(row.last_purge_at) : null,
    lastPurgeStatus: PURGE_STATUSES.includes(purgeStatus as PurgeStatus) ? (purgeStatus as PurgeStatus) : null,
    lastPurgeSummary: (row.last_purge_summary as PurgeRunResult | null) ?? null,

    // 3. Cache Tags
    cacheTagsEnabled: Boolean(row.cache_tags_enabled ?? d.cacheTagsEnabled),
    cacheTags: safeCacheTags(row.cache_tags),
    tagHeaderName: TAG_HEADER_NAMES.includes(tagHeader as TagHeaderName) ? (tagHeader as TagHeaderName) : d.tagHeaderName,
    maxTagsPerResponse: clamp(
      Number(row.max_tags_per_response ?? d.maxTagsPerResponse),
      SMART_CACHE_MAX_TAGS.min,
      SMART_CACHE_MAX_TAGS.max
    ),

    // 4. Scheduled Warming
    scheduledWarmingEnabled: Boolean(row.scheduled_warming_enabled ?? d.scheduledWarmingEnabled),
    warmingSchedule: String(row.warming_schedule ?? d.warmingSchedule),
    warmingUrls: safeStringArray(row.warming_urls).length > 0 ? safeStringArray(row.warming_urls) : d.warmingUrls,
    warmingConcurrency: clamp(
      Number(row.warming_concurrency ?? d.warmingConcurrency),
      SMART_CACHE_WARMING_CONCURRENCY.min,
      SMART_CACHE_WARMING_CONCURRENCY.max
    ),
    warmingTimeoutMs: clamp(
      Number(row.warming_timeout_ms ?? d.warmingTimeoutMs),
      SMART_CACHE_WARMING_TIMEOUT.min,
      SMART_CACHE_WARMING_TIMEOUT.max
    ),
    lastWarmingAt: row.last_warming_at ? String(row.last_warming_at) : null,
    lastWarmingStatus: WARMING_STATUSES.includes(warmingStatus as WarmingStatus) ? (warmingStatus as WarmingStatus) : null,
    lastWarmingSummary: (row.last_warming_summary as WarmingRunResult | null) ?? null,

    // 5. Background Regeneration
    backgroundRegenEnabled: Boolean(row.background_regen_enabled ?? d.backgroundRegenEnabled),
    regenConcurrency: clamp(
      Number(row.regen_concurrency ?? d.regenConcurrency),
      SMART_CACHE_REGEN_CONCURRENCY.min,
      SMART_CACHE_REGEN_CONCURRENCY.max
    ),
    regenDelayMs: clamp(
      Number(row.regen_delay_ms ?? d.regenDelayMs),
      SMART_CACHE_REGEN_DELAY.min,
      SMART_CACHE_REGEN_DELAY.max
    ),
    regenPriorityUrls: safeStringArray(row.regen_priority_urls).length > 0
      ? safeStringArray(row.regen_priority_urls)
      : d.regenPriorityUrls,

    // 6. Request Coalescing
    requestCoalescingEnabled: Boolean(row.request_coalescing_enabled ?? d.requestCoalescingEnabled),
    coalescingWindowMs: clamp(
      Number(row.coalescing_window_ms ?? d.coalescingWindowMs),
      SMART_CACHE_COALESCING_WINDOW.min,
      SMART_CACHE_COALESCING_WINDOW.max
    ),
    coalescingMaxWaiters: clamp(
      Number(row.coalescing_max_waiters ?? d.coalescingMaxWaiters),
      SMART_CACHE_COALESCING_WAITERS.min,
      SMART_CACHE_COALESCING_WAITERS.max
    ),

    // 7. Cache Locking
    cacheLockingEnabled: Boolean(row.cache_locking_enabled ?? d.cacheLockingEnabled),
    lockTtlMs: clamp(
      Number(row.lock_ttl_ms ?? d.lockTtlMs),
      SMART_CACHE_LOCK_TTL.min,
      SMART_CACHE_LOCK_TTL.max
    ),
    lockTimeoutMs: clamp(
      Number(row.lock_timeout_ms ?? d.lockTimeoutMs),
      SMART_CACHE_LOCK_TIMEOUT.min,
      SMART_CACHE_LOCK_TIMEOUT.max
    ),
    lockRetryIntervalMs: clamp(
      Number(row.lock_retry_interval_ms ?? d.lockRetryIntervalMs),
      SMART_CACHE_LOCK_RETRY.min,
      SMART_CACHE_LOCK_RETRY.max
    ),

    // 8. Stale-While-Revalidate
    staleWhileRevalidateEnabled: Boolean(row.stale_while_revalidate_enabled ?? d.staleWhileRevalidateEnabled),
    staleWhileRevalidateSeconds: clamp(
      Number(row.stale_while_revalidate_seconds ?? d.staleWhileRevalidateSeconds),
      SMART_CACHE_SWR_SECONDS.min,
      SMART_CACHE_SWR_SECONDS.max
    ),
    swiApplyToPaths: safeStringArray(row.swi_apply_to_paths),

    // 9. Stale-If-Error
    staleIfErrorEnabled: Boolean(row.stale_if_error_enabled ?? d.staleIfErrorEnabled),
    staleIfErrorSeconds: clamp(
      Number(row.stale_if_error_seconds ?? d.staleIfErrorSeconds),
      SMART_CACHE_SIE_SECONDS.min,
      SMART_CACHE_SIE_SECONDS.max
    ),
    staleIfErrorCodes: safeNumberArray(row.stale_if_error_codes).length > 0
      ? safeNumberArray(row.stale_if_error_codes)
      : d.staleIfErrorCodes,

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}
