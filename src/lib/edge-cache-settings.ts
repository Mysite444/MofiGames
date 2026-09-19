// Shared between CacheEdgeAdminClient and the API routes under
// src/app/api/admin/cache/edge/**. Mirrors the cdn-cache-settings.ts
// pattern exactly: the row can hold a live Cloudflare API token, so
// mapEdgeSettingsRow() NEVER includes it — the raw token stays server-
// side only. Route handlers that need it to call Cloudflare read the
// row directly (sync route only); everything that reaches the browser
// goes through mapEdgeSettingsRow below.

export type EdgeSyncStatus = "success" | "partial" | "failed";
export type RegionalCachingTopology = "all" | "smart" | "custom";
export type TieredCacheTopology = "smart" | "generic_global" | "generic_regional";

/** Cloudflare region codes that can be used as Origin Shield locations.
 * Labels are the CF dashboard names; codes match the Argo / Cache
 * Reserve API values. */
export const ORIGIN_SHIELD_REGIONS: { value: string; label: string }[] = [
  { value: "iad", label: "Ashburn, VA (iad)" },
  { value: "pdx", label: "Portland, OR (pdx)" },
  { value: "lhr", label: "London, UK (lhr)" },
  { value: "cdg", label: "Paris, FR (cdg)" },
  { value: "fra", label: "Frankfurt, DE (fra)" },
  { value: "ams", label: "Amsterdam, NL (ams)" },
  { value: "sin", label: "Singapore (sin)" },
  { value: "nrt", label: "Tokyo, JP (nrt)" },
  { value: "syd", label: "Sydney, AU (syd)" },
  { value: "gru", label: "São Paulo, BR (gru)" },
  { value: "dfw", label: "Dallas, TX (dfw)" },
  { value: "sea", label: "Seattle, WA (sea)" },
];

export interface EdgeCacheSettings {
  // ── Cloudflare connection ─────────────────────────────────────────────
  provider: "cloudflare";
  zoneId: string;
  connectedZoneName: string | null;
  /** True when an API token is stored server-side. The token itself
   * never reaches the browser — only this flag and a 4-char preview. */
  apiTokenSet: boolean;
  apiTokenPreview: string | null;

  // ── 1. Cloudflare Workers Cache ───────────────────────────────────────
  /** Enables Workers Cache API usage — the Worker intercepts requests and
   * stores/serves responses from caches.default. Requires a deployed
   * Worker script; this toggle enables the zone-level setting so requests
   * can flow through it. */
  workersEnabled: boolean;
  /** Default TTL (seconds) for entries stored via the Workers Cache API
   * when the response has no explicit Cache-Control max-age. */
  workersCacheTtlSeconds: number;
  /** When true, uncached requests that miss the Workers cache are passed
   * through to the origin transparently rather than serving a 504. */
  workersPassthroughEnabled: boolean;
  /** URL path patterns where Workers cache should be bypassed — use
   * glob syntax, e.g. "/api/*", "/admin/*". */
  workersBypassRoutes: string[];

  // ── 2. Edge Side Includes (ESI) ───────────────────────────────────────
  /** Enables processing of <esi:include> tags in HTML responses. CF must
   * be on a plan that supports ESI; on unsupported plans the sync step
   * reports a skipped/failed result without breaking anything else. */
  esiEnabled: boolean;
  /** Max-age (seconds) applied to fetched ESI fragments when the
   * fragment's own response has no Cache-Control. */
  esiMaxAgeSeconds: number;
  /** fail_open (true) = serve the rest of the page even if an ESI
   * fragment fetch fails; fail_closed (false) = return 503 on ESI error. */
  esiFailOpen: boolean;

  // ── 3. Regional Caching ───────────────────────────────────────────────
  /** Whether regional caching restrictions are active. When off,
   * Cloudflare caches at every PoP that serves a request (the default). */
  regionalCachingEnabled: boolean;
  /** all = cache everywhere (no restriction); smart = CF picks optimal
   * PoPs based on traffic; custom = only the PoPs in restrictedRegions. */
  regionalCachingTopology: RegionalCachingTopology;
  /** CF region codes to restrict caching to when topology = "custom". */
  restrictedRegions: string[];

  // ── 4. Smart Edge Revalidation ────────────────────────────────────────
  /** Enables stale-while-revalidate behavior at the edge — CF serves the
   * stale cached copy immediately while fetching a fresh one in the
   * background. */
  smartRevalidationEnabled: boolean;
  /** How long (seconds) to serve stale content while revalidating in the
   * background. Applied as a Cache Rule action parameter. */
  staleWhileRevalidateSeconds: number;
  /** How long (seconds) to serve stale content when the origin returns a
   * 5xx. Zero means no stale-if-error. */
  staleIfErrorSeconds: number;
  /** Maps to CF zone setting serve_stale_on_error — always serve the
   * cached copy instead of an error page on origin failure. */
  serveStaleOnError: boolean;

  // ── 5. Tiered Cache ───────────────────────────────────────────────────
  /** Enables Cloudflare's Tiered Cache (Argo Tiered Caching) — a
   * smaller set of "upper-tier" PoPs aggregates cache fills rather than
   * every edge PoP hitting origin independently. */
  tieredCacheEnabled: boolean;
  /** smart = CF picks the optimal upper tier automatically;
   * generic_global = fixed two-tier hierarchy (upper + lower);
   * generic_regional = one upper tier per CF region. */
  tieredCacheTopology: TieredCacheTopology;

  // ── 6. Origin Shield (optional) ───────────────────────────────────────
  /** Adds a dedicated Cloudflare PoP as the single point of contact with
   * your origin (Argo or Cache Reserve origin-facing shield). All CF
   * edge nodes that miss local cache fetch via this shield PoP, so your
   * origin only ever sees requests from one location. Optional — needs
   * Argo or Cache Reserve enabled on the Cloudflare account. */
  originShieldEnabled: boolean;
  /** CF PoP code for the shield location, e.g. "iad". See
   * ORIGIN_SHIELD_REGIONS for the full list of valid values. */
  originShieldRegion: string;

  // ── Sync tracking ─────────────────────────────────────────────────────
  lastSyncedAt: string | null;
  lastSyncStatus: EdgeSyncStatus | null;
  lastSyncSummary: Record<string, unknown> | null;
  updatedAt: string;
}

export const DEFAULT_EDGE_CACHE_SETTINGS: EdgeCacheSettings = {
  provider: "cloudflare",
  zoneId: "",
  connectedZoneName: null,
  apiTokenSet: false,
  apiTokenPreview: null,

  workersEnabled: false,
  workersCacheTtlSeconds: 300,
  workersPassthroughEnabled: true,
  workersBypassRoutes: ["/api/*", "/admin/*"],

  esiEnabled: false,
  esiMaxAgeSeconds: 300,
  esiFailOpen: true,

  regionalCachingEnabled: false,
  regionalCachingTopology: "smart",
  restrictedRegions: [],

  smartRevalidationEnabled: false,
  staleWhileRevalidateSeconds: 60,
  staleIfErrorSeconds: 300,
  serveStaleOnError: false,

  tieredCacheEnabled: false,
  tieredCacheTopology: "smart",

  originShieldEnabled: false,
  originShieldRegion: "iad",

  lastSyncedAt: null,
  lastSyncStatus: null,
  lastSyncSummary: null,
  updatedAt: new Date(0).toISOString(),
};

const REGIONAL_TOPOLOGIES: RegionalCachingTopology[] = ["all", "smart", "custom"];
const TIERED_TOPOLOGIES: TieredCacheTopology[] = ["smart", "generic_global", "generic_regional"];
const SYNC_STATUSES: EdgeSyncStatus[] = ["success", "partial", "failed"];

/** Maps the raw snake_case DB row to EdgeCacheSettings. The api_token
 * field is never present here — it's stripped before this is called. */
export function mapEdgeSettingsRow(row: Record<string, unknown> | null): EdgeCacheSettings {
  if (!row) return DEFAULT_EDGE_CACHE_SETTINGS;

  const regionalTopology = String(row.regional_caching_topology ?? "");
  const tieredTopology = String(row.tiered_cache_topology ?? "");
  const syncStatus = String(row.last_sync_status ?? "");

  return {
    provider: "cloudflare",
    zoneId: String(row.zone_id ?? ""),
    connectedZoneName: row.connected_zone_name ? String(row.connected_zone_name) : null,
    apiTokenSet: Boolean(row.api_token_set),
    apiTokenPreview: row.api_token_preview ? String(row.api_token_preview) : null,

    workersEnabled: Boolean(row.workers_enabled),
    workersCacheTtlSeconds: Number(row.workers_cache_ttl_seconds ?? DEFAULT_EDGE_CACHE_SETTINGS.workersCacheTtlSeconds),
    workersPassthroughEnabled: row.workers_passthrough_enabled === undefined ? true : Boolean(row.workers_passthrough_enabled),
    workersBypassRoutes: Array.isArray(row.workers_bypass_routes)
      ? row.workers_bypass_routes.map(String)
      : DEFAULT_EDGE_CACHE_SETTINGS.workersBypassRoutes,

    esiEnabled: Boolean(row.esi_enabled),
    esiMaxAgeSeconds: Number(row.esi_max_age_seconds ?? DEFAULT_EDGE_CACHE_SETTINGS.esiMaxAgeSeconds),
    esiFailOpen: row.esi_fail_open === undefined ? true : Boolean(row.esi_fail_open),

    regionalCachingEnabled: Boolean(row.regional_caching_enabled),
    regionalCachingTopology: REGIONAL_TOPOLOGIES.includes(regionalTopology as RegionalCachingTopology)
      ? (regionalTopology as RegionalCachingTopology)
      : "smart",
    restrictedRegions: Array.isArray(row.restricted_regions) ? row.restricted_regions.map(String) : [],

    smartRevalidationEnabled: Boolean(row.smart_revalidation_enabled),
    staleWhileRevalidateSeconds: Number(row.stale_while_revalidate_seconds ?? DEFAULT_EDGE_CACHE_SETTINGS.staleWhileRevalidateSeconds),
    staleIfErrorSeconds: Number(row.stale_if_error_seconds ?? DEFAULT_EDGE_CACHE_SETTINGS.staleIfErrorSeconds),
    serveStaleOnError: Boolean(row.serve_stale_on_error),

    tieredCacheEnabled: Boolean(row.tiered_cache_enabled),
    tieredCacheTopology: TIERED_TOPOLOGIES.includes(tieredTopology as TieredCacheTopology)
      ? (tieredTopology as TieredCacheTopology)
      : "smart",

    originShieldEnabled: Boolean(row.origin_shield_enabled),
    originShieldRegion: String(row.origin_shield_region ?? DEFAULT_EDGE_CACHE_SETTINGS.originShieldRegion),

    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    lastSyncStatus: SYNC_STATUSES.includes(syncStatus as EdgeSyncStatus) ? (syncStatus as EdgeSyncStatus) : null,
    lastSyncSummary: (row.last_sync_summary as Record<string, unknown> | null) ?? null,
    updatedAt: String(row.updated_at ?? DEFAULT_EDGE_CACHE_SETTINGS.updatedAt),
  };
}

/** Strips the raw api_token and returns the redacted fields the client
 * is allowed to see. Shared by the settings GET and sync route. */
export function redactEdgeApiToken(token: string | null | undefined): {
  apiTokenSet: boolean;
  apiTokenPreview: string | null;
} {
  if (!token) return { apiTokenSet: false, apiTokenPreview: null };
  return { apiTokenSet: true, apiTokenPreview: token.length > 4 ? `…${token.slice(-4)}` : "…" };
}
