import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactSecret } from "@/lib/session-cache-settings";
import { testRedisSessionConnection } from "@/lib/session-cache-client";

interface RawRow {
  redis_host: string;
  redis_port: number;
  redis_database: number;
  redis_tls_enabled: boolean;
  redis_username: string | null;
  redis_password: string | null;
  redis_key_prefix: string;
  redis_connect_timeout_ms: number;
}

/** POST /api/admin/cache/session/test — Admin → Cache → Session Cache →
 * Redis Sessions → "Test Connection". Admin-only. Makes a real
 * connection to the configured Redis backend and does a SETEX/GET/DEL
 * round-trip under the configured key prefix (see session-cache-client.ts
 * for why that's more thorough than a bare PING), then records the
 * outcome. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data, error } = await supabase.from("session_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to load session cache settings." }, { status: 500 });
  }
  const row = data as unknown as RawRow;

  const result = await testRedisSessionConnection(
    {
      host: row.redis_host,
      port: row.redis_port,
      database: row.redis_database,
      tls: row.redis_tls_enabled,
      username: row.redis_username ?? undefined,
      password: row.redis_password ?? undefined,
      connectTimeoutMs: row.redis_connect_timeout_ms,
    },
    row.redis_key_prefix
  );

  const status = result.ok ? "success" : "failed";
  const { data: updated, error: updateError } = await supabase
    .from("session_cache_settings")
    .update({
      redis_last_tested_at: new Date().toISOString(),
      redis_last_test_status: status,
      redis_last_test_message: result.message,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .single();

  if (updateError || !updated) {
    return NextResponse.json({ error: "Test ran but failed to record the result." }, { status: 500 });
  }

  const { redis_password, session_secret, ...rest } = updated as Record<string, unknown> & {
    redis_password?: string | null;
    session_secret?: string | null;
  };
  const redisRedacted = redactSecret(redis_password ?? null);
  const secretRedacted = redactSecret(session_secret ?? null);

  return NextResponse.json({
    result,
    settings: {
      ...rest,
      redis_password_set: redisRedacted.set,
      redis_password_preview: redisRedacted.preview,
      session_secret_set: secretRedacted.set,
      session_secret_preview: secretRedacted.preview,
    },
  });
}
