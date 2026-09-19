// Shared between the admin client (CacheCdnAdminClient) and the API
// routes under src/app/api/admin/cache/cdn/**: the redacted shape of
// the cdn_cache_settings row, plus a pure mapper. Mirrors the
// cache-settings.ts pattern, with one deliberate difference — the row
// can hold a live Cloudflare API token, so the mapper here NEVER
// includes the raw token. Route handlers that actually need it to call
// Cloudflare read the row directly (see the sync route); everything
// that reaches the browser goes through mapCdnSettingsRow below.

export type CdnCacheByQueryStringMode = "ignore_all" | "include_all" | "include_list";
export type CdnSyncStatus = "success" | "partial" | "failed";

export interface CdnCacheSettings {
  provider: "cloudflare";
  zoneId: string;
  connectedZoneName: string | null;
  /** Whether an API token is currently stored. The token itself is
   * never sent to the client — only this and a short preview. */
  apiTokenSet: boolean;
  /** Last 4 characters of the stored token, e.g. "…a91f", or null if
   * none is stored. Enough to recognize "is this the right token"
   * without ever exposing the rest of it. */
  apiTokenPreview: string | null;

  edgeCachingEnabled: boolean;
  smartCacheRulesEnabled: boolean;
  cacheEverythingEnabled: boolean;
  cacheEverythingPaths: string[];
  cacheByDeviceEnabled: boolean;
  cacheByQueryStringMode: CdnCacheByQueryStringMode;
  cacheByQueryStringParams: string[];
  imageCdnEnabled: boolean;
  brotliEnabled: boolean;
  http3Enabled: boolean;
  earlyHintsEnabled: boolean;
  edgeTtlSeconds: number;

  lastSyncedAt: string | null;
  lastSyncStatus: CdnSyncStatus | null;
  lastSyncSummary: Record<string, unknown> | null;
  updatedAt: string;
}

/** Used whenever the row can't be loaded, and as the base for a freshly
 * seeded row (migration 0034) — no zone connected yet, sane defaults
 * for everything else. */
export const DEFAULT_CDN_CACHE_SETTINGS: CdnCacheSettings = {
  provider: "cloudflare",
  zoneId: "",
  connectedZoneName: null,
  apiTokenSet: false,
  apiTokenPreview: null,

  edgeCachingEnabled: false,
  smartCacheRulesEnabled: false,
  cacheEverythingEnabled: false,
  cacheEverythingPaths: [],
  cacheByDeviceEnabled: false,
  cacheByQueryStringMode: "ignore_all",
  cacheByQueryStringParams: [],
  imageCdnEnabled: false,
  brotliEnabled: true,
  http3Enabled: true,
  earlyHintsEnabled: false,
  edgeTtlSeconds: 7200,

  lastSyncedAt: null,
  lastSyncStatus: null,
  lastSyncSummary: null,
  updatedAt: new Date(0).toISOString(),
};

const QUERY_STRING_MODES: CdnCacheByQueryStringMode[] = ["ignore_all", "include_all", "include_list"];
const SYNC_STATUSES: CdnSyncStatus[] = ["success", "partial", "failed"];

/** Row shape returned by GET /api/admin/cache/cdn/settings (snake_case,
 * as stored) — already redacted server-side, so this never sees a raw
 * api_token, only api_token_set/api_token_preview. */
export function mapCdnSettingsRow(row: Record<string, unknown> | null): CdnCacheSettings {
  if (!row) return DEFAULT_CDN_CACHE_SETTINGS;

  const queryMode = String(row.cache_by_query_string_mode ?? "");
  const syncStatus = String(row.last_sync_status ?? "");

  return {
    provider: "cloudflare",
    zoneId: String(row.zone_id ?? ""),
    connectedZoneName: row.connected_zone_name ? String(row.connected_zone_name) : null,
    apiTokenSet: Boolean(row.api_token_set),
    apiTokenPreview: row.api_token_preview ? String(row.api_token_preview) : null,

    edgeCachingEnabled: Boolean(row.edge_caching_enabled),
    smartCacheRulesEnabled: Boolean(row.smart_cache_rules_enabled),
    cacheEverythingEnabled: Boolean(row.cache_everything_enabled),
    cacheEverythingPaths: Array.isArray(row.cache_everything_paths) ? row.cache_everything_paths.map(String) : [],
    cacheByDeviceEnabled: Boolean(row.cache_by_device_enabled),
    cacheByQueryStringMode: QUERY_STRING_MODES.includes(queryMode as CdnCacheByQueryStringMode)
      ? (queryMode as CdnCacheByQueryStringMode)
      : "ignore_all",
    cacheByQueryStringParams: Array.isArray(row.cache_by_query_string_params)
      ? row.cache_by_query_string_params.map(String)
      : [],
    imageCdnEnabled: Boolean(row.image_cdn_enabled),
    brotliEnabled: row.brotli_enabled === undefined ? true : Boolean(row.brotli_enabled),
    http3Enabled: row.http3_enabled === undefined ? true : Boolean(row.http3_enabled),
    earlyHintsEnabled: Boolean(row.early_hints_enabled),
    edgeTtlSeconds: Number(row.edge_ttl_seconds ?? DEFAULT_CDN_CACHE_SETTINGS.edgeTtlSeconds),

    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    lastSyncStatus: SYNC_STATUSES.includes(syncStatus as CdnSyncStatus) ? (syncStatus as CdnSyncStatus) : null,
    lastSyncSummary: (row.last_sync_summary as Record<string, unknown> | null) ?? null,
    updatedAt: String(row.updated_at ?? DEFAULT_CDN_CACHE_SETTINGS.updatedAt),
  };
}

/** Turns a raw stored token into the redacted fields the client is
 * allowed to see. Shared by the settings GET route and the sync route
 * (which re-reads the row afterwards to return an updated snapshot). */
export function redactApiToken(token: string | null | undefined): { apiTokenSet: boolean; apiTokenPreview: string | null } {
  if (!token) return { apiTokenSet: false, apiTokenPreview: null };
  return { apiTokenSet: true, apiTokenPreview: token.length > 4 ? `…${token.slice(-4)}` : "…" };
}
