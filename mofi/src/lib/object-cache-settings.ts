// Shared between the admin client (CacheObjectAdminClient) and the API
// routes under src/app/api/admin/cache/object/**: the shape of the
// object_cache_settings row, plus a pure mapper. Mirrors the
// full-page-cache-settings.ts pattern.
//
// Sensitive note: redis_password and memcached_password are stored in the
// table but are used only by this app's own test-connection / invalidate
// actions — they never leave this app via an external (non-Redis/
// Memcached-protocol) API call. The mapper does NOT strip them; route
// handlers redact each to a boolean + preview before the row reaches the
// browser, matching the CDN token / Varnish purge key approach.

export type ObjectCacheProvider = "none" | "redis" | "memcached" | "wordpress_object_cache";

export interface CacheGroup {
  name: string;
  /** 0 = no expiry for this group. */
  ttlSeconds: number;
  /** false = never written to the external store, even when the cache as
   * a whole is persistent (WordPress calls this a "non-persistent group"). */
  persistent: boolean;
  /** true = shared across the whole deployment rather than namespaced
   * under this app's key_prefix scope. */
  global: boolean;
}

export type ObjectCacheTestStatus = "success" | "failed";

export interface ObjectCacheSettings {
  provider: ObjectCacheProvider;

  // Shared behaviour
  persistentEnabled: boolean;
  defaultTtlSeconds: number;
  keyPrefix: string;
  cacheGroups: CacheGroup[];

  // Redis
  redisHost: string;
  redisPort: number;
  redisDatabase: number;
  redisTlsEnabled: boolean;
  redisUsername: string;
  /** Whether a password is stored. Never sent to the browser — only this
   * flag + a short preview. */
  redisPasswordSet: boolean;
  redisPasswordPreview: string | null;
  redisConnectTimeoutMs: number;

  // Memcached
  memcachedServers: string[];
  memcachedBinaryProtocol: boolean;
  memcachedCompressionEnabled: boolean;
  memcachedCompressionThresholdBytes: number;
  memcachedUsername: string;
  memcachedPasswordSet: boolean;
  memcachedPasswordPreview: string | null;

  // WordPress Object Cache (documentation only)
  wpDropInInstalled: boolean;
  wpCacheKeySalt: string;

  // Diagnostics
  lastTestedAt: string | null;
  lastTestStatus: ObjectCacheTestStatus | null;
  lastTestMessage: string | null;
  lastInvalidatedAt: string | null;
  lastInvalidationSummary: Record<string, unknown> | null;

  updatedAt: string;
}

const PROVIDERS: ObjectCacheProvider[] = ["none", "redis", "memcached", "wordpress_object_cache"];
const TEST_STATUSES: ObjectCacheTestStatus[] = ["success", "failed"];

const DEFAULT_CACHE_GROUPS: CacheGroup[] = [
  { name: "posts", ttlSeconds: 3600, persistent: true, global: false },
  { name: "users", ttlSeconds: 21600, persistent: true, global: true },
  { name: "transient", ttlSeconds: 300, persistent: false, global: false },
];

export const DEFAULT_OBJECT_CACHE_SETTINGS: ObjectCacheSettings = {
  provider: "none",

  persistentEnabled: false,
  defaultTtlSeconds: 3600,
  keyPrefix: "pb_",
  cacheGroups: DEFAULT_CACHE_GROUPS,

  redisHost: "127.0.0.1",
  redisPort: 6379,
  redisDatabase: 0,
  redisTlsEnabled: false,
  redisUsername: "",
  redisPasswordSet: false,
  redisPasswordPreview: null,
  redisConnectTimeoutMs: 2000,

  memcachedServers: ["127.0.0.1:11211"],
  memcachedBinaryProtocol: false,
  memcachedCompressionEnabled: false,
  memcachedCompressionThresholdBytes: 2048,
  memcachedUsername: "",
  memcachedPasswordSet: false,
  memcachedPasswordPreview: null,

  wpDropInInstalled: false,
  wpCacheKeySalt: "",

  lastTestedAt: null,
  lastTestStatus: null,
  lastTestMessage: null,
  lastInvalidatedAt: null,
  lastInvalidationSummary: null,

  updatedAt: new Date(0).toISOString(),
};

/** Redact a stored secret the same way redactPurgeKey (full-page) /
 * redactApiToken (CDN) do — only a boolean + last-4-chars preview goes to
 * the browser. Shared by both the Redis and Memcached passwords. */
export function redactSecret(value: string | null | undefined): { set: boolean; preview: string | null } {
  if (!value) return { set: false, preview: null };
  return { set: true, preview: value.length > 4 ? `…${value.slice(-4)}` : "…" };
}

function parseCacheGroups(raw: unknown): CacheGroup[] {
  if (!Array.isArray(raw)) return DEFAULT_CACHE_GROUPS;
  const groups = raw
    .map((g): CacheGroup | null => {
      if (!g || typeof g !== "object") return null;
      const rec = g as Record<string, unknown>;
      const name = String(rec.name ?? "").trim();
      if (!name) return null;
      return {
        name,
        ttlSeconds: Number.isFinite(Number(rec.ttlSeconds)) ? Number(rec.ttlSeconds) : 0,
        persistent: Boolean(rec.persistent ?? true),
        global: Boolean(rec.global ?? false),
      };
    })
    .filter((g): g is CacheGroup => g !== null);
  return groups;
}

/** Maps the snake_case DB row to the camelCase ObjectCacheSettings shape.
 * Called by route handlers AFTER stripping the raw redis_password /
 * memcached_password — the row passed in here must already have them
 * replaced with the redacted *_set / *_preview fields. */
export function mapObjectCacheSettingsRow(row: Record<string, unknown> | null): ObjectCacheSettings {
  if (!row) return DEFAULT_OBJECT_CACHE_SETTINGS;

  const provider = String(row.provider ?? "none");
  const testStatus = String(row.last_test_status ?? "");

  return {
    provider: PROVIDERS.includes(provider as ObjectCacheProvider)
      ? (provider as ObjectCacheProvider)
      : "none",

    persistentEnabled: Boolean(row.persistent_enabled ?? false),
    defaultTtlSeconds: Number(row.default_ttl_seconds ?? 3600),
    keyPrefix: String(row.key_prefix ?? "pb_"),
    cacheGroups: parseCacheGroups(row.cache_groups),

    redisHost: String(row.redis_host ?? "127.0.0.1"),
    redisPort: Number(row.redis_port ?? 6379),
    redisDatabase: Number(row.redis_database ?? 0),
    redisTlsEnabled: Boolean(row.redis_tls_enabled ?? false),
    redisUsername: String(row.redis_username ?? ""),
    redisPasswordSet: Boolean(row.redis_password_set ?? false),
    redisPasswordPreview: row.redis_password_preview ? String(row.redis_password_preview) : null,
    redisConnectTimeoutMs: Number(row.redis_connect_timeout_ms ?? 2000),

    memcachedServers: Array.isArray(row.memcached_servers)
      ? row.memcached_servers.map(String)
      : DEFAULT_OBJECT_CACHE_SETTINGS.memcachedServers,
    memcachedBinaryProtocol: Boolean(row.memcached_binary_protocol ?? false),
    memcachedCompressionEnabled: Boolean(row.memcached_compression_enabled ?? false),
    memcachedCompressionThresholdBytes: Number(row.memcached_compression_threshold_bytes ?? 2048),
    memcachedUsername: String(row.memcached_username ?? ""),
    memcachedPasswordSet: Boolean(row.memcached_password_set ?? false),
    memcachedPasswordPreview: row.memcached_password_preview ? String(row.memcached_password_preview) : null,

    wpDropInInstalled: Boolean(row.wp_drop_in_installed ?? false),
    wpCacheKeySalt: String(row.wp_cache_key_salt ?? ""),

    lastTestedAt: row.last_tested_at ? String(row.last_tested_at) : null,
    lastTestStatus: TEST_STATUSES.includes(testStatus as ObjectCacheTestStatus)
      ? (testStatus as ObjectCacheTestStatus)
      : null,
    lastTestMessage: row.last_test_message ? String(row.last_test_message) : null,
    lastInvalidatedAt: row.last_invalidated_at ? String(row.last_invalidated_at) : null,
    lastInvalidationSummary: (row.last_invalidation_summary as Record<string, unknown> | null) ?? null,

    updatedAt: String(row.updated_at ?? DEFAULT_OBJECT_CACHE_SETTINGS.updatedAt),
  };
}

// ── Config generators ───────────────────────────────────────────────────────

/** Generates a docker-compose service + wp-config.php constants for a
 * Redis-backed persistent object cache. */
export function generateRedisConfig(s: ObjectCacheSettings): string {
  const groupLines = s.cacheGroups
    .map(
      (g) =>
        `#   ${g.name.padEnd(16)} ttl=${g.ttlSeconds === 0 ? "no-expiry" : `${g.ttlSeconds}s`}  persistent=${g.persistent}  global=${g.global}`
    )
    .join("\n");

  return `# ── docker-compose.yml service (or your own Redis server) ─────────────
services:
  redis:
    image: redis:7-alpine
    ports:
      - "${s.redisPort}:6379"
    command: redis-server${s.redisPasswordSet ? " --requirepass <your-redis-password>" : ""}
    volumes:
      - redis-data:/data

# ── Connection (used by this app's test-connection / invalidate actions) ──
Host:               ${s.redisHost}
Port:               ${s.redisPort}
Database:           ${s.redisDatabase}
TLS:                ${s.redisTlsEnabled ? "enabled" : "disabled"}
Connect timeout:    ${s.redisConnectTimeoutMs}ms
Key prefix:         ${s.keyPrefix}

# ── wp-config.php constants (hybrid / WordPress-origin deployments) ───────
define('WP_CACHE', true);
define('WP_REDIS_HOST', '${s.redisHost}');
define('WP_REDIS_PORT', ${s.redisPort});
define('WP_REDIS_DATABASE', ${s.redisDatabase});
${s.redisUsername ? `define('WP_REDIS_USERNAME', '${s.redisUsername}');\n` : ""}${s.redisPasswordSet ? "define('WP_REDIS_PASSWORD', '<your-redis-password>');\n" : ""}define('WP_REDIS_TIMEOUT', ${(s.redisConnectTimeoutMs / 1000).toFixed(1)});
define('WP_CACHE_KEY_SALT', '${s.wpCacheKeySalt || s.keyPrefix}');
# Requires the object-cache.php drop-in in wp-content/ (e.g. from the
# "Redis Object Cache" plugin) — copying wp-config.php constants alone
# does nothing without it.

# ── Cache groups ────────────────────────────────────────────────────────
${groupLines || "#   (none configured)"}

# ── Selective invalidation ──────────────────────────────────────────────
# Implemented via SCAN ${s.keyPrefix}<group>:* followed by DEL on the matches —
# safe on a shared Redis instance because it never touches keys outside
# this prefix, unlike FLUSHDB/FLUSHALL.`;
}

/** Generates a memcached daemon command + wp-config.php constants. */
export function generateMemcachedConfig(s: ObjectCacheSettings): string {
  const groupLines = s.cacheGroups
    .map(
      (g) =>
        `#   ${g.name.padEnd(16)} ttl=${g.ttlSeconds === 0 ? "no-expiry" : `${g.ttlSeconds}s`}  persistent=${g.persistent}  global=${g.global}`
    )
    .join("\n");

  return `# ── Memcached daemon ────────────────────────────────────────────────────
memcached -m 256 -p 11211 -u memcached${s.memcachedBinaryProtocol ? " -B binary" : ""}

# ── Servers (used by this app's test-connection / invalidate actions) ────
${s.memcachedServers.map((srv) => `#   ${srv}`).join("\n")}
Binary protocol:     ${s.memcachedBinaryProtocol ? "enabled" : "disabled"}
Compression:         ${s.memcachedCompressionEnabled ? `enabled, threshold ${s.memcachedCompressionThresholdBytes} bytes` : "disabled"}
Key prefix:          ${s.keyPrefix}
${s.memcachedUsername ? `SASL username:       ${s.memcachedUsername}\n` : ""}
# ── wp-config.php constants (hybrid / WordPress-origin deployments) ───────
define('WP_CACHE', true);
define('WP_CACHE_KEY_SALT', '${s.wpCacheKeySalt || s.keyPrefix}');
# $memcached_servers in wp-config.php or object-cache.php:
$memcached_servers = array(
${s.memcachedServers.map((srv) => `    '${srv}',`).join("\n")}
);
# Requires the object-cache.php drop-in in wp-content/ (e.g. from the
# "Memcached Object Cache" plugin).

# ── Cache groups ────────────────────────────────────────────────────────
${groupLines || "#   (none configured)"}

# ── Selective invalidation limitation ───────────────────────────────────
# The memcached protocol has no key-enumeration command (no SCAN/KEYS
# equivalent), so invalidating "by group" or "by pattern" isn't possible
# without this app tracking every key it writes. Selective invalidation
# against a memcached backend falls back to a full flush_all here — plan
# key naming (e.g. include a version number in the prefix and bump it)
# if you need group-level eviction without a full flush.`;
}

/** Generates a WordPress object-cache.php drop-in + wp-config.php info
 * block. Documentation only — this app is not WordPress. Mirrors
 * generateCloudflareApoConfig in full-page-cache-settings.ts. */
export function generateWordPressObjectCacheConfig(s: ObjectCacheSettings): string {
  return `# WordPress Object Cache — persistent object caching for WordPress
# ──────────────────────────────────────────────────────────────────
# This Next.js app is not WordPress. These settings are stored here as
# documentation for hybrid deployments (e.g. a WordPress install sharing
# infrastructure with this app) or for planning a future migration.
#
# 1. Install a drop-in at wp-content/object-cache.php — typically via a
#    plugin such as "Redis Object Cache" or "Memcached Object Cache",
#    which writes the file for you. WordPress detects and loads it
#    automatically; there is no dashboard toggle for the drop-in itself.
#
# 2. Add to wp-config.php:
define('WP_CACHE', true);
define('WP_CACHE_KEY_SALT', '${s.wpCacheKeySalt || s.keyPrefix}');
#
# 3. Register cache groups (in a must-use plugin or theme functions.php):
${s.cacheGroups
  .map((g) =>
    g.global
      ? `wp_cache_add_global_groups(array('${g.name}'));`
      : g.persistent
        ? `// '${g.name}' is a normal persistent group — no registration needed.`
        : `wp_cache_add_non_persistent_groups(array('${g.name}'));`
  )
  .join("\n")}
#
# Drop-in installed (recorded here for reference): ${s.wpDropInInstalled ? "yes" : "no"}
#
# For this Next.js app itself, an actual object cache backend is chosen
# via the Redis / Memcached provider options on this page — those generate
# real connection settings and support a live test + invalidation action.
# This WordPress option does not.`;
}
