import { promises as dns } from "node:dns";

/**
 * "Resolver Cache" — Admin → Cache → DNS Cache, pillar 4.
 *
 * The other three DNS Cache pillars are either delegated to Cloudflare
 * (dns-cache-settings.ts) or are pure browser/OS behaviour this server
 * can't touch (dns-prefetch-settings.ts, the OS DNS Cache runbook). This
 * one is different: it's a real cache, running in this process, for the
 * DNS lookups *this server itself* makes on its own outbound requests
 * (Supabase, the Cloudflare API, health-checking an embedded game's
 * origin, etc.) — Node's own `dns`/`fetch` stack does not cache A/AAAA
 * records between requests on its own, so every outbound call otherwise
 * re-resolves from scratch.
 *
 * Deliberately a plain in-memory Map, not Postgres/Redis: DNS answers
 * are cheap to re-fetch and instance-local by nature (the whole point of
 * a resolver cache is that it lives close to the thing making the
 * lookup), so there's nothing worth persisting — only configuration
 * (src/lib/dns-cache-settings.ts) is. That does mean this cache is empty
 * again after a redeploy or serverless cold start; same trade-off this
 * app already makes for the fragment cache (fragment-cache.ts) and the
 * object cache client.
 *
 * Honors the real DNS TTL returned by the resolver (via `{ ttl: true }`)
 * rather than inventing one, clamped to the admin-configured
 * min/max — see resolveWithCache below.
 */

interface ResolverCacheEntry {
  address: string;
  family: 4 | 6;
  resolvedAt: number;
  expiresAt: number;
  /** The TTL actually used for this entry, after clamping — shown in
   * the admin UI so "why did this expire so soon/late" is answerable. */
  ttlSeconds: number;
}

export interface ResolverCacheConfig {
  enabled: boolean;
  minTtlSeconds: number;
  maxTtlSeconds: number;
  maxEntries: number;
}

export interface ResolverLookupResult {
  hostname: string;
  address: string | null;
  family: 4 | 6 | null;
  fromCache: boolean;
  ttlSeconds: number | null;
  /** Seconds remaining before this entry expires (cache hits only). */
  ttlRemainingSeconds: number | null;
  durationMs: number;
  error: string | null;
}

export interface ResolverCacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
}

export interface ResolverCacheEntrySnapshot {
  hostname: string;
  address: string;
  family: 4 | 6;
  resolvedAt: string;
  expiresAt: string;
  ttlSeconds: number;
  ttlRemainingSeconds: number;
}

// Module-level singleton — one cache per running server instance, reset
// on redeploy/cold start. Insertion order doubles as a crude LRU: a hit
// re-inserts the entry so it moves to the end, and eviction always takes
// from the front.
const cache = new Map<string, ResolverCacheEntry>();
let hits = 0;
let misses = 0;

function evictOldestIfNeeded(maxEntries: number): void {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

/** Resolves `hostname` to an A (falling back to AAAA) record, serving
 * from the in-memory cache when a fresh entry exists and `enabled` is
 * true. Never throws — resolution failures come back as `{ error }` so
 * callers (the admin "test a hostname" tool, or any future outbound
 * helper) can display them without a try/catch. */
export async function resolveWithCache(hostname: string, config: ResolverCacheConfig): Promise<ResolverLookupResult> {
  const key = hostname.trim().toLowerCase().replace(/\.$/, "");
  const start = performance.now();

  if (config.enabled) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      hits++;
      cache.delete(key);
      cache.set(key, cached); // move to the end (most-recently-used)
      return {
        hostname: key,
        address: cached.address,
        family: cached.family,
        fromCache: true,
        ttlSeconds: cached.ttlSeconds,
        ttlRemainingSeconds: Math.max(0, Math.round((cached.expiresAt - Date.now()) / 1000)),
        durationMs: round2(performance.now() - start),
        error: null,
      };
    }
  }

  misses++;
  try {
    const { address, family, realTtlSeconds } = await lookup(key);
    let ttlSeconds: number | null = null;

    if (config.enabled) {
      ttlSeconds = Math.min(config.maxTtlSeconds, Math.max(config.minTtlSeconds, realTtlSeconds));
      cache.set(key, {
        address,
        family,
        resolvedAt: Date.now(),
        expiresAt: Date.now() + ttlSeconds * 1000,
        ttlSeconds,
      });
      evictOldestIfNeeded(config.maxEntries);
    }

    return {
      hostname: key,
      address,
      family,
      fromCache: false,
      ttlSeconds,
      ttlRemainingSeconds: ttlSeconds,
      durationMs: round2(performance.now() - start),
      error: null,
    };
  } catch (err) {
    return {
      hostname: key,
      address: null,
      family: null,
      fromCache: false,
      ttlSeconds: null,
      ttlRemainingSeconds: null,
      durationMs: round2(performance.now() - start),
      error: err instanceof Error ? err.message : "DNS resolution failed.",
    };
  }
}

async function lookup(hostname: string): Promise<{ address: string; family: 4 | 6; realTtlSeconds: number }> {
  try {
    const records = await dns.resolve4(hostname, { ttl: true });
    if (records.length > 0) {
      return { address: records[0].address, family: 4, realTtlSeconds: records[0].ttl || 60 };
    }
  } catch {
    // fall through to AAAA
  }

  const records6 = await dns.resolve6(hostname, { ttl: true });
  if (records6.length === 0) throw new Error(`No A or AAAA records found for "${hostname}".`);
  return { address: records6[0].address, family: 6, realTtlSeconds: records6[0].ttl || 60 };
}

function round2(ms: number): number {
  return Math.round(ms * 100) / 100;
}

/** Drops every cached entry. Configuration (TTL clamps, enabled flag) is
 * untouched — this only clears the resolved addresses. */
export function clearResolverCache(): number {
  const count = cache.size;
  cache.clear();
  return count;
}

export function getResolverCacheStats(): ResolverCacheStats {
  pruneExpired();
  const total = hits + misses;
  return { size: cache.size, hits, misses, hitRate: total > 0 ? round2(hits / total) : 0 };
}

/** Snapshot of every live entry, most-recently-used first — for the
 * admin UI's "what's currently cached" table. */
export function getResolverCacheEntries(): ResolverCacheEntrySnapshot[] {
  pruneExpired();
  const now = Date.now();
  return Array.from(cache.entries())
    .reverse()
    .map(([hostname, entry]) => ({
      hostname,
      address: entry.address,
      family: entry.family,
      resolvedAt: new Date(entry.resolvedAt).toISOString(),
      expiresAt: new Date(entry.expiresAt).toISOString(),
      ttlSeconds: entry.ttlSeconds,
      ttlRemainingSeconds: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
    }));
}
