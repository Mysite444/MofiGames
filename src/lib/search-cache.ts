// Server-only. The real engine behind two of the five Admin → Cache →
// Search Cache pillars: Search Suggestions and Autocomplete. Both are
// "compute a ranked list for a short query string" problems, so they
// share one in-process TTL + LRU key/value store, namespaced apart
// ("suggestions" vs "autocomplete") so purging or inspecting one never
// touches the other — same shape as fragment-cache.ts, just keyed on
// (namespace, query) instead of (fragmentKey, variant).
//
// Popular Searches and Search Indexes are NOT served from here: Popular
// Searches is a precomputed database table (search_popular_queries,
// recomputed by POST /api/admin/cache/search/recompute-popular) and
// Search Indexes is either a live Postgres query or an external engine
// (rebuild-index/route.ts) — neither is a short-lived per-request cache
// in the sense this file models. Filter Results has no live server-side
// filtered endpoint yet to cache (see the migration's note on
// GamesBrowseClient.tsx being client-side today), so it's config-only.
//
// Deliberately in-process rather than Redis-backed, same reasoning as
// fragment-cache.ts: a miss just recomputes against Supabase, which is
// no worse than not having this cache at all. On a multi-instance
// deployment each instance has its own store, so a purge only clears the
// instance that handled the request.
//
// Survives Next.js dev-mode hot module reloads via a globalThis
// singleton, same trick as fragment-cache.ts.

export type SearchCacheNamespace = "suggestions" | "autocomplete";

interface SearchCacheEntry {
  value: unknown;
  createdAt: number;
  expiresAt: number;
  approxBytes: number;
}

interface SearchCacheNamespaceStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  errors: number;
}

interface SearchCacheGlobals {
  store: Map<string, SearchCacheEntry>;
  stats: Record<SearchCacheNamespace, SearchCacheNamespaceStats>;
}

const globalForSearchCache = globalThis as unknown as { __searchCache?: SearchCacheGlobals };

function freshStats(): SearchCacheNamespaceStats {
  return { hits: 0, misses: 0, sets: 0, evictions: 0, errors: 0 };
}

function store(): SearchCacheGlobals {
  if (!globalForSearchCache.__searchCache) {
    globalForSearchCache.__searchCache = {
      store: new Map(),
      stats: { suggestions: freshStats(), autocomplete: freshStats() },
    };
  }
  return globalForSearchCache.__searchCache;
}

function cacheKeyFor(namespace: SearchCacheNamespace, query: string): string {
  return `${namespace}::${query.trim().toLowerCase()}`;
}

function namespaceFromCacheKey(cacheKey: string): SearchCacheNamespace {
  return cacheKey.startsWith("autocomplete::") ? "autocomplete" : "suggestions";
}

function approxSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Caps the store size per namespace so an unbounded stream of unique
 * queries (typos, one-off searches) can't grow the Node process's
 * memory indefinitely. Evicts the coldest entry in that namespace —
 * Map iteration order tracks insertion/last-access order since get()
 * re-inserts on a hit, same LRU trick as fragment-cache.ts. */
const MAX_ENTRIES_PER_NAMESPACE = 2000;

function enforceCap(namespace: SearchCacheNamespace) {
  const g = store();
  let countInNamespace = 0;
  for (const key of g.store.keys()) {
    if (namespaceFromCacheKey(key) === namespace) countInNamespace++;
  }
  while (countInNamespace > MAX_ENTRIES_PER_NAMESPACE) {
    for (const key of g.store.keys()) {
      if (namespaceFromCacheKey(key) === namespace) {
        g.store.delete(key);
        g.stats[namespace].evictions++;
        countInNamespace--;
        break;
      }
    }
  }
}

/** The core primitive: look up `query` in `namespace`'s cache; on a miss
 * (or expiry), run `compute` and cache the result for `ttlSeconds`. A
 * `ttlSeconds` of 0 or a `query` shorter than the caller's own min-chars
 * gate should be checked by the caller *before* reaching here — this
 * function always caches whatever it's given. */
export async function getOrSetSearchCache<T>(
  namespace: SearchCacheNamespace,
  query: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<{ value: T; cacheHit: boolean }> {
  const g = store();
  const cacheKey = cacheKeyFor(namespace, query);
  const now = Date.now();
  const existing = g.store.get(cacheKey);

  if (existing && now < existing.expiresAt) {
    // Fresh hit — bump recency for the LRU eviction order.
    g.store.delete(cacheKey);
    g.store.set(cacheKey, existing);
    g.stats[namespace].hits++;
    return { value: existing.value as T, cacheHit: true };
  }

  g.stats[namespace].misses++;
  try {
    const fresh = await compute();
    g.store.set(cacheKey, {
      value: fresh,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      approxBytes: approxSize(fresh),
    });
    g.stats[namespace].sets++;
    enforceCap(namespace);
    return { value: fresh, cacheHit: false };
  } catch (err) {
    g.stats[namespace].errors++;
    throw err;
  }
}

/** Admin → Cache → Search Cache → "Purge". scope "all" clears both
 * namespaces; "suggestions"/"autocomplete" clears only that one. Returns
 * the number of entries actually removed. */
export function purgeSearchCache(scope: "all" | SearchCacheNamespace): number {
  const g = store();
  let removed = 0;
  for (const key of Array.from(g.store.keys())) {
    if (scope === "all" || namespaceFromCacheKey(key) === scope) {
      g.store.delete(key);
      removed++;
    }
  }
  return removed;
}

export interface SearchCacheNamespaceStatsRow extends SearchCacheNamespaceStats {
  namespace: SearchCacheNamespace;
  entries: number;
  approxBytes: number;
  hitRate: number | null;
}

export interface SearchCacheStats {
  totalEntries: number;
  totalApproxBytes: number;
  namespaces: SearchCacheNamespaceStatsRow[];
}

/** Admin → Cache → Search Cache dashboard — live, in-process numbers, no
 * database round trip, same spirit as getFragmentCacheStats(). */
export function getSearchCacheStats(): SearchCacheStats {
  const g = store();
  const counts: Record<SearchCacheNamespace, { entries: number; bytes: number }> = {
    suggestions: { entries: 0, bytes: 0 },
    autocomplete: { entries: 0, bytes: 0 },
  };
  for (const [key, entry] of g.store.entries()) {
    const ns = namespaceFromCacheKey(key);
    counts[ns].entries++;
    counts[ns].bytes += entry.approxBytes;
  }

  const namespaces: SearchCacheNamespaceStatsRow[] = (["suggestions", "autocomplete"] as const).map((namespace) => {
    const s = g.stats[namespace];
    const totalLookups = s.hits + s.misses;
    return {
      namespace,
      entries: counts[namespace].entries,
      approxBytes: counts[namespace].bytes,
      hitRate: totalLookups > 0 ? s.hits / totalLookups : null,
      ...s,
    };
  });

  return {
    totalEntries: g.store.size,
    totalApproxBytes: namespaces.reduce((sum, n) => sum + n.approxBytes, 0),
    namespaces,
  };
}

// ── Query matching ──────────────────────────────────────────────────────────
// Shared by the /preview route for both Suggestions (against game_titles)
// and Autocomplete. True edit-distance fuzzy matching would need the
// pg_trgm extension enabled on the database; until that's set up, "fuzzy"
// is approximated as substring (not just prefix) matching so the toggle
// has an observable, honest effect rather than silently doing nothing.

export type MatchMode = "prefix" | "contains" | "fuzzy";

/** Returns the index of the first match of `query` in `text` under the
 * given mode, or -1. Case-insensitive. Used both to filter and (by the
 * admin preview UI) to highlight the matched substring. */
export function matchQuery(text: string, query: string, mode: MatchMode): number {
  const haystack = text.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return -1;
  if (mode === "prefix") {
    return haystack.startsWith(needle) ? 0 : -1;
  }
  // "contains" and the "fuzzy" approximation both reduce to substring search.
  return haystack.indexOf(needle);
}
