// Search Cache validation schemas — Admin → Cache → Search Cache.
// Import from here in the route handlers under
// src/app/api/admin/cache/search/**.

import { z } from "zod";
import {
  SUGGESTIONS_MAX_RESULTS_LIMITS,
  SUGGESTIONS_MIN_CHARS_LIMITS,
  SUGGESTIONS_TTL_LIMITS,
  POPULAR_WINDOW_DAYS_LIMITS,
  POPULAR_MAX_RESULTS_LIMITS,
  POPULAR_MIN_OCCURRENCES_LIMITS,
  POPULAR_REFRESH_INTERVAL_LIMITS,
  FILTER_TTL_LIMITS,
  FILTER_MAX_COMBINATIONS_LIMITS,
  AUTOCOMPLETE_MIN_CHARS_LIMITS,
  AUTOCOMPLETE_DEBOUNCE_LIMITS,
  AUTOCOMPLETE_MAX_SUGGESTIONS_LIMITS,
  INDEX_REBUILD_INTERVAL_LIMITS,
  INDEX_SOURCE_WEIGHT_LIMITS,
} from "./search-cache-settings";

const indexSourceInputSchema = z.object({
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(64).optional(),
  enabled: z.boolean().optional(),
  weight: z.number().int().min(INDEX_SOURCE_WEIGHT_LIMITS.min).max(INDEX_SOURCE_WEIGHT_LIMITS.max).optional(),
});

export const searchCacheSettingsInputSchema = z.object({
  // ── 1. Search Suggestions ────────────────────────────────────────────────
  suggestionsEnabled: z.boolean().optional(),
  suggestionsSource: z.enum(["search_history", "game_titles", "both"]).optional(),
  suggestionsMaxResults: z
    .number()
    .int()
    .min(SUGGESTIONS_MAX_RESULTS_LIMITS.min)
    .max(SUGGESTIONS_MAX_RESULTS_LIMITS.max)
    .optional(),
  suggestionsMinChars: z
    .number()
    .int()
    .min(SUGGESTIONS_MIN_CHARS_LIMITS.min)
    .max(SUGGESTIONS_MIN_CHARS_LIMITS.max)
    .optional(),
  suggestionsCacheTtlSeconds: z.number().int().min(SUGGESTIONS_TTL_LIMITS.min).max(SUGGESTIONS_TTL_LIMITS.max).optional(),
  suggestionsFuzzyMatching: z.boolean().optional(),

  // ── 2. Popular Searches ───────────────────────────────────────────────────
  popularSearchesEnabled: z.boolean().optional(),
  popularSearchesWindowDays: z
    .number()
    .int()
    .min(POPULAR_WINDOW_DAYS_LIMITS.min)
    .max(POPULAR_WINDOW_DAYS_LIMITS.max)
    .optional(),
  popularSearchesMaxResults: z
    .number()
    .int()
    .min(POPULAR_MAX_RESULTS_LIMITS.min)
    .max(POPULAR_MAX_RESULTS_LIMITS.max)
    .optional(),
  popularSearchesMinOccurrences: z
    .number()
    .int()
    .min(POPULAR_MIN_OCCURRENCES_LIMITS.min)
    .max(POPULAR_MIN_OCCURRENCES_LIMITS.max)
    .optional(),
  popularSearchesRefreshIntervalMinutes: z
    .number()
    .int()
    .min(POPULAR_REFRESH_INTERVAL_LIMITS.min)
    .max(POPULAR_REFRESH_INTERVAL_LIMITS.max)
    .optional(),
  popularSearchesExcludeNoResults: z.boolean().optional(),

  // ── 3. Filter Results ─────────────────────────────────────────────────────
  filterCacheEnabled: z.boolean().optional(),
  filterCacheTtlSeconds: z.number().int().min(FILTER_TTL_LIMITS.min).max(FILTER_TTL_LIMITS.max).optional(),
  filterCacheableParams: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers, and underscores only")
    )
    .max(20)
    .optional(),
  filterCacheMaxCombinations: z
    .number()
    .int()
    .min(FILTER_MAX_COMBINATIONS_LIMITS.min)
    .max(FILTER_MAX_COMBINATIONS_LIMITS.max)
    .optional(),
  filterCacheVaryByDevice: z.boolean().optional(),

  // ── 4. Autocomplete ───────────────────────────────────────────────────────
  autocompleteEnabled: z.boolean().optional(),
  autocompleteMinChars: z
    .number()
    .int()
    .min(AUTOCOMPLETE_MIN_CHARS_LIMITS.min)
    .max(AUTOCOMPLETE_MIN_CHARS_LIMITS.max)
    .optional(),
  autocompleteDebounceMs: z
    .number()
    .int()
    .min(AUTOCOMPLETE_DEBOUNCE_LIMITS.min)
    .max(AUTOCOMPLETE_DEBOUNCE_LIMITS.max)
    .optional(),
  autocompleteMaxSuggestions: z
    .number()
    .int()
    .min(AUTOCOMPLETE_MAX_SUGGESTIONS_LIMITS.min)
    .max(AUTOCOMPLETE_MAX_SUGGESTIONS_LIMITS.max)
    .optional(),
  autocompleteHighlightMatch: z.boolean().optional(),
  autocompleteMatchMode: z.enum(["prefix", "contains", "fuzzy"]).optional(),

  // ── 5. Search Indexes ─────────────────────────────────────────────────────
  indexBackend: z.enum(["postgres_ilike", "postgres_fts", "external"]).optional(),
  indexSources: z.array(indexSourceInputSchema).max(20).optional(),
  indexAutoRebuild: z.boolean().optional(),
  indexRebuildIntervalHours: z
    .number()
    .int()
    .min(INDEX_REBUILD_INTERVAL_LIMITS.min)
    .max(INDEX_REBUILD_INTERVAL_LIMITS.max)
    .optional(),
  externalEngine: z.enum(["meilisearch", "algolia"]).optional(),
  externalHost: z.string().trim().max(255).optional(),
  externalApiKey: z.string().trim().min(1).max(512).optional(), // blank/omitted = unchanged
  clearExternalApiKey: z.boolean().optional(),
  externalIndexName: z.string().trim().min(1).max(64).optional(),
});

/** POST /api/admin/cache/search/purge body. */
export const searchCachePurgeInputSchema = z.object({
  scope: z.enum(["all", "suggestions", "autocomplete"]),
});

/** POST /api/admin/cache/search/preview body — runs a sample query
 * through the live Suggestions + Autocomplete pipeline. */
export const searchCachePreviewInputSchema = z.object({
  query: z.string().trim().min(1).max(200),
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
