import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactSecret } from "@/lib/session-cache-settings";
import { testRedisReplication } from "@/lib/session-cache-client";

interface RawRow {
  replication_mode: "none" | "redis_pub_sub" | "database_polling";
  replication_channel: string;
  redis_host: string;
  redis_port: number;
  redis_database: number;
  redis_tls_enabled: boolean;
  redis_username: string | null;
  redis_password: string | null;
  redis_connect_timeout_ms: number;
}

/** POST /api/admin/cache/session/replicate-test — Admin → Cache →
 * Session Cache → Session Replication → "Test Replication". Admin-only.
 *   - redis_pub_sub    → genuinely PUBLISHes a probe message on the
 *     configured Redis channel and reports the live subscriber count.
 *   - database_polling → session_store (migration 0043) already IS the
 *     shared source of truth every instance polls; there's no separate
 *     replication channel to probe, so this reports that directly rather
 *     than faking a network call.
 *   - none             → informational only, mirrors the object-cache
 *     "wordpress_object_cache" test route's honesty about having nothing
 *     live to check. */
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

  let result: { ok: boolean; message: string; latencyMs?: number };

  if (row.replication_mode === "redis_pub_sub") {
    result = await testRedisReplication(
      {
        host: row.redis_host,
        port: row.redis_port,
        database: row.redis_database,
        tls: row.redis_tls_enabled,
        username: row.redis_username ?? undefined,
        password: row.redis_password ?? undefined,
        connectTimeoutMs: row.redis_connect_timeout_ms,
      },
      row.replication_channel
    );
  } else if (row.replication_mode === "database_polling") {
    result = {
      ok: true,
      message:
        "Database polling mode has no separate replication channel to probe — session_store is the shared source of truth every instance already reads directly. Nothing to test beyond the database connection itself.",
    };
  } else {
    result = {
      ok: false,
      message: "Replication is off — choose Redis Pub/Sub or Database Polling above, then test.",
    };
  }

  const status = result.ok ? "success" : "failed";
  const { data: updated, error: updateError } = await supabase
    .from("session_cache_settings")
    .update({
      replication_last_checked_at: new Date().toISOString(),
      replication_last_status: status,
      replication_last_message: result.message,
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
