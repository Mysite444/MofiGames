// Shared between CacheSearchAdminClient and the API routes under
// src/app/api/admin/cache/search/**. Pure mapper, no IO. See migration
// 0044_search_cache.sql for the table and the reasoning behind the
// five-pillar split (Search Suggestions / Popular Searches / Filter
// Results / Autocomplete / Search Indexes).
//
// Sensitive note: external_api_key (only used when index_backend is
// 'external', e.g. Meilisearch/Algolia) is stored in the table but never
// leaves this app raw — route handlers redact it to a boolean + short
// preview before the row reaches the browser, matching object-cache-
// settings.ts's redactSecret / session-cache-settings.ts's redactSecret.

export type SuggestionsSource = "search_history" | "game_titles" | "both";
export type AutocompleteMatchMode = "prefix" | "contains" | "fuzzy";
export type IndexBackend = "postgres_ilike" | "postgres_fts" | "external";
export type ExternalSearchEngine = "meilisearch" | "algolia";
export type SearchBuildStatus = "success" | "failed";
export type SearchPurgeScope = "all" | "suggestions" | "autocomplete";

export interface SearchIndexSource {
  /** Stable identifier — rebuild-index/route.ts keys its per-source doc counts on this. */
  key: string;
  label: string;
  enabled: boolean;
  /** Relative ranking weight, 1-10. */
  weight: number;
}

export interface SearchPurgeSummary {
  scope: SearchPurgeScope;
  entriesRemoved: number;
}

export interface SearchCacheSettings {
  // ── 1. Search Suggestions ────────────────────────────────────────────────
  suggestionsEnabled: boolean;
  suggestionsSource: SuggestionsSource;
  suggestionsMaxResults: number;
  suggestionsMinChars: number;
  suggestionsCacheTtlSeconds: number;
  suggestionsFuzzyMatching: boolean;

  // ── 2. Popular Searches ───────────────────────────────────────────────────
  popularSearchesEnabled: boolean;
  popularSearchesWindowDays: number;
  popularSearchesMaxResults: number;
  popularSearchesMinOccurrences: number;
  popularSearchesRefreshIntervalMinutes: number;
  popularSearchesExcludeNoResults: boolean;
  popularSearchesLastRefreshedAt: string | null;
  popularSearchesLastRefreshCount: number;

  // ── 3. Filter Results ─────────────────────────────────────────────────────
  filterCacheEnabled: boolean;
  filterCacheTtlSeconds: number;
  filterCacheableParams: string[];
  filterCacheMaxCombinations: number;
  filterCacheVaryByDevice: boolean;

  // ── 4. Autocomplete ───────────────────────────────────────────────────────
  autocompleteEnabled: boolean;
  autocompleteMinChars: number;
  autocompleteDebounceMs: number;
  autocompleteMaxSuggestions: number;
  autocompleteHighlightMatch: boolean;
  autocompleteMatchMode: AutocompleteMatchMode;

  // ── 5. Search Indexes ─────────────────────────────────────────────────────
  indexBackend: IndexBackend;
  indexSources: SearchIndexSource[];
  indexAutoRebuild: boolean;
  indexRebuildIntervalHours: number;
  indexLastBuiltAt: string | null;
  indexLastBuildDurationMs: number | null;
  indexLastBuildDocCount: number | null;
  indexLastBuildStatus: SearchBuildStatus | null;
  indexLastBuildMessage: string | null;
  externalEngine: ExternalSearchEngine;
  externalHost: string;
  /** Whether an API key is stored. Never sent to the browser — only this flag + a short preview. */
  externalApiKeySet: boolean;
  externalApiKeyPreview: string | null;
  externalIndexName: string;

  // ── Shared diagnostics ────────────────────────────────────────────────────
  lastPurgedAt: string | null;
  lastPurgeSummary: SearchPurgeSummary | null;

  updatedAt: string;
}

const SUGGESTIONS_SOURCES: SuggestionsSource[] = ["search_history", "game_titles", "both"];
const MATCH_MODES: AutocompleteMatchMode[] = ["prefix", "contains", "fuzzy"];
const INDEX_BACKENDS: IndexBackend[] = ["postgres_ilike", "postgres_fts", "external"];
const EXTERNAL_ENGINES: ExternalSearchEngine[] = ["meilisearch", "algolia"];
const BUILD_STATUSES: SearchBuildStatus[] = ["success", "failed"];
const PURGE_SCOPES: SearchPurgeScope[] = ["all", "suggestions", "autocomplete"];

export const SUGGESTIONS_MAX_RESULTS_LIMITS = { min: 1, max: 20 } as const;
export const SUGGESTIONS_MIN_CHARS_LIMITS = { min: 1, max: 10 } as const;
export const SUGGESTIONS_TTL_LIMITS = { min: 5, max: 86400 } as const;
export const POPULAR_WINDOW_DAYS_LIMITS = { min: 1, max: 90 } as const;
export const POPULAR_MAX_RESULTS_LIMITS = { min: 1, max: 50 } as const;
export const POPULAR_MIN_OCCURRENCES_LIMITS = { min: 1, max: 1000 } as const;
export const POPULAR_REFRESH_INTERVAL_LIMITS = { min: 5, max: 1440 } as const;
export const FILTER_TTL_LIMITS = { min: 5, max: 86400 } as const;
export const FILTER_MAX_COMBINATIONS_LIMITS = { min: 20, max: 20000 } as const;
export const AUTOCOMPLETE_MIN_CHARS_LIMITS = { min: 1, max: 10 } as const;
export const AUTOCOMPLETE_DEBOUNCE_LIMITS = { min: 0, max: 2000 } as const;
export const AUTOCOMPLETE_MAX_SUGGESTIONS_LIMITS = { min: 1, max: 20 } as const;
export const INDEX_REBUILD_INTERVAL_LIMITS = { min: 1, max: 168 } as const;
export const INDEX_SOURCE_WEIGHT_LIMITS = { min: 1, max: 10 } as const;

export const DEFAULT_INDEX_SOURCES: SearchIndexSource[] = [
  { key: "games", label: "Games", enabled: true, weight: 10 },
  { key: "categories", label: "Categories", enabled: true, weight: 6 },
  { key: "tags", label: "Tags", enabled: true, weight: 4 },
  { key: "blog_posts", label: "Blog Posts", enabled: false, weight: 3 },
];

/** Static copy shown alongside each index-source row — not config, so it
 * lives here rather than in the DB, same pattern as fragment-cache-
 * settings.ts's FRAGMENT_CATALOG. */
export const INDEX_SOURCE_CATALOG: Record<string, { description: string; wired: boolean }> = {
  games: {
    description: "Title, description, and category — the same data GamesBrowseClient and SearchBox already search client-side.",
    wired: true,
  },
  categories: {
    description: "Category names and slugs, so a search for \"puzzle\" can surface the category page itself.",
    wired: true,
  },
  tags: {
    description: "Game tags (TOP / HOT / NEW / UPDATED) and any future free-form tags from Admin → Tags.",
    wired: true,
  },
  blog_posts: {
    description: "Blog post titles and bodies (Admin → Posts) — off by default until blog content is part of the search experience.",
    wired: false,
  },
};

export const DEFAULT_SEARCH_CACHE_SETTINGS: SearchCacheSettings = {
  suggestionsEnabled: true,
  suggestionsSource: "both",
  suggestionsMaxResults: 6,
  suggestionsMinChars: 2,
  suggestionsCacheTtlSeconds: 300,
  suggestionsFuzzyMatching: false,

  popularSearchesEnabled: true,
  popularSearchesWindowDays: 7,
  popularSearchesMaxResults: 10,
  popularSearchesMinOccurrences: 3,
  popularSearchesRefreshIntervalMinutes: 60,
  popularSearchesExcludeNoResults: true,
  popularSearchesLastRefreshedAt: null,
  popularSearchesLastRefreshCount: 0,

  filterCacheEnabled: true,
  filterCacheTtlSeconds: 120,
  filterCacheableParams: ["q", "categories", "tags", "platforms", "modes", "sort"],
  filterCacheMaxCombinations: 500,
  filterCacheVaryByDevice: false,

  autocompleteEnabled: true,
  autocompleteMinChars: 1,
  autocompleteDebounceMs: 150,
  autocompleteMaxSuggestions: 8,
  autocompleteHighlightMatch: true,
  autocompleteMatchMode: "prefix",

  indexBackend: "postgres_ilike",
  indexSources: DEFAULT_INDEX_SOURCES,
  indexAutoRebuild: true,
  indexRebuildIntervalHours: 24,
  indexLastBuiltAt: null,
  indexLastBuildDurationMs: null,
  indexLastBuildDocCount: null,
  indexLastBuildStatus: null,
  indexLastBuildMessage: null,
  externalEngine: "meilisearch",
  externalHost: "",
  externalApiKeySet: false,
  externalApiKeyPreview: null,
  externalIndexName: "games",

  lastPurgedAt: null,
  lastPurgeSummary: null,

  updatedAt: new Date(0).toISOString(),
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Redact a stored secret — only a boolean + last-4-chars preview goes to
 * the browser. Mirrors object-cache-settings.ts / session-cache-settings.ts. */
export function redactSecret(value: string | null | undefined): { set: boolean; preview: string | null } {
  if (!value) return { set: false, preview: null };
  return { set: true, preview: value.length > 4 ? `…${value.slice(-4)}` : "…" };
}

function mapIndexSources(raw: unknown): SearchIndexSource[] {
  if (!Array.isArray(raw)) return DEFAULT_INDEX_SOURCES;
  const byKey = new Map<string, SearchIndexSource>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const key = typeof e.key === "string" ? e.key : null;
    if (!key) continue;
    byKey.set(key, {
      key,
      label: typeof e.label === "string" && e.label.trim() ? e.label : key,
      enabled: Boolean(e.enabled ?? true),
      weight: clamp(Number(e.weight ?? 5), INDEX_SOURCE_WEIGHT_LIMITS.min, INDEX_SOURCE_WEIGHT_LIMITS.max),
    });
  }
  // Preserve canonical catalogue order; fall back to the default entry for
  // any source missing from the row (fresh install, or a source added to
  // the code after the row was first created) — same pattern as
  // fragment-cache-settings.ts's mapFragments.
  return DEFAULT_INDEX_SOURCES.map((d) => byKey.get(d.key) ?? d);
}

/** Row shape returned by GET /api/admin/cache/search/settings (snake_case,
 * as stored) — already redacted server-side, so this never sees a raw
 * external_api_key, only the *_set / *_preview fields the route computed. */
export function mapSearchCacheRow(row: Record<string, unknown> | null): SearchCacheSettings {
  if (!row) return DEFAULT_SEARCH_CACHE_SETTINGS;
  const d = DEFAULT_SEARCH_CACHE_SETTINGS;

  const suggestionsSource = String(row.suggestions_source ?? "");
  const matchMode = String(row.autocomplete_match_mode ?? "");
  const indexBackend = String(row.index_backend ?? "");
  const externalEngine = String(row.external_engine ?? "");
  const buildStatus = String(row.index_last_build_status ?? "");

  const summaryRaw = row.last_purge_summary;
  let lastPurgeSummary: SearchPurgeSummary | null = null;
  if (summaryRaw && typeof summaryRaw === "object") {
    const s = summaryRaw as Record<string, unknown>;
    const scope = String(s.scope ?? "all");
    lastPurgeSummary = {
      scope: PURGE_SCOPES.includes(scope as SearchPurgeScope) ? (scope as SearchPurgeScope) : "all",
      entriesRemoved: Number(s.entriesRemoved ?? 0),
    };
  }

  return {
    suggestionsEnabled: Boolean(row.suggestions_enabled ?? d.suggestionsEnabled),
    suggestionsSource: SUGGESTIONS_SOURCES.includes(suggestionsSource as SuggestionsSource)
      ? (suggestionsSource as SuggestionsSource)
      : d.suggestionsSource,
    suggestionsMaxResults: clamp(
      Number(row.suggestions_max_results ?? d.suggestionsMaxResults),
      SUGGESTIONS_MAX_RESULTS_LIMITS.min,
      SUGGESTIONS_MAX_RESULTS_LIMITS.max
    ),
    suggestionsMinChars: clamp(
      Number(row.suggestions_min_chars ?? d.suggestionsMinChars),
      SUGGESTIONS_MIN_CHARS_LIMITS.min,
      SUGGESTIONS_MIN_CHARS_LIMITS.max
    ),
    suggestionsCacheTtlSeconds: clamp(
      Number(row.suggestions_cache_ttl_seconds ?? d.suggestionsCacheTtlSeconds),
      SUGGESTIONS_TTL_LIMITS.min,
      SUGGESTIONS_TTL_LIMITS.max
    ),
    suggestionsFuzzyMatching: Boolean(row.suggestions_fuzzy_matching ?? d.suggestionsFuzzyMatching),

    popularSearchesEnabled: Boolean(row.popular_searches_enabled ?? d.popularSearchesEnabled),
    popularSearchesWindowDays: clamp(
      Number(row.popular_searches_window_days ?? d.popularSearchesWindowDays),
      POPULAR_WINDOW_DAYS_LIMITS.min,
      POPULAR_WINDOW_DAYS_LIMITS.max
    ),
    popularSearchesMaxResults: clamp(
      Number(row.popular_searches_max_results ?? d.popularSearchesMaxResults),
      POPULAR_MAX_RESULTS_LIMITS.min,
      POPULAR_MAX_RESULTS_LIMITS.max
    ),
    popularSearchesMinOccurrences: clamp(
      Number(row.popular_searches_min_occurrences ?? d.popularSearchesMinOccurrences),
      POPULAR_MIN_OCCURRENCES_LIMITS.min,
      POPULAR_MIN_OCCURRENCES_LIMITS.max
    ),
    popularSearchesRefreshIntervalMinutes: clamp(
      Number(row.popular_searches_refresh_interval_minutes ?? d.popularSearchesRefreshIntervalMinutes),
      POPULAR_REFRESH_INTERVAL_LIMITS.min,
      POPULAR_REFRESH_INTERVAL_LIMITS.max
    ),
    popularSearchesExcludeNoResults: Boolean(row.popular_searches_exclude_no_results ?? d.popularSearchesExcludeNoResults),
    popularSearchesLastRefreshedAt: row.popular_searches_last_refreshed_at
      ? String(row.popular_searches_last_refreshed_at)
      : null,
    popularSearchesLastRefreshCount: Number(row.popular_searches_last_refresh_count ?? 0),

    filterCacheEnabled: Boolean(row.filter_cache_enabled ?? d.filterCacheEnabled),
    filterCacheTtlSeconds: clamp(
      Number(row.filter_cache_ttl_seconds ?? d.filterCacheTtlSeconds),
      FILTER_TTL_LIMITS.min,
      FILTER_TTL_LIMITS.max
    ),
    filterCacheableParams: Array.isArray(row.filter_cacheable_params)
      ? row.filter_cacheable_params.map(String)
      : d.filterCacheableParams,
    filterCacheMaxCombinations: clamp(
      Number(row.filter_cache_max_combinations ?? d.filterCacheMaxCombinations),
      FILTER_MAX_COMBINATIONS_LIMITS.min,
      FILTER_MAX_COMBINATIONS_LIMITS.max
    ),
    filterCacheVaryByDevice: Boolean(row.filter_cache_vary_by_device ?? d.filterCacheVaryByDevice),

    autocompleteEnabled: Boolean(row.autocomplete_enabled ?? d.autocompleteEnabled),
    autocompleteMinChars: clamp(
      Number(row.autocomplete_min_chars ?? d.autocompleteMinChars),
      AUTOCOMPLETE_MIN_CHARS_LIMITS.min,
      AUTOCOMPLETE_MIN_CHARS_LIMITS.max
    ),
    autocompleteDebounceMs: clamp(
      Number(row.autocomplete_debounce_ms ?? d.autocompleteDebounceMs),
      AUTOCOMPLETE_DEBOUNCE_LIMITS.min,
      AUTOCOMPLETE_DEBOUNCE_LIMITS.max
    ),
    autocompleteMaxSuggestions: clamp(
      Number(row.autocomplete_max_suggestions ?? d.autocompleteMaxSuggestions),
      AUTOCOMPLETE_MAX_SUGGESTIONS_LIMITS.min,
      AUTOCOMPLETE_MAX_SUGGESTIONS_LIMITS.max
    ),
    autocompleteHighlightMatch: Boolean(row.autocomplete_highlight_match ?? d.autocompleteHighlightMatch),
    autocompleteMatchMode: MATCH_MODES.includes(matchMode as AutocompleteMatchMode)
      ? (matchMode as AutocompleteMatchMode)
      : d.autocompleteMatchMode,

    indexBackend: INDEX_BACKENDS.includes(indexBackend as IndexBackend) ? (indexBackend as IndexBackend) : d.indexBackend,
    indexSources: mapIndexSources(row.index_sources),
    indexAutoRebuild: Boolean(row.index_auto_rebuild ?? d.indexAutoRebuild),
    indexRebuildIntervalHours: clamp(
      Number(row.index_rebuild_interval_hours ?? d.indexRebuildIntervalHours),
      INDEX_REBUILD_INTERVAL_LIMITS.min,
      INDEX_REBUILD_INTERVAL_LIMITS.max
    ),
    indexLastBuiltAt: row.index_last_built_at ? String(row.index_last_built_at) : null,
    indexLastBuildDurationMs:
      row.index_last_build_duration_ms === null || row.index_last_build_duration_ms === undefined
        ? null
        : Number(row.index_last_build_duration_ms),
    indexLastBuildDocCount:
      row.index_last_build_doc_count === null || row.index_last_build_doc_count === undefined
        ? null
        : Number(row.index_last_build_doc_count),
    indexLastBuildStatus: BUILD_STATUSES.includes(buildStatus as SearchBuildStatus)
      ? (buildStatus as SearchBuildStatus)
      : null,
    indexLastBuildMessage: row.index_last_build_message ? String(row.index_last_build_message) : null,
    externalEngine: EXTERNAL_ENGINES.includes(externalEngine as ExternalSearchEngine)
      ? (externalEngine as ExternalSearchEngine)
      : d.externalEngine,
    externalHost: String(row.external_host ?? ""),
    externalApiKeySet: Boolean(row.external_api_key_set ?? false),
    externalApiKeyPreview: row.external_api_key_preview ? String(row.external_api_key_preview) : null,
    externalIndexName: String(row.external_index_name ?? d.externalIndexName),

    lastPurgedAt: row.last_purged_at ? String(row.last_purged_at) : null,
    lastPurgeSummary,

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}
