import { getFragmentCacheSettingsServer } from "./fragment-cache-settings-server";
import type { FragmentCacheSettings } from "./fragment-cache-settings";
import { isNextControlFlowError } from "./supabase/timeout-fetch";

// Server-only — pulls in fragment-cache-settings-server.ts, which itself
// pulls in next/headers via the Supabase server client. Never import this
// from a "use client" component; use the /api/admin/cache/fragment/*
// routes instead.
//
// The real engine behind Admin → Cache → Fragment Cache. An in-process
// TTL + LRU key/value store used to memoize the output of expensive page
// sections (trending games, related games, nav menu, …) across requests
// within one running server instance — see games-server.ts,
// homepage-layout-server.ts, src/app/page.tsx, src/app/game/[slug]/page.tsx,
// and the /api/fragments/** routes for the call sites that actually use
// this.
//
// Deliberately in-process rather than Redis-backed (contrast with Object
// Cache, 0036): this app doesn't otherwise require an external cache
// dependency, and a fragment miss just recomputes from Supabase — same
// cost as before this feature existed, not a correctness problem. The
// one real limitation worth knowing: on a multi-instance deployment
// (multiple Node processes/regions), each instance has its own store, so
// a purge only clears the instance that handled the purge request, and
// the same fragment may briefly show different cached ages across
// instances. Acceptable for this app's traffic profile; if that ever
// changes, swap the Map below for the Redis client in
// object-cache-client.ts and key on the same fragment/variant scheme.
//
// Survives Next.js dev-mode hot module reloads via a globalThis
// singleton (otherwise every edit-save would silently reset the store
// and stats, making the admin dashboard look broken in dev).

interface FragmentEntry {
  value: unknown;
  createdAt: number;
  expiresAt: number;
  staleUntil: number;
  approxBytes: number;
}

interface FragmentTypeStats {
  hits: number;
  staleHits: number;
  misses: number;
  sets: number;
  bypassed: number;
  evictions: number;
  errors: number;
}

interface FragmentCacheGlobals {
  store: Map<string, FragmentEntry>;
  revalidating: Set<string>;
  stats: Map<string, FragmentTypeStats>;
  settingsCache: { settings: FragmentCacheSettings; loadedAt: number } | null;
}

const SETTINGS_CACHE_MS = 5000;

const globalForFragmentCache = globalThis as unknown as { __fragmentCache?: FragmentCacheGlobals };

function store(): FragmentCacheGlobals {
  if (!globalForFragmentCache.__fragmentCache) {
    globalForFragmentCache.__fragmentCache = {
      store: new Map(),
      revalidating: new Set(),
      stats: new Map(),
      settingsCache: null,
    };
  }
  return globalForFragmentCache.__fragmentCache;
}

function statsFor(fragmentKey: string): FragmentTypeStats {
  const g = store();
  let s = g.stats.get(fragmentKey);
  if (!s) {
    s = { hits: 0, staleHits: 0, misses: 0, sets: 0, bypassed: 0, evictions: 0, errors: 0 };
    g.stats.set(fragmentKey, s);
  }
  return s;
}

function cacheKeyFor(fragmentKey: string, variant?: string): string {
  return variant ? `${fragmentKey}::${variant}` : fragmentKey;
}

function fragmentKeyFromCacheKey(cacheKey: string): string {
  const i = cacheKey.indexOf("::");
  return i === -1 ? cacheKey : cacheKey.slice(0, i);
}

function approxSize(value: unknown): number {
  try {
    const plain =
      value instanceof Map
        ? Array.from(value.entries())
        : value instanceof Set
          ? Array.from(value.values())
          : value;
    return JSON.stringify(plain)?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Evicts the least-recently-used entry (Map iteration order tracks
 * insertion order; get()/set() below both re-insert on access, so the
 * first key is always the coldest) until the store is back under the
 * configured cap. */
function enforceCap(maxEntries: number) {
  const g = store();
  while (g.store.size > maxEntries) {
    const oldestKey = g.store.keys().next().value;
    if (oldestKey === undefined) break;
    g.store.delete(oldestKey);
    statsFor(fragmentKeyFromCacheKey(oldestKey)).evictions++;
  }
}

async function loadSettings(): Promise<FragmentCacheSettings> {
  const g = store();
  const now = Date.now();
  if (g.settingsCache && now - g.settingsCache.loadedAt < SETTINGS_CACHE_MS) {
    return g.settingsCache.settings;
  }
  const settings = await getFragmentCacheSettingsServer();
  g.settingsCache = { settings, loadedAt: now };
  return settings;
}

export interface GetOrSetFragmentOptions {
  /** Skip the cache entirely for this call (e.g. an admin previewing
   * draft content) without affecting other requests' entries. Recorded
   * in stats as "bypassed", not as a miss. */
  bypass?: boolean;
}

/** The core primitive. `fragmentKey` must match one of the keys in
 * fragment_cache_settings.fragments (see fragment-cache-settings.ts's
 * DEFAULT_FRAGMENTS) — an unknown key is treated as always-enabled at
 * the table's defaultTtlSeconds, which is a safe fallback but won't show
 * up in the admin's per-fragment rows, so keep new call sites' keys in
 * sync with the catalogue. `variant` distinguishes multiple entries
 * under one fragment type (e.g. related-games per category slug). */
export async function getOrSetFragment<T>(
  fragmentKey: string,
  variant: string | undefined,
  compute: () => Promise<T>,
  options: GetOrSetFragmentOptions = {}
): Promise<T> {
  const settings = await loadSettings();
  const def = settings.fragments.find((f) => f.key === fragmentKey);
  const fragmentEnabled = def ? def.enabled : true;
  const ttlSeconds = def ? def.ttlSeconds : settings.defaultTtlSeconds;

  if (options.bypass || !settings.enabled || !fragmentEnabled) {
    statsFor(fragmentKey).bypassed++;
    return compute();
  }

  const g = store();
  const cacheKey = cacheKeyFor(fragmentKey, variant);
  const now = Date.now();
  const existing = g.store.get(cacheKey);

  if (existing && now < existing.expiresAt) {
    // Fresh hit — bump recency for the LRU eviction order.
    g.store.delete(cacheKey);
    g.store.set(cacheKey, existing);
    statsFor(fragmentKey).hits++;
    return existing.value as T;
  }

  if (existing && now < existing.staleUntil) {
    // Stale-while-revalidate window: serve the stale value immediately,
    // refresh in the background at most once per key.
    statsFor(fragmentKey).staleHits++;
    if (!g.revalidating.has(cacheKey)) {
      g.revalidating.add(cacheKey);
      compute()
        .then((fresh) => {
          const ttlMs = ttlSeconds * 1000;
          g.store.delete(cacheKey);
          g.store.set(cacheKey, {
            value: fresh,
            createdAt: Date.now(),
            expiresAt: Date.now() + ttlMs,
            staleUntil: Date.now() + ttlMs + settings.staleWhileRevalidateSeconds * 1000,
            approxBytes: approxSize(fresh),
          });
          statsFor(fragmentKey).sets++;
          enforceCap(settings.maxEntries);
        })
        .catch(() => {
          statsFor(fragmentKey).errors++;
        })
        .finally(() => {
          g.revalidating.delete(cacheKey);
        });
    }
    return existing.value as T;
  }

  // True miss (or expired past the stale window) — compute inline.
  statsFor(fragmentKey).misses++;
  try {
    const fresh = await compute();
    const ttlMs = ttlSeconds * 1000;
    g.store.delete(cacheKey);
    g.store.set(cacheKey, {
      value: fresh,
      createdAt: now,
      expiresAt: now + ttlMs,
      staleUntil: now + ttlMs + settings.staleWhileRevalidateSeconds * 1000,
      approxBytes: approxSize(fresh),
    });
    statsFor(fragmentKey).sets++;
    enforceCap(settings.maxEntries);
    return fresh;
  } catch (err) {
    // Next.js's own build-time "can this route be static?" probe signals
    // its answer by throwing a special digest-tagged error (e.g.
    // DYNAMIC_SERVER_USAGE when compute() touches cookies() — see
    // isNextControlFlowError's docs in supabase/timeout-fetch.ts). That
    // must reach Next unmodified, not be treated as a real compute
    // failure and papered over with a stale value — otherwise a route
    // that legitimately needs per-request rendering could get
    // incorrectly marked static during the very first build after a
    // stale fragment happens to already be sitting in this slot.
    if (isNextControlFlowError(err)) throw err;

    statsFor(fragmentKey).errors++;
    // Resilience fallback: if anything is sitting in the slot at all —
    // even past its stale window — serving it beats a broken page.
    if (existing) return existing.value as T;
    throw err;
  }
}

/** Admin → Cache → Fragment Cache → "Purge" on a single fragment row.
 * Removes every variant of that fragment type. Returns the number of
 * entries actually removed. */
export function purgeFragment(fragmentKey: string): number {
  const g = store();
  let removed = 0;
  for (const key of g.store.keys()) {
    if (fragmentKeyFromCacheKey(key) === fragmentKey) {
      g.store.delete(key);
      removed++;
    }
  }
  return removed;
}

/** Admin → Cache → Fragment Cache → "Purge all". */
export function purgeAllFragments(): number {
  const g = store();
  const removed = g.store.size;
  g.store.clear();
  g.revalidating.clear();
  return removed;
}

/** Invalidates the in-memory settings cache immediately after a save, so
 * the very next fragment read picks up new TTLs/enabled flags instead of
 * waiting out SETTINGS_CACHE_MS. Call from the settings PUT route. */
export function invalidateFragmentSettingsCache(): void {
  store().settingsCache = null;
}

export interface FragmentStatsRow extends FragmentTypeStats {
  key: string;
  entries: number;
  approxBytes: number;
  hitRate: number | null;
}

export interface FragmentCacheStats {
  totalEntries: number;
  maxEntries: number;
  totalApproxBytes: number;
  fragments: FragmentStatsRow[];
}

/** Admin → Cache → Fragment Cache dashboard — live, in-process numbers,
 * no database round trip. */
export async function getFragmentCacheStats(): Promise<FragmentCacheStats> {
  const settings = await loadSettings();
  const g = store();

  const entryCounts = new Map<string, { count: number; bytes: number }>();
  for (const [cacheKey, entry] of g.store.entries()) {
    const fk = fragmentKeyFromCacheKey(cacheKey);
    const agg = entryCounts.get(fk) ?? { count: 0, bytes: 0 };
    agg.count++;
    agg.bytes += entry.approxBytes;
    entryCounts.set(fk, agg);
  }

  const fragments: FragmentStatsRow[] = settings.fragments.map((def) => {
    const s = statsFor(def.key);
    const agg = entryCounts.get(def.key) ?? { count: 0, bytes: 0 };
    const totalLookups = s.hits + s.staleHits + s.misses;
    return {
      key: def.key,
      entries: agg.count,
      approxBytes: agg.bytes,
      hitRate: totalLookups > 0 ? (s.hits + s.staleHits) / totalLookups : null,
      ...s,
    };
  });

  return {
    totalEntries: g.store.size,
    maxEntries: settings.maxEntries,
    totalApproxBytes: fragments.reduce((sum, f) => sum + f.approxBytes, 0),
    fragments,
  };
}
