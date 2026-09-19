import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import {
  connectRedis,
  authAndSelect,
  withTimeout,
  isRespError,
  type RedisConnection,
  type RedisConnOpts,
} from "@/lib/redis-protocol";
import {
  mapMonitoringCacheRow,
  type CacheStorageStats,
  type CacheHealthStatus,
} from "@/lib/monitoring-cache-settings";

const CONNECT_TIMEOUT_MS = 5000;

// ── INFO response parser ──────────────────────────────────────────────────────
// Redis INFO returns a bulk string: "# Section\r\nkey:value\r\nkey:value\r\n…"
// Parse it into a flat string→string map; callers coerce types as needed.

function parseRedisInfo(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of raw.split("\r\n")) {
    const colon = line.indexOf(":");
    if (colon === -1 || line.startsWith("#")) continue;
    map.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return map;
}

/** Count total keys across all db* entries in the Keyspace section.
 * Each entry looks like: db0:keys=123,expires=45,avg_ttl=60000 */
function countTotalKeys(info: Map<string, string>): number {
  let total = 0;
  for (const [key, value] of info.entries()) {
    if (/^db\d+$/.test(key)) {
      const match = value.match(/keys=(\d+)/);
      if (match) total += Number(match[1]);
    }
  }
  return total;
}

// ── Redis connection opts ─────────────────────────────────────────────────────

interface ObjectCacheRow {
  redis_tls_enabled: boolean;
  redis_username: string | null;
  redis_password: string | null;
  redis_connect_timeout_ms: number;
}

interface MonitoringRow {
  cache_type: string;
  redis_host: string;
  redis_port: number;
  redis_db: number;
  max_storage_mb: number;
}

/** GET /api/admin/cache/monitoring/stats
 * Admin-only. Returns a real-time storage snapshot for the configured
 * cache backend. Fails soft — returns status "unknown" / "offline" rather
 * than a 500 so the UI can display a degraded tile instead of an error
 * page. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  // Load monitoring settings — cache type + Redis connection hints.
  const { data: monRow } = await supabase
    .from("cache_monitoring_settings")
    .select("cache_type, redis_host, redis_port, redis_db, max_storage_mb")
    .eq("id", true)
    .maybeSingle();

  const settings = mapMonitoringCacheRow(monRow ?? null);
  const mon = monRow as MonitoringRow | null;
  const now = new Date().toISOString();

  const maxBytesFromConfig =
    settings.maxStorageMb > 0 ? settings.maxStorageMb * 1024 * 1024 : 0;

  // ── Redis backend ─────────────────────────────────────────────────────────
  if (settings.cacheType === "redis") {
    // Pull credentials from object_cache_settings (passwords/TLS live there).
    const { data: objRow } = await supabase
      .from("object_cache_settings")
      .select(
        "redis_tls_enabled, redis_username, redis_password, redis_connect_timeout_ms",
      )
      .eq("id", true)
      .maybeSingle();

    const obj = objRow as ObjectCacheRow | null;

    const opts: RedisConnOpts = {
      host: mon?.redis_host ?? "127.0.0.1",
      port: mon?.redis_port ?? 6379,
      database: mon?.redis_db ?? 0,
      tls: obj?.redis_tls_enabled ?? false,
      username: obj?.redis_username ?? undefined,
      password: obj?.redis_password ?? null,
      connectTimeoutMs: obj?.redis_connect_timeout_ms ?? CONNECT_TIMEOUT_MS,
    };

    let conn: RedisConnection | null = null;
    try {
      conn = await connectRedis(opts.host, opts.port, opts.tls, opts.connectTimeoutMs);
      await authAndSelect(conn, opts);

      // INFO all returns everything in one bulk string — one round-trip.
      const infoReply = await withTimeout(
        conn.command(["INFO", "all"]),
        opts.connectTimeoutMs,
        "INFO",
      );

      if (isRespError(infoReply)) throw new Error(infoReply.error);
      if (typeof infoReply !== "string") throw new Error("Unexpected INFO reply type.");

      const info = parseRedisInfo(infoReply);

      const usedBytes = Number(info.get("used_memory") ?? 0);
      // maxmemory=0 means no limit set in Redis itself.
      const redisMaxBytes = Number(info.get("maxmemory") ?? 0);
      const maxBytes = redisMaxBytes > 0 ? redisMaxBytes : maxBytesFromConfig;
      const entryCount = countTotalKeys(info);

      const hits = Number(info.get("keyspace_hits") ?? 0);
      const misses = Number(info.get("keyspace_misses") ?? 0);
      const hitRate =
        hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : null;

      // evicted_keys is a count, not bytes — report it as-is.
      const evictedKeys = Number(info.get("evicted_keys") ?? 0);

      const status: CacheHealthStatus =
        usedBytes > 0 || entryCount > 0 ? "healthy" : "unknown";

      const stats: CacheStorageStats = {
        cacheType: "redis",
        status,
        usedBytes,
        maxBytes,
        entryCount,
        hitRate,
        evictedBytes: evictedKeys, // repurposed: evicted key count
        snapshotAt: now,
        layers: {},
      };

      return NextResponse.json({ stats });
    } catch (err) {
      // Redis unreachable — return a degraded status rather than a 500.
      const status: CacheHealthStatus =
        err instanceof Error && err.message.includes("timed out")
          ? "offline"
          : "degraded";

      const stats: CacheStorageStats = {
        cacheType: "redis",
        status,
        usedBytes: 0,
        maxBytes: maxBytesFromConfig,
        entryCount: 0,
        hitRate: null,
        evictedBytes: null,
        snapshotAt: now,
        layers: {},
      };
      return NextResponse.json({ stats });
    } finally {
      conn?.close();
    }
  }

  // ── File cache backend ────────────────────────────────────────────────────
  if (settings.cacheType === "file") {
    try {
      const { statSync, readdirSync } = await import("fs");
      const { resolve } = await import("path");
      const cacheDir = process.env.FILE_CACHE_DIR ?? "/tmp/mofigames-cache";
      const resolvedRoot = resolve(cacheDir);
      let usedBytes = 0;
      let entryCount = 0;

      function walk(dir: string) {
        // Ensure every recursion step stays inside the cache root.
        const resolvedDir = resolve(dir);
        if (!resolvedDir.startsWith(resolvedRoot)) return;
        try {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = resolve(dir, entry.name);
            // Containment check before descending or stat-ing.
            if (!full.startsWith(resolvedRoot)) continue;
            if (entry.isDirectory()) {
              walk(full);
            } else {
              usedBytes += statSync(full).size;
              entryCount++;
            }
          }
        } catch {
          // Directory doesn't exist or is unreadable — treat as empty.
        }
      }

      walk(cacheDir);

      const stats: CacheStorageStats = {
        cacheType: "file",
        status: entryCount > 0 ? "healthy" : "unknown",
        usedBytes,
        maxBytes: maxBytesFromConfig,
        entryCount,
        hitRate: null,
        evictedBytes: null,
        snapshotAt: now,
        layers: {},
      };

      return NextResponse.json({ stats });
    } catch {
      const stats: CacheStorageStats = {
        cacheType: "file",
        status: "offline",
        usedBytes: 0,
        maxBytes: maxBytesFromConfig,
        entryCount: 0,
        hitRate: null,
        evictedBytes: null,
        snapshotAt: now,
        layers: {},
      };
      return NextResponse.json({ stats });
    }
  }

  // ── Memcached / unknown ───────────────────────────────────────────────────
  // Memcached's text-protocol stats command requires a TCP client not
  // bundled in this project — return a known-unknown rather than 500.
  const stats: CacheStorageStats = {
    cacheType: settings.cacheType,
    status: "unknown",
    usedBytes: 0,
    maxBytes: maxBytesFromConfig,
    entryCount: 0,
    hitRate: null,
    evictedBytes: null,
    snapshotAt: now,
    layers: {},
  };
  return NextResponse.json({ stats });
}
