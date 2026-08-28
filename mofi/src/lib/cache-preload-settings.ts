// Shared between CachePreloadingAdminClient and the API routes under
// src/app/api/admin/cache/preloading/**. Pure mapper, no IO. See
// migration 0049_preloading_prefetching.sql for the table.
//
// Admin-only: nothing here is rendered to a visitor (unlike Resource
// Hints / Link Prefetch / Speculative Loading below it on the same
// page), so it follows the stricter admin-only pattern used by
// cdn_cache_settings / session_cache_settings rather than a publicly-
// readable one.

export type CachePreloadRunStatus = "success" | "partial" | "failed";

export interface CachePreloadRunResult {
  total: number;
  ok: number;
  failed: number;
  durationMs: number;
  results: { path: string; ok: boolean; httpStatus?: number; error?: string }[];
}

export interface CachePreloadSettings {
  enabled: boolean;
  preloadUrls: string[];
  concurrency: number;
  requestTimeoutMs: number;
  lastRunAt: string | null;
  lastRunStatus: CachePreloadRunStatus | null;
  lastRunSummary: CachePreloadRunResult | null;
  updatedAt: string;
}

export const CACHE_PRELOAD_CONCURRENCY_LIMITS = { min: 1, max: 20 } as const;
export const CACHE_PRELOAD_TIMEOUT_LIMITS = { min: 1000, max: 30000 } as const;

export const DEFAULT_CACHE_PRELOAD_SETTINGS: CachePreloadSettings = {
  enabled: true,
  preloadUrls: ["/", "/games", "/categories"],
  concurrency: 5,
  requestTimeoutMs: 8000,
  lastRunAt: null,
  lastRunStatus: null,
  lastRunSummary: null,
  updatedAt: new Date(0).toISOString(),
};

const RUN_STATUSES: CachePreloadRunStatus[] = ["success", "partial", "failed"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Bare relative paths only — no scheme, no host. Rendered as
 * `${SITE_URL}${path}` by runCachePreload(). */
export function sanitizePreloadUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    let path = String(item ?? "").trim();
    if (!path) continue;
    if (!path.startsWith("/")) path = `/${path}`;
    if (path.length > 512 || seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

/** Row shape returned by GET /api/admin/cache/preloading/settings
 * (snake_case, as stored) — mapped to the camelCase CachePreloadSettings
 * above. */
export function mapCachePreloadRow(row: Record<string, unknown> | null): CachePreloadSettings {
  if (!row) return DEFAULT_CACHE_PRELOAD_SETTINGS;
  const d = DEFAULT_CACHE_PRELOAD_SETTINGS;
  const status = String(row.last_run_status ?? "");

  return {
    enabled: Boolean(row.enabled ?? d.enabled),
    preloadUrls: sanitizePreloadUrls(row.preload_urls),
    concurrency: clamp(
      Number(row.concurrency ?? d.concurrency),
      CACHE_PRELOAD_CONCURRENCY_LIMITS.min,
      CACHE_PRELOAD_CONCURRENCY_LIMITS.max
    ),
    requestTimeoutMs: clamp(
      Number(row.request_timeout_ms ?? d.requestTimeoutMs),
      CACHE_PRELOAD_TIMEOUT_LIMITS.min,
      CACHE_PRELOAD_TIMEOUT_LIMITS.max
    ),
    lastRunAt: row.last_run_at ? String(row.last_run_at) : null,
    lastRunStatus: RUN_STATUSES.includes(status as CachePreloadRunStatus) ? (status as CachePreloadRunStatus) : null,
    lastRunSummary: (row.last_run_summary as CachePreloadRunResult | null) ?? null,
    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}
