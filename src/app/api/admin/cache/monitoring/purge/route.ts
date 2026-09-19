import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import {
  cachePurgeInputSchema,
  firstIssueMessage,
  type CachePurgeInput,
} from "@/lib/validation-monitoring-cache";
import {
  connectRedis,
  authAndSelect,
  withTimeout,
  isRespError,
  type RedisConnection,
  type RedisConnOpts,
} from "@/lib/redis-protocol";
import type { CacheLayerKey } from "@/lib/monitoring-cache-settings";

const ALL_LAYERS: CacheLayerKey[] = [
  "page",
  "api",
  "object",
  "fragment",
  "image",
  "static",
  "session",
  "dns",
  "search",
  "feed",
];

const CONNECT_TIMEOUT_MS = 5000;

/** SCAN + DEL every key matching `mofigames:<layer>:*` for each requested
 * layer. Opens one connection, runs all patterns in sequence, closes cleanly.
 * Mirrors the SCAN loop in object-cache-client.ts#invalidateRedis. */
async function purgeRedisLayers(
  opts: RedisConnOpts,
  layers: CacheLayerKey[],
): Promise<{ purgeCount: number; purgeSizeBytes: number; message: string | null }> {
  let conn: RedisConnection | null = null;
  let totalDeleted = 0;
  const errors: string[] = [];

  try {
    conn = await connectRedis(opts.host, opts.port, opts.tls, opts.connectTimeoutMs);
    await authAndSelect(conn, opts);

    for (const layer of layers) {
      const pattern = `mofigames:${layer}:*`;
      try {
        let cursor = "0";
        do {
          const reply = await withTimeout(
            conn.command(["SCAN", cursor, "MATCH", pattern, "COUNT", "500"]),
            opts.connectTimeoutMs,
            `SCAN ${pattern}`,
          );
          if (isRespError(reply)) throw new Error(reply.error);
          if (!Array.isArray(reply) || reply.length !== 2 || !Array.isArray(reply[1])) {
            throw new Error("Unexpected SCAN reply shape.");
          }
          cursor = String(reply[0]);
          const keys = (reply[1] as unknown[]).map((k) => String(k));
          if (keys.length > 0) {
            const delReply = await withTimeout(
              conn.command(["DEL", ...keys]),
              opts.connectTimeoutMs,
              "DEL",
            );
            if (!isRespError(delReply)) totalDeleted += Number(delReply) || 0;
          }
        } while (cursor !== "0");
      } catch (err) {
        errors.push(
          `${layer}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } finally {
    conn?.close();
  }

  return {
    purgeCount: totalDeleted,
    purgeSizeBytes: 0, // Redis doesn't expose per-key byte sizes cheaply
    message: errors.length > 0 ? errors.join("; ") : null,
  };
}

/** Flush all keys in the file-cache directory for the given layers. */
async function purgeFileCache(layers: CacheLayerKey[]): Promise<{
  purgeCount: number;
  purgeSizeBytes: number;
  message: string | null;
}> {
  const { rmSync, readdirSync, statSync } = await import("fs");
  const { resolve } = await import("path");
  const cacheDir = process.env.FILE_CACHE_DIR ?? "/tmp/mofigames-cache";
  const resolvedCacheDir = resolve(cacheDir);
  let purgeCount = 0;
  let purgeSizeBytes = 0;

  for (const layer of layers) {
    // Even though `layer` is constrained to a Zod enum of safe values, resolve
    // the final path and confirm it sits inside cacheDir before touching the
    // filesystem.  Defense-in-depth: if the enum ever changes or a refactor
    // introduces a different entry point, this guard catches it.
    const layerDir = resolve(resolvedCacheDir, layer);
    if (!layerDir.startsWith(resolvedCacheDir + "/") && layerDir !== resolvedCacheDir) {
      continue; // path escaped the cache root — skip silently
    }
    try {
      const entries = readdirSync(layerDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = resolve(layerDir, entry.name);
        // Second containment check — entry.name shouldn't escape layerDir either.
        if (!fullPath.startsWith(layerDir + "/") && fullPath !== layerDir) continue;
        try {
          purgeSizeBytes += statSync(fullPath).size;
          rmSync(fullPath, { recursive: true, force: true });
          purgeCount++;
        } catch {
          // Skip files we can't stat or delete.
        }
      }
    } catch {
      // Directory doesn't exist — nothing to purge for this layer.
    }
  }

  return { purgeCount, purgeSizeBytes, message: null };
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface MonitoringSettingsRow {
  cache_type: string;
  redis_host: string;
  redis_port: number;
  redis_db: number;
}

/** Pull full Redis credentials from object_cache_settings (where passwords
 * and TLS flags live) and merge with the host/port/db from
 * cache_monitoring_settings (which may target a different Redis instance). */
interface ObjectCacheRow {
  redis_tls_enabled: boolean;
  redis_username: string | null;
  redis_password: string | null;
  redis_connect_timeout_ms: number;
}

/** POST /api/admin/cache/monitoring/purge
 * Admin-only. Purges all or selected cache layers and always writes an
 * audit row to cache_purge_logs, even on partial failure. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = cachePurgeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssueMessage(parsed.error) },
      { status: 422 },
    );
  }

  const input: CachePurgeInput = parsed.data;

  if (input.type === "selected" && (!input.scope || input.scope.length === 0)) {
    return NextResponse.json(
      {
        error:
          'scope is required when type is "selected" — provide at least one cache layer.',
      },
      { status: 422 },
    );
  }

  const targetLayers: CacheLayerKey[] =
    input.type === "all" ? ALL_LAYERS : (input.scope as CacheLayerKey[]);

  // ── Load connection settings ──────────────────────────────────────────────

  const { data: monRow } = await supabase
    .from("cache_monitoring_settings")
    .select("cache_type, redis_host, redis_port, redis_db")
    .eq("id", true)
    .maybeSingle();

  const monitoring = monRow as MonitoringSettingsRow | null;

  const cacheType =
    monitoring?.cache_type === "redis" ||
    monitoring?.cache_type === "file" ||
    monitoring?.cache_type === "memcached"
      ? monitoring.cache_type
      : "redis";

  let purgeCount = 0;
  let purgeSizeBytes = 0;
  let purgeStatus: "success" | "failed" | "partial" = "success";
  let message: string | null = null;

  try {
    if (cacheType === "redis") {
      // Merge host/port/db from monitoring settings with credentials from
      // object_cache_settings (passwords and TLS flags live there).
      const { data: objRow } = await supabase
        .from("object_cache_settings")
        .select(
          "redis_tls_enabled, redis_username, redis_password, redis_connect_timeout_ms",
        )
        .eq("id", true)
        .maybeSingle();

      const obj = objRow as ObjectCacheRow | null;

      const opts: RedisConnOpts = {
        host: monitoring?.redis_host ?? "127.0.0.1",
        port: monitoring?.redis_port ?? 6379,
        database: monitoring?.redis_db ?? 0,
        tls: obj?.redis_tls_enabled ?? false,
        username: obj?.redis_username ?? undefined,
        password: obj?.redis_password ?? null,
        connectTimeoutMs: obj?.redis_connect_timeout_ms ?? CONNECT_TIMEOUT_MS,
      };

      const result = await purgeRedisLayers(opts, targetLayers);
      purgeCount = result.purgeCount;
      purgeSizeBytes = result.purgeSizeBytes;
      if (result.message) {
        purgeStatus = "partial";
        message = result.message;
      }
    } else if (cacheType === "file") {
      const result = await purgeFileCache(targetLayers);
      purgeCount = result.purgeCount;
      purgeSizeBytes = result.purgeSizeBytes;
      message = result.message;
    } else {
      // Memcached — no bundled client; record the action but note the limitation.
      message =
        "Memcached does not support key-pattern eviction via the admin panel. Use flush_all on the server directly, or switch to Redis for automated purge support.";
      purgeStatus = "partial";
    }
  } catch (err) {
    purgeStatus = "failed";
    message =
      err instanceof Error
        ? err.message
        : "An unexpected error occurred during the cache purge.";
  }

  // Always write an audit log row — even on failure.
  await supabase.from("cache_purge_logs").insert({
    purge_type: input.type,
    purge_scope: input.type === "selected" ? targetLayers : [],
    purge_count: purgeCount,
    purge_size_bytes: purgeSizeBytes,
    status: purgeStatus,
    message,
    triggered_by: user.id,
    triggered_at: new Date().toISOString(),
  });

  if (purgeStatus === "failed") {
    return NextResponse.json(
      { error: message ?? "Cache purge failed.", purgeCount, purgeSizeBytes, status: purgeStatus },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, purgeCount, purgeSizeBytes, status: purgeStatus, message });
}
