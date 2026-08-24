// Shared between CacheApiAdminClient and the API routes under
// src/app/api/admin/cache/api-cache/**. Pure mapper, no IO.
// Mirrors the fragment-cache-settings.ts / object-cache-settings.ts
// pattern. See migration 0040_api_cache.sql for the table schema and
// the reasoning behind each field.

// ── Types ────────────────────────────────────────────────────────────────────

export type ETagAlgorithm = "md5" | "sha1" | "sha256";
export type ApiCacheType = "rest" | "graphql" | "json";
export type HttpMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";

export const ETAG_ALGORITHMS: ETagAlgorithm[] = ["md5", "sha1", "sha256"];
export const HTTP_METHODS: HttpMethod[] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];

/** One row in the per-endpoint TTL override table. A pattern matches
 * incoming request paths via simple glob (* = any path segment, ** = any
 * path). Methods narrows which HTTP verbs the rule applies to. */
export interface EndpointTtlRule {
  /** Unique stable key across the array (used as React key + purge target). */
  id: string;
  /** URL glob pattern relative to origin, e.g. "/api/games/*". */
  pattern: string;
  /** HTTP methods this rule applies to. Empty = all methods. */
  methods: HttpMethod[];
  /** Seconds. 0 means "do not cache" (bypass). */
  ttlSeconds: number;
  enabled: boolean;
  cacheType: ApiCacheType;
  /** Human-readable note shown in the admin UI. */
  note: string;
}

export interface ApiCachePurgeSummary {
  scope: "all" | "endpoint";
  pattern: string | null;
  count: number;
}

export interface ApiCacheSettings {
  // ── Master switch ────────────────────────────────────────────────────────
  enabled: boolean;

  // ── API type sub-switches ────────────────────────────────────────────────
  restEnabled: boolean;
  graphqlEnabled: boolean;
  jsonResponseEnabled: boolean;

  // ── Global TTL / freshness ───────────────────────────────────────────────
  /** Default Cache-Control max-age for cached API responses (seconds). */
  defaultTtlSeconds: number;
  /** Serve a stale response for up to this many seconds while revalidating
   * in the background.  0 disables stale-while-revalidate. */
  staleWhileRevalidateSeconds: number;

  // ── Bypass conditions ────────────────────────────────────────────────────
  /** Skip the cache for requests that carry a valid session / auth header. */
  bypassAuthenticated: boolean;
  /** Skip the cache whenever the URL contains a query string.  Useful when
   * query params drive non-deterministic server state. */
  bypassQueryString: boolean;

  // ── Vary headers added to cached responses ───────────────────────────────
  varyByAccept: boolean;
  varyByOrigin: boolean;
  varyByAcceptEncoding: boolean;

  // ── Per-endpoint TTL override rules ─────────────────────────────────────
  endpointRules: EndpointTtlRule[];

  // ── Conditional Requests ─────────────────────────────────────────────────
  /** Master toggle for ETag + Last-Modified header generation. */
  conditionalRequestsEnabled: boolean;

  // ETag
  etagEnabled: boolean;
  /** Hash algorithm used to compute the ETag value from the response body. */
  etagAlgorithm: ETagAlgorithm;
  /** Prefix ETag values with W/ (weak comparison). Weak ETags survive gzip,
   * chunked encoding, and minor byte-level differences that don't affect
   * the semantic meaning of the response. */
  etagWeak: boolean;

  // Last-Modified
  lastModifiedEnabled: boolean;
  /** Round Last-Modified timestamps down to the nearest N seconds to reduce
   * unnecessary cache misses from sub-second DB writes. 1 = exact second. */
  lastModifiedGranularitySeconds: number;

  // ── Diagnostics ──────────────────────────────────────────────────────────
  lastPurgedAt: string | null;
  lastPurgeSummary: ApiCachePurgeSummary | null;
  updatedAt: string;
}

// ── Limits ───────────────────────────────────────────────────────────────────

export const API_CACHE_TTL_LIMITS = { min: 0, max: 86400 } as const;
export const API_CACHE_SWR_LIMITS = { min: 0, max: 600 } as const;
export const LAST_MODIFIED_GRANULARITY_LIMITS = { min: 1, max: 3600 } as const;

// ── Default endpoint rules ───────────────────────────────────────────────────

export const DEFAULT_ENDPOINT_RULES: EndpointTtlRule[] = [
  {
    id: "rule-games-list",
    pattern: "/api/games",
    methods: ["GET", "HEAD"],
    ttlSeconds: 300,
    enabled: true,
    cacheType: "rest",
    note: "Published games list — changes when a game is added or unpublished.",
  },
  {
    id: "rule-games-detail",
    pattern: "/api/games/*",
    methods: ["GET", "HEAD"],
    ttlSeconds: 600,
    enabled: true,
    cacheType: "rest",
    note: "Individual game metadata — longer TTL as game details change rarely.",
  },
  {
    id: "rule-categories",
    pattern: "/api/categories",
    methods: ["GET", "HEAD"],
    ttlSeconds: 900,
    enabled: true,
    cacheType: "rest",
    note: "Category list — very stable, 15-minute TTL is safe.",
  },
  {
    id: "rule-graphql",
    pattern: "/api/graphql",
    methods: ["GET", "POST"],
    ttlSeconds: 60,
    enabled: true,
    cacheType: "graphql",
    note: "GraphQL endpoint — short TTL since query shape varies per operation.",
  },
  {
    id: "rule-admin",
    pattern: "/api/admin/*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    ttlSeconds: 0,
    enabled: false,
    cacheType: "rest",
    note: "Admin routes — never cached regardless of master switch.",
  },
];

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_API_CACHE_SETTINGS: ApiCacheSettings = {
  enabled: false,
  restEnabled: true,
  graphqlEnabled: false,
  jsonResponseEnabled: true,
  defaultTtlSeconds: 300,
  staleWhileRevalidateSeconds: 30,
  bypassAuthenticated: true,
  bypassQueryString: false,
  varyByAccept: true,
  varyByOrigin: false,
  varyByAcceptEncoding: true,
  endpointRules: DEFAULT_ENDPOINT_RULES,
  conditionalRequestsEnabled: true,
  etagEnabled: true,
  etagAlgorithm: "sha256",
  etagWeak: true,
  lastModifiedEnabled: true,
  lastModifiedGranularitySeconds: 1,
  lastPurgedAt: null,
  lastPurgeSummary: null,
  updatedAt: new Date(0).toISOString(),
};

// ── Mapper ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function mapEndpointRules(raw: unknown): EndpointTtlRule[] {
  if (!Array.isArray(raw)) return DEFAULT_ENDPOINT_RULES;
  const out: EndpointTtlRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" && r.id.trim() ? r.id.trim() : `rule-${Math.random().toString(36).slice(2, 8)}`;
    const pattern = typeof r.pattern === "string" && r.pattern.trim() ? r.pattern.trim() : "/api/*";
    const methods: HttpMethod[] = Array.isArray(r.methods)
      ? r.methods.filter((m): m is HttpMethod => HTTP_METHODS.includes(m as HttpMethod))
      : ["GET", "HEAD"];
    const ttlSeconds = clamp(Number(r.ttlSeconds ?? 300), API_CACHE_TTL_LIMITS.min, API_CACHE_TTL_LIMITS.max);
    const enabled = Boolean(r.enabled ?? true);
    const cacheType: ApiCacheType =
      r.cacheType === "graphql" ? "graphql" : r.cacheType === "json" ? "json" : "rest";
    const note = typeof r.note === "string" ? r.note : "";
    out.push({ id, pattern, methods, ttlSeconds, enabled, cacheType, note });
  }
  return out.length > 0 ? out : DEFAULT_ENDPOINT_RULES;
}

/** Maps the snake_case DB row returned by Supabase to the camelCase
 * ApiCacheSettings used in the admin client and route handlers. */
export function mapApiCacheRow(row: Record<string, unknown> | null): ApiCacheSettings {
  if (!row) return DEFAULT_API_CACHE_SETTINGS;
  const d = DEFAULT_API_CACHE_SETTINGS;

  const summaryRaw = row.last_purge_summary;
  let lastPurgeSummary: ApiCachePurgeSummary | null = null;
  if (summaryRaw && typeof summaryRaw === "object") {
    const s = summaryRaw as Record<string, unknown>;
    lastPurgeSummary = {
      scope: s.scope === "endpoint" ? "endpoint" : "all",
      pattern: typeof s.pattern === "string" ? s.pattern : null,
      count: Number(s.count ?? 0),
    };
  }

  const rawAlgorithm = String(row.etag_algorithm ?? d.etagAlgorithm);
  const etagAlgorithm: ETagAlgorithm = ETAG_ALGORITHMS.includes(rawAlgorithm as ETagAlgorithm)
    ? (rawAlgorithm as ETagAlgorithm)
    : d.etagAlgorithm;

  return {
    enabled: Boolean(row.enabled ?? d.enabled),
    restEnabled: Boolean(row.rest_enabled ?? d.restEnabled),
    graphqlEnabled: Boolean(row.graphql_enabled ?? d.graphqlEnabled),
    jsonResponseEnabled: Boolean(row.json_response_enabled ?? d.jsonResponseEnabled),
    defaultTtlSeconds: clamp(
      Number(row.default_ttl_seconds ?? d.defaultTtlSeconds),
      API_CACHE_TTL_LIMITS.min,
      API_CACHE_TTL_LIMITS.max
    ),
    staleWhileRevalidateSeconds: clamp(
      Number(row.stale_while_revalidate_seconds ?? d.staleWhileRevalidateSeconds),
      API_CACHE_SWR_LIMITS.min,
      API_CACHE_SWR_LIMITS.max
    ),
    bypassAuthenticated: Boolean(row.bypass_authenticated ?? d.bypassAuthenticated),
    bypassQueryString: Boolean(row.bypass_query_string ?? d.bypassQueryString),
    varyByAccept: Boolean(row.vary_by_accept ?? d.varyByAccept),
    varyByOrigin: Boolean(row.vary_by_origin ?? d.varyByOrigin),
    varyByAcceptEncoding: Boolean(row.vary_by_accept_encoding ?? d.varyByAcceptEncoding),
    endpointRules: mapEndpointRules(row.endpoint_rules),
    conditionalRequestsEnabled: Boolean(row.conditional_requests_enabled ?? d.conditionalRequestsEnabled),
    etagEnabled: Boolean(row.etag_enabled ?? d.etagEnabled),
    etagAlgorithm,
    etagWeak: Boolean(row.etag_weak ?? d.etagWeak),
    lastModifiedEnabled: Boolean(row.last_modified_enabled ?? d.lastModifiedEnabled),
    lastModifiedGranularitySeconds: clamp(
      Number(row.last_modified_granularity_seconds ?? d.lastModifiedGranularitySeconds),
      LAST_MODIFIED_GRANULARITY_LIMITS.min,
      LAST_MODIFIED_GRANULARITY_LIMITS.max
    ),
    lastPurgedAt: row.last_purged_at ? String(row.last_purged_at) : null,
    lastPurgeSummary,
    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}


