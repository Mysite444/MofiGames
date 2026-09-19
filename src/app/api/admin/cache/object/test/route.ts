import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactSecret, type ObjectCacheProvider } from "@/lib/object-cache-settings";
import { testRedisConnection, testMemcachedConnection } from "@/lib/object-cache-client";
import { objectCacheTestInputSchema, firstIssueMessage } from "@/lib/validation";

interface RawRow {
  provider: ObjectCacheProvider;
  redis_host: string;
  redis_port: number;
  redis_database: number;
  redis_tls_enabled: boolean;
  redis_username: string | null;
  redis_password: string | null;
  redis_connect_timeout_ms: number;
  memcached_servers: string[];
}

/** POST /api/admin/cache/object/test — Admin → Cache → Object Cache →
 * "Test Connection". Admin-only. Makes a real connection to the
 * configured Redis or Memcached backend (PING / version) and records the
 * outcome. For 'wordpress_object_cache' or 'none' there is nothing to
 * connect to — this app isn't WordPress and doesn't itself run one of
 * these backends yet, so the route returns an informational message
 * instead of a live result. When the provider is Memcached and no
 * `server` is given in the body, every configured server is tested and
 * the results are aggregated. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = objectCacheTestInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { server } = parsed.data;

  const { data, error } = await supabase.from("object_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to load object cache settings." }, { status: 500 });
  }
  const row = data as unknown as RawRow;

  let ok: boolean;
  let message: string;
  let latencyMs: number | undefined;

  if (row.provider === "redis") {
    const result = await testRedisConnection({
      host: row.redis_host,
      port: row.redis_port,
      database: row.redis_database,
      tls: row.redis_tls_enabled,
      username: row.redis_username ?? undefined,
      password: row.redis_password ?? undefined,
      connectTimeoutMs: row.redis_connect_timeout_ms,
    });
    ok = result.ok;
    message = result.message;
    latencyMs = result.latencyMs;
  } else if (row.provider === "memcached") {
    const servers = server ? [server] : row.memcached_servers ?? [];
    if (servers.length === 0) {
      ok = false;
      message = "No Memcached servers configured.";
    } else {
      const results = await Promise.all(servers.map((s) => testMemcachedConnection(s, 3000)));
      ok = results.every((r) => r.ok);
      message = results.map((r) => r.message).join(" · ");
      latencyMs = Math.max(...results.map((r) => r.latencyMs ?? 0));
    }
  } else if (row.provider === "wordpress_object_cache") {
    ok = true;
    message =
      "WordPress Object Cache is documentation-only in this app — there is no live backend here to connect to. Use the generated config on a real WordPress install to test the actual drop-in.";
  } else {
    ok = false;
    message = "No object cache provider is selected — choose Redis or Memcached above, then test.";
  }

  const status = ok ? "success" : "failed";
  const { data: updated, error: updateError } = await supabase
    .from("object_cache_settings")
    .update({
      last_tested_at: new Date().toISOString(),
      last_test_status: status,
      last_test_message: message,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Test ran but failed to record the result." }, { status: 500 });
  }

  const { redis_password, memcached_password, ...rest } = updated as Record<string, unknown> & {
    redis_password?: string | null;
    memcached_password?: string | null;
  };
  const redisRedacted = redactSecret(redis_password ?? null);
  const memcachedRedacted = redactSecret(memcached_password ?? null);

  return NextResponse.json({
    result: { ok, message, latencyMs },
    settings: {
      ...rest,
      redis_password_set: redisRedacted.set,
      redis_password_preview: redisRedacted.preview,
      memcached_password_set: memcachedRedacted.set,
      memcached_password_preview: memcachedRedacted.preview,
    },
  });
}
