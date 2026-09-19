import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactSecret } from "@/lib/search-cache-settings";
import { searchCacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation-search-cache";

type SecretRow = Record<string, unknown> & {
  external_api_key?: string | null;
};

/** Strips the raw external_api_key off a search_cache_settings row and
 * replaces it with redacted *_set / *_preview fields — same treatment as
 * session_cache_settings.redis_password / cdn_cache_settings.api_token. */
function redactRow(row: SecretRow): Record<string, unknown> {
  const { external_api_key, ...rest } = row;
  const redacted = redactSecret(external_api_key ?? null);
  return {
    ...rest,
    external_api_key_set: redacted.set,
    external_api_key_preview: redacted.preview,
  };
}

/** GET /api/admin/cache/search/settings — Admin → Cache → Search Cache.
 * Admin-only: this row can hold a live external search-engine API key
 * (Meilisearch/Algolia), so it never gets a publicly-readable policy —
 * the key never leaves this route as anything but a boolean + preview. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("search_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load search cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ? redactRow(data as SecretRow) : null });
}

/** PUT /api/admin/cache/search/settings — Admin → Cache → Search Cache.
 * Admin-only. externalApiKey blank or omitted leaves the stored value
 * untouched (so re-saving other fields never accidentally wipes a
 * credential) — clearExternalApiKey is the only way to actually clear it,
 * same shape as session/settings' redisPassword handling. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = searchCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };

  // ── 1. Search Suggestions ────────────────────────────────────────────────
  if (input.suggestionsEnabled !== undefined) patch.suggestions_enabled = input.suggestionsEnabled;
  if (input.suggestionsSource !== undefined) patch.suggestions_source = input.suggestionsSource;
  if (input.suggestionsMaxResults !== undefined) patch.suggestions_max_results = input.suggestionsMaxResults;
  if (input.suggestionsMinChars !== undefined) patch.suggestions_min_chars = input.suggestionsMinChars;
  if (input.suggestionsCacheTtlSeconds !== undefined)
    patch.suggestions_cache_ttl_seconds = input.suggestionsCacheTtlSeconds;
  if (input.suggestionsFuzzyMatching !== undefined) patch.suggestions_fuzzy_matching = input.suggestionsFuzzyMatching;

  // ── 2. Popular Searches ───────────────────────────────────────────────────
  if (input.popularSearchesEnabled !== undefined) patch.popular_searches_enabled = input.popularSearchesEnabled;
  if (input.popularSearchesWindowDays !== undefined)
    patch.popular_searches_window_days = input.popularSearchesWindowDays;
  if (input.popularSearchesMaxResults !== undefined)
    patch.popular_searches_max_results = input.popularSearchesMaxResults;
  if (input.popularSearchesMinOccurrences !== undefined)
    patch.popular_searches_min_occurrences = input.popularSearchesMinOccurrences;
  if (input.popularSearchesRefreshIntervalMinutes !== undefined)
    patch.popular_searches_refresh_interval_minutes = input.popularSearchesRefreshIntervalMinutes;
  if (input.popularSearchesExcludeNoResults !== undefined)
    patch.popular_searches_exclude_no_results = input.popularSearchesExcludeNoResults;

  // ── 3. Filter Results ─────────────────────────────────────────────────────
  if (input.filterCacheEnabled !== undefined) patch.filter_cache_enabled = input.filterCacheEnabled;
  if (input.filterCacheTtlSeconds !== undefined) patch.filter_cache_ttl_seconds = input.filterCacheTtlSeconds;
  if (input.filterCacheableParams !== undefined) patch.filter_cacheable_params = input.filterCacheableParams;
  if (input.filterCacheMaxCombinations !== undefined)
    patch.filter_cache_max_combinations = input.filterCacheMaxCombinations;
  if (input.filterCacheVaryByDevice !== undefined) patch.filter_cache_vary_by_device = input.filterCacheVaryByDevice;

  // ── 4. Autocomplete ───────────────────────────────────────────────────────
  if (input.autocompleteEnabled !== undefined) patch.autocomplete_enabled = input.autocompleteEnabled;
  if (input.autocompleteMinChars !== undefined) patch.autocomplete_min_chars = input.autocompleteMinChars;
  if (input.autocompleteDebounceMs !== undefined) patch.autocomplete_debounce_ms = input.autocompleteDebounceMs;
  if (input.autocompleteMaxSuggestions !== undefined)
    patch.autocomplete_max_suggestions = input.autocompleteMaxSuggestions;
  if (input.autocompleteHighlightMatch !== undefined)
    patch.autocomplete_highlight_match = input.autocompleteHighlightMatch;
  if (input.autocompleteMatchMode !== undefined) patch.autocomplete_match_mode = input.autocompleteMatchMode;

  // ── 5. Search Indexes ─────────────────────────────────────────────────────
  if (input.indexBackend !== undefined) patch.index_backend = input.indexBackend;
  if (input.indexSources !== undefined) patch.index_sources = input.indexSources;
  if (input.indexAutoRebuild !== undefined) patch.index_auto_rebuild = input.indexAutoRebuild;
  if (input.indexRebuildIntervalHours !== undefined)
    patch.index_rebuild_interval_hours = input.indexRebuildIntervalHours;
  if (input.externalEngine !== undefined) patch.external_engine = input.externalEngine;
  if (input.externalHost !== undefined) patch.external_host = input.externalHost || null;
  if (input.clearExternalApiKey) patch.external_api_key = null;
  else if (input.externalApiKey) patch.external_api_key = input.externalApiKey; // blank/omitted → unchanged
  if (input.externalIndexName !== undefined) patch.external_index_name = input.externalIndexName;

  const { data, error } = await supabase
    .from("search_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update search cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: redactRow(data as SecretRow) });
}
