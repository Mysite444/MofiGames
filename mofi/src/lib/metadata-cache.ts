import { getMetadataCacheSettingsServer } from "./metadata-cache-settings-server";
import type { MetadataCacheSettings } from "./metadata-cache-settings";

// Server-only. The real engine behind Admin → Cache → Metadata Cache's
// six namespaces: categories, tags, developers, publishers, games (Game
// Metadata), and seo (SEO Metadata). One in-process TTL + LRU key/value
// store, namespaced apart so purging or inspecting one never touches
// another — same shape as search-cache.ts, generalized to six namespaces
// instead of two and, like fragment-cache.ts, settings-aware: this file
// loads metadata_cache_settings itself (short-lived in-memory cache, see
// SETTINGS_CACHE_MS below) so call sites like getRealGameBySlug() and
// getTagBySlug() don't each need to fetch settings and thread a TTL
// through — they just call getOrSetMetadataCache(namespace, key, compute).
//
// Deliberately in-process rather than Redis-backed, same reasoning as
// fragment-cache.ts / search-cache.ts: a miss just recomputes against
// Supabase, no worse than not having this cache. On a multi-instance
// deployment each instance has its own store, so a purge only clears the
// instance that handled the request.
//
// Survives Next.js dev-mode hot module reloads via a globalThis
// singleton, same trick as fragment-cache.ts / search-cache.ts.

export type MetadataCacheNamespace = "categories" | "tags" | "developers" | "publishers" | "games" | "seo";

const NAMESPACES: MetadataCacheNamespace[] = ["categories", "tags", "developers", "publishers", "games", "seo"];

interface MetadataCacheEntry {
  value: unknown;
  createdAt: number;
  expiresAt: number;
  approxBytes: number;
}

interface MetadataNamespaceStats {
  hits: number;
  misses: number;
  sets: number;
  bypassed: number;
  evictions: number;
  errors: number;
}

interface MetadataCacheGlobals {
  store: Map<string, MetadataCacheEntry>;
  stats: Record<MetadataCacheNamespace, MetadataNamespaceStats>;
  settingsCache: { settings: MetadataCacheSettings; loadedAt: number } | null;
}

const SETTINGS_CACHE_MS = 5000;

const globalForMetadataCache = globalThis as unknown as { __metadataCache?: MetadataCacheGlobals };

function freshStats(): MetadataNamespaceStats {
  return { hits: 0, misses: 0, sets: 0, bypassed: 0, evictions: 0, errors: 0 };
}

function store(): MetadataCacheGlobals {
  if (!globalForMetadataCache.__metadataCache) {
    globalForMetadataCache.__metadataCache = {
      store: new Map(),
      stats: {
        categories: freshStats(),
        tags: freshStats(),
        developers: freshStats(),
        publishers: freshStats(),
        games: freshStats(),
        seo: freshStats(),
      },
      settingsCache: null,
    };
  }
  return globalForMetadataCache.__metadataCache;
}

async function loadSettings(): Promise<MetadataCacheSettings> {
  const g = store();
  const now = Date.now();
  if (g.settingsCache && now - g.settingsCache.loadedAt < SETTINGS_CACHE_MS) {
    return g.settingsCache.settings;
  }
  const settings = await getMetadataCacheSettingsServer();
  g.settingsCache = { settings, loadedAt: now };
  return settings;
}

/** Per-namespace {enabled, ttlSeconds, maxEntries} pulled off the shared
 * settings row. Developers/Publishers have no configurable cap of their
 * own — each only ever holds a small, bounded number of keys (the
 * computed facet list plus the occasional single-developer preview
 * lookup) — so they get a fixed generous ceiling instead of a settings
 * field nobody would need to tune. */
function resolveNamespaceConfig(
  namespace: MetadataCacheNamespace,
  settings: MetadataCacheSettings
): { enabled: boolean; ttlSeconds: number; maxEntries: number } {
  switch (namespace) {
    case "categories":
      return {
        enabled: settings.categoriesEnabled,
        ttlSeconds: settings.categoriesTtlSeconds,
        maxEntries: settings.categoriesMaxEntries,
      };
    case "tags":
      return { enabled: settings.tagsEnabled, ttlSeconds: settings.tagsTtlSeconds, maxEntries: settings.tagsMaxEntries };
    case "developers":
      return { enabled: settings.developersEnabled, ttlSeconds: settings.developersTtlSeconds, maxEntries: 50 };
    case "publishers":
      return { enabled: settings.publishersEnabled, ttlSeconds: settings.publishersTtlSeconds, maxEntries: 50 };
    case "games":
      return {
        enabled: settings.gameMetadataEnabled,
        ttlSeconds: settings.gameMetadataTtlSeconds,
        maxEntries: settings.gameMetadataMaxEntries,
      };
    case "seo":
      return {
        enabled: settings.seoMetadataEnabled,
        ttlSeconds: settings.seoMetadataTtlSeconds,
        maxEntries: settings.seoMetadataMaxEntries,
      };
  }
}

function cacheKeyFor(namespace: MetadataCacheNamespace, key: string): string {
  return `${namespace}::${key}`;
}

function namespaceFromCacheKey(cacheKey: string): MetadataCacheNamespace {
  const i = cacheKey.indexOf("::");
  const prefix = i === -1 ? cacheKey : cacheKey.slice(0, i);
  return (NAMESPACES as string[]).includes(prefix) ? (prefix as MetadataCacheNamespace) : "games";
}

function approxSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Evicts the coldest entry in `namespace` until it's back under
 * `maxEntries` — Map iteration order tracks insertion/last-access order
 * since a hit re-inserts, same LRU trick as search-cache.ts /
 * fragment-cache.ts. */
function enforceCap(namespace: MetadataCacheNamespace, maxEntries: number) {
  const g = store();
  let countInNamespace = 0;
  for (const key of g.store.keys()) {
    if (namespaceFromCacheKey(key) === namespace) countInNamespace++;
  }
  while (countInNamespace > maxEntries) {
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

/** Whether an admin should always bypass the Game Metadata cache and see
 * a live read (see game_metadata_bypass_for_admins). Exposed separately
 * from getOrSetMetadataCache so a call site can decide *which* query to
 * run (RLS-unrestricted vs the public-safe, cacheable shape) before
 * touching the cache at all — see getRealGameBySlug() in
 * games-server.ts for why that ordering matters: an admin-only
 * draft/private row must never be written under a cache key a
 * non-admin's request could then read back. */
export async function getGameMetadataBypassForAdminsSetting(): Promise<boolean> {
  const settings = await loadSettings();
  return settings.gameMetadataBypassForAdmins;
}

export interface GetOrSetMetadataOptions {
  /** Skip the cache entirely for this call (e.g. an admin previewing a
   * draft/private game — see game_metadata_bypass_for_admins) without
   * affecting other callers' entries. Recorded as "bypassed", not a
   * miss. */
  bypass?: boolean;
}

/** The core primitive. `key` is namespace-scoped (a slug, a developer
 * name, `"${entityType}:${slug}"` for the seo namespace, etc.) —
 * callers don't need to prefix it themselves. Settings (enabled/TTL/cap)
 * are loaded internally, so a disabled namespace transparently falls
 * through to `compute()` on every call, same behavior as
 * getOrSetFragment() when a fragment type is off. */
export async function getOrSetMetadataCache<T>(
  namespace: MetadataCacheNamespace,
  key: string,
  compute: () => Promise<T>,
  options: GetOrSetMetadataOptions = {}
): Promise<{ value: T; cacheHit: boolean }> {
  const settings = await loadSettings();
  const { enabled, ttlSeconds, maxEntries } = resolveNamespaceConfig(namespace, settings);

  if (options.bypass || !enabled) {
    store().stats[namespace].bypassed++;
    return { value: await compute(), cacheHit: false };
  }

  const g = store();
  const cacheKey = cacheKeyFor(namespace, key);
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
    enforceCap(namespace, maxEntries);
    return { value: fresh, cacheHit: false };
  } catch (err) {
    g.stats[namespace].errors++;
    throw err;
  }
}

/** Admin → Cache → Metadata Cache → "Purge". scope "all" clears every
 * namespace; a single namespace clears only that one. Returns the number
 * of entries actually removed. */
export function purgeMetadataCache(scope: "all" | MetadataCacheNamespace): number {
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

export interface MetadataNamespaceStatsRow extends MetadataNamespaceStats {
  namespace: MetadataCacheNamespace;
  entries: number;
  approxBytes: number;
  hitRate: number | null;
}

export interface MetadataCacheStats {
  totalEntries: number;
  totalApproxBytes: number;
  namespaces: MetadataNamespaceStatsRow[];
}

/** Admin → Cache → Metadata Cache dashboard — live, in-process numbers,
 * no database round trip, same spirit as getSearchCacheStats() /
 * getFragmentCacheStats(). */
export function getMetadataCacheStats(): MetadataCacheStats {
  const g = store();
  const counts: Record<MetadataCacheNamespace, { entries: number; bytes: number }> = {
    categories: { entries: 0, bytes: 0 },
    tags: { entries: 0, bytes: 0 },
    developers: { entries: 0, bytes: 0 },
    publishers: { entries: 0, bytes: 0 },
    games: { entries: 0, bytes: 0 },
    seo: { entries: 0, bytes: 0 },
  };
  for (const [key, entry] of g.store.entries()) {
    const ns = namespaceFromCacheKey(key);
    counts[ns].entries++;
    counts[ns].bytes += entry.approxBytes;
  }

  const namespaces: MetadataNamespaceStatsRow[] = NAMESPACES.map((namespace) => {
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
