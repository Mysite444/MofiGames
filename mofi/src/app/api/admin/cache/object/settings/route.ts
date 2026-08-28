import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactSecret } from "@/lib/object-cache-settings";
import { objectCacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation";

function redactRow(data: Record<string, unknown>) {
  const { redis_password, memcached_password, ...rest } = data as Record<string, unknown> & {
    redis_password?: string | null;
    memcached_password?: string | null;
  };
  const redisRedacted = redactSecret(redis_password ?? null);
  const memcachedRedacted = redactSecret(memcached_password ?? null);

  return {
    ...rest,
    redis_password_set: redisRedacted.set,
    redis_password_preview: redisRedacted.preview,
    memcached_password_set: memcachedRedacted.set,
    memcached_password_preview: memcachedRedacted.preview,
  };
}

/** GET /api/admin/cache/object/settings — Admin → Cache → Object Cache.
 * Admin-only. Redacts redis_password and memcached_password to a
 * boolean + preview before the row reaches the browser, exactly as
 * full-page/settings does for the Varnish purge key. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("object_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load object cache settings." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ settings: null });
  }

  return NextResponse.json({ settings: redactRow(data as Record<string, unknown>) });
}

/** PUT /api/admin/cache/object/settings — Admin → Cache → Object Cache.
 * Admin-only. Partial update — only fields present in the body are
 * written. redisPassword/memcachedPassword blank/omitted = leave the
 * stored secret untouched. clearRedisPassword/clearMemcachedPassword =
 * explicitly wipe it. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = objectCacheSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  if (input.provider !== undefined) patch.provider = input.provider;

  // Shared behaviour
  if (input.persistentEnabled !== undefined) patch.persistent_enabled = input.persistentEnabled;
  if (input.defaultTtlSeconds !== undefined) patch.default_ttl_seconds = input.defaultTtlSeconds;
  if (input.keyPrefix !== undefined) patch.key_prefix = input.keyPrefix;
  if (input.cacheGroups !== undefined) patch.cache_groups = input.cacheGroups;

  // Redis
  if (input.redisHost !== undefined) patch.redis_host = input.redisHost;
  if (input.redisPort !== undefined) patch.redis_port = input.redisPort;
  if (input.redisDatabase !== undefined) patch.redis_database = input.redisDatabase;
  if (input.redisTlsEnabled !== undefined) patch.redis_tls_enabled = input.redisTlsEnabled;
  if (input.redisUsername !== undefined) patch.redis_username = input.redisUsername;
  if (input.redisConnectTimeoutMs !== undefined) patch.redis_connect_timeout_ms = input.redisConnectTimeoutMs;
  if (input.clearRedisPassword) {
    patch.redis_password = null;
  } else if (input.redisPassword) {
    patch.redis_password = input.redisPassword;
  }

  // Memcached
  if (input.memcachedServers !== undefined) patch.memcached_servers = input.memcachedServers;
  if (input.memcachedBinaryProtocol !== undefined) patch.memcached_binary_protocol = input.memcachedBinaryProtocol;
  if (input.memcachedCompressionEnabled !== undefined)
    patch.memcached_compression_enabled = input.memcachedCompressionEnabled;
  if (input.memcachedCompressionThresholdBytes !== undefined)
    patch.memcached_compression_threshold_bytes = input.memcachedCompressionThresholdBytes;
  if (input.memcachedUsername !== undefined) patch.memcached_username = input.memcachedUsername;
  if (input.clearMemcachedPassword) {
    patch.memcached_password = null;
  } else if (input.memcachedPassword) {
    patch.memcached_password = input.memcachedPassword;
  }

  // WordPress Object Cache
  if (input.wpDropInInstalled !== undefined) patch.wp_drop_in_installed = input.wpDropInInstalled;
  if (input.wpCacheKeySalt !== undefined) patch.wp_cache_key_salt = input.wpCacheKeySalt;

  const { data, error } = await supabase
    .from("object_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update object cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: redactRow(data as Record<string, unknown>) });
}
