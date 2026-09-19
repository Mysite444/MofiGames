import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactSecret, type ObjectCacheProvider } from "@/lib/object-cache-settings";
import { invalidateRedis, flushMemcached } from "@/lib/object-cache-client";
import { objectCacheInvalidateInputSchema, firstIssueMessage } from "@/lib/validation";

interface RawRow {
  provider: ObjectCacheProvider;
  key_prefix: string;
  redis_host: string;
  redis_port: number;
  redis_database: number;
  redis_tls_enabled: boolean;
  redis_username: string | null;
  redis_password: string | null;
  redis_connect_timeout_ms: number;
  memcached_servers: string[];
}

/** POST /api/admin/cache/object/invalidate — Admin → Cache → Object
 * Cache → "Selective Object Invalidation". Admin-only.
 *
 * scope "all"     — full flush (Redis: FLUSHDB on the configured
 *                    database only, never FLUSHALL; Memcached: flush_all
 *                    on every configured server).
 * scope "group"   — Redis only: SCAN + DEL everything under
 *                    `${keyPrefix}${group}:*`. Memcached has no key
 *                    enumeration command, so this falls back to a full
 *                    flush with a note explaining why (see
 *                    generateMemcachedConfig's comment for the same
 *                    limitation documented in the config generator).
 * scope "pattern" — Redis only: SCAN + DEL everything under
 *                    `${keyPrefix}${pattern}`. Same Memcached fallback
 *                    as above.
 *
 * 'wordpress_object_cache' has no live backend in this app — returns an
 * informational message instead of performing anything. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = objectCacheInvalidateInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { scope, group, pattern } = parsed.data;

  if (scope === "group" && !group) {
    return NextResponse.json({ error: "Choose a cache group to invalidate." }, { status: 400 });
  }
  if (scope === "pattern" && !pattern) {
    return NextResponse.json({ error: "Enter a key pattern to invalidate." }, { status: 400 });
  }

  const { data, error } = await supabase.from("object_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to load object cache settings." }, { status: 500 });
  }
  const row = data as unknown as RawRow;

  let ok: boolean;
  let message: string;
  let deletedCount: number | undefined;

  if (row.provider === "redis") {
    if (scope === "all") {
      const result = await invalidateRedis(
        {
          host: row.redis_host,
          port: row.redis_port,
          database: row.redis_database,
          tls: row.redis_tls_enabled,
          username: row.redis_username ?? undefined,
          password: row.redis_password ?? undefined,
          connectTimeoutMs: row.redis_connect_timeout_ms,
        },
        "all"
      );
      ok = result.ok;
      message = result.message;
    } else {
      const matchPattern = scope === "group" ? `${row.key_prefix}${group}:*` : `${row.key_prefix}${pattern}`;
      const result = await invalidateRedis(
        {
          host: row.redis_host,
          port: row.redis_port,
          database: row.redis_database,
          tls: row.redis_tls_enabled,
          username: row.redis_username ?? undefined,
          password: row.redis_password ?? undefined,
          connectTimeoutMs: row.redis_connect_timeout_ms,
        },
        "pattern",
        matchPattern
      );
      ok = result.ok;
      message = result.message;
      deletedCount = result.deletedCount;
    }
  } else if (row.provider === "memcached") {
    const servers = row.memcached_servers ?? [];
    if (servers.length === 0) {
      ok = false;
      message = "No Memcached servers configured.";
    } else {
      const results = await Promise.all(servers.map((s) => flushMemcached(s, 3000)));
      ok = results.every((r) => r.ok);
      const base = results.map((r) => r.message).join(" · ");
      message =
        scope === "all"
          ? base
          : `${base} — Memcached has no key-pattern eviction, so a full flush was performed instead of a scoped invalidation.`;
    }
  } else if (row.provider === "wordpress_object_cache") {
    ok = true;
    message =
      "WordPress Object Cache is documentation-only here — this app has no live backend to invalidate. In WordPress, call wp_cache_flush_group() (or wp_cache_flush() for everything) from PHP instead.";
  } else {
    return NextResponse.json({ error: "Choose Redis or Memcached as the provider first." }, { status: 400 });
  }

  const summary = { scope, group: group ?? null, pattern: pattern ?? null, ok, message, deletedCount: deletedCount ?? null };

  const { data: updated, error: updateError } = await supabase
    .from("object_cache_settings")
    .update({
      last_invalidated_at: new Date().toISOString(),
      last_invalidation_summary: summary,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Invalidation ran but failed to record the result." }, { status: 500 });
  }

  const { redis_password, memcached_password, ...rest } = updated as Record<string, unknown> & {
    redis_password?: string | null;
    memcached_password?: string | null;
  };
  const redisRedacted = redactSecret(redis_password ?? null);
  const memcachedRedacted = redactSecret(memcached_password ?? null);

  return NextResponse.json({
    result: { ok, message, deletedCount },
    settings: {
      ...rest,
      redis_password_set: redisRedacted.set,
      redis_password_preview: redisRedacted.preview,
      memcached_password_set: memcachedRedacted.set,
      memcached_password_preview: memcachedRedacted.preview,
    },
  });
}
