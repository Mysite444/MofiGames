import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mapSearchCacheRow } from "@/lib/search-cache-settings";
import { searchCachePreviewInputSchema, firstIssueMessage } from "@/lib/validation-search-cache";
import { getOrSetSearchCache, matchQuery } from "@/lib/search-cache";

// Autocomplete has no admin-configurable TTL of its own (only debounce,
// which is a client-side concern) — a short fixed window keeps rapid
// keystrokes on the same prefix from re-querying Postgres on every
// character without needing another settings field.
const AUTOCOMPLETE_CACHE_TTL_SECONDS = 60;

interface SuggestionResult {
  text: string;
  source: "game_titles" | "search_history";
  matchIndex: number;
}

interface AutocompleteResult {
  title: string;
  slug: string;
  matchIndex: number;
}

/** POST /api/admin/cache/search/preview — Admin → Cache → Search Cache →
 * "Test a query". Admin-only. Runs `query` through the real Search
 * Suggestions and Autocomplete pipelines (honoring the currently saved
 * settings — min chars, max results, source, match mode, fuzzy toggle)
 * and through the actual in-process cache in search-cache.ts, so the
 * admin can see live cacheHit/tookMs behavior rather than a static mock.
 * This never touches the public SearchBox — it's a preview tool only. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = searchCachePreviewInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const { query } = parsed.data;

  const { data: row, error: settingsError } = await supabase
    .from("search_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (settingsError) {
    return NextResponse.json({ error: "Failed to load search cache settings." }, { status: 500 });
  }
  const settings = mapSearchCacheRow(row);

  const startedAt = Date.now();

  // ── Search Suggestions ────────────────────────────────────────────────
  let suggestions: SuggestionResult[] = [];
  let suggestionsCacheHit = false;
  let suggestionsSkippedReason: string | null = null;

  if (!settings.suggestionsEnabled) {
    suggestionsSkippedReason = "Search Suggestions is disabled.";
  } else if (query.length < settings.suggestionsMinChars) {
    suggestionsSkippedReason = `Query is shorter than the configured minimum (${settings.suggestionsMinChars} characters).`;
  } else {
    const matchMode = settings.suggestionsFuzzyMatching ? "contains" : "prefix";
    const result = await getOrSetSearchCache(
      "suggestions",
      query,
      settings.suggestionsCacheTtlSeconds,
      async (): Promise<SuggestionResult[]> => {
        const out: SuggestionResult[] = [];

        if (settings.suggestionsSource === "game_titles" || settings.suggestionsSource === "both") {
          const { data: games } = await supabase
            .from("games")
            .select("title")
            .eq("is_published", true)
            .limit(200);
          for (const g of games ?? []) {
            const title = String((g as { title: string }).title);
            const idx = matchQuery(title, query, matchMode);
            if (idx !== -1) out.push({ text: title, source: "game_titles", matchIndex: idx });
          }
        }

        if (settings.suggestionsSource === "search_history" || settings.suggestionsSource === "both") {
          const { data: history } = await supabase
            .from("search_queries")
            .select("query")
            .order("created_at", { ascending: false })
            .limit(500);
          const seen = new Set<string>();
          for (const h of history ?? []) {
            const q = String((h as { query: string }).query);
            const key = q.toLowerCase();
            if (seen.has(key)) continue;
            const idx = matchQuery(q, query, matchMode);
            if (idx !== -1) {
              seen.add(key);
              out.push({ text: q, source: "search_history", matchIndex: idx });
            }
          }
        }

        return out.slice(0, settings.suggestionsMaxResults);
      }
    );
    suggestions = result.value;
    suggestionsCacheHit = result.cacheHit;
  }

  // ── Autocomplete ──────────────────────────────────────────────────────
  let autocomplete: AutocompleteResult[] = [];
  let autocompleteCacheHit = false;
  let autocompleteSkippedReason: string | null = null;

  if (!settings.autocompleteEnabled) {
    autocompleteSkippedReason = "Autocomplete is disabled.";
  } else if (query.length < settings.autocompleteMinChars) {
    autocompleteSkippedReason = `Query is shorter than the configured minimum (${settings.autocompleteMinChars} character${settings.autocompleteMinChars === 1 ? "" : "s"}).`;
  } else {
    const result = await getOrSetSearchCache(
      "autocomplete",
      query,
      AUTOCOMPLETE_CACHE_TTL_SECONDS,
      async (): Promise<AutocompleteResult[]> => {
        const { data: games } = await supabase
          .from("games")
          .select("title, slug")
          .eq("is_published", true)
          .limit(500);
        const out: AutocompleteResult[] = [];
        for (const g of games ?? []) {
          const row = g as { title: string; slug: string };
          const idx = matchQuery(row.title, query, settings.autocompleteMatchMode);
          if (idx !== -1) out.push({ title: row.title, slug: row.slug, matchIndex: idx });
        }
        return out.slice(0, settings.autocompleteMaxSuggestions);
      }
    );
    autocomplete = result.value;
    autocompleteCacheHit = result.cacheHit;
  }

  return NextResponse.json({
    query,
    tookMs: Date.now() - startedAt,
    suggestions: { results: suggestions, cacheHit: suggestionsCacheHit, skippedReason: suggestionsSkippedReason },
    autocomplete: { results: autocomplete, cacheHit: autocompleteCacheHit, skippedReason: autocompleteSkippedReason },
  });
}
