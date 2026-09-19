import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactSecret } from "@/lib/session-cache-settings";
import { sessionCacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation-session-cache";

type SecretRow = Record<string, unknown> & {
  redis_password?: string | null;
  session_secret?: string | null;
};

/** Strips the two raw secrets off a session_cache_settings row and
 * replaces them with redacted *_set / *_preview fields — same treatment
 * as object_cache_settings.redis_password / dns_cache_settings.dns_api_token. */
function redactRow(row: SecretRow): Record<string, unknown> {
  const { redis_password, session_secret, ...rest } = row;
  const redisRedacted = redactSecret(redis_password ?? null);
  const secretRedacted = redactSecret(session_secret ?? null);
  return {
    ...rest,
    redis_password_set: redisRedacted.set,
    redis_password_preview: redisRedacted.preview,
    session_secret_set: secretRedacted.set,
    session_secret_preview: secretRedacted.preview,
  };
}

/** GET /api/admin/cache/session/settings — Admin → Cache → Session Cache.
 * Admin-only: this row can hold a live Redis password and the session-
 * signing/encryption secret, so it never gets a publicly-readable policy
 * — neither secret ever leaves this route as anything but a boolean +
 * short preview. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("session_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load session cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ? redactRow(data as SecretRow) : null });
}

/** PUT /api/admin/cache/session/settings — Admin → Cache → Session Cache.
 * Admin-only. redisPassword/sessionSecret blank or omitted leaves the
 * stored value untouched (so re-saving other fields never accidentally
 * wipes a credential) — clearRedisPassword / clearSessionSecret are the
 * only way to actually clear one. Same shape as dns/settings' zoneId/
 * apiToken handling. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = sessionCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };

  // ── 1. Redis Sessions ──────────────────────────────────────────────────
  if (input.redisSessionsEnabled !== undefined) patch.redis_sessions_enabled = input.redisSessionsEnabled;
  if (input.redisHost !== undefined) patch.redis_host = input.redisHost;
  if (input.redisPort !== undefined) patch.redis_port = input.redisPort;
  if (input.redisDatabase !== undefined) patch.redis_database = input.redisDatabase;
  if (input.redisTlsEnabled !== undefined) patch.redis_tls_enabled = input.redisTlsEnabled;
  if (input.redisUsername !== undefined) patch.redis_username = input.redisUsername || null;
  if (input.clearRedisPassword) patch.redis_password = null;
  else if (input.redisPassword) patch.redis_password = input.redisPassword; // blank/omitted → unchanged
  if (input.redisKeyPrefix !== undefined) patch.redis_key_prefix = input.redisKeyPrefix;
  if (input.redisTtlSeconds !== undefined) patch.redis_ttl_seconds = input.redisTtlSeconds;
  if (input.redisConnectTimeoutMs !== undefined) patch.redis_connect_timeout_ms = input.redisConnectTimeoutMs;

  // ── 2. Database Sessions ───────────────────────────────────────────────
  if (input.databaseSessionsEnabled !== undefined) patch.database_sessions_enabled = input.databaseSessionsEnabled;
  if (input.dbSessionTtlMinutes !== undefined) patch.db_session_ttl_minutes = input.dbSessionTtlMinutes;
  if (input.maxConcurrentSessions !== undefined) patch.max_concurrent_sessions = input.maxConcurrentSessions;
  if (input.unlimitedConcurrentSessions !== undefined)
    patch.unlimited_concurrent_sessions = input.unlimitedConcurrentSessions;

  // ── 3. Secure Session Storage ──────────────────────────────────────────
  if (input.secureCookieEnabled !== undefined) patch.secure_cookie_enabled = input.secureCookieEnabled;
  if (input.httpOnlyCookie !== undefined) patch.http_only_cookie = input.httpOnlyCookie;
  if (input.sameSiteMode !== undefined) patch.same_site_mode = input.sameSiteMode;
  if (input.encryptPayloadAtRest !== undefined) patch.encrypt_payload_at_rest = input.encryptPayloadAtRest;
  if (input.encryptionAlgorithm !== undefined) patch.encryption_algorithm = input.encryptionAlgorithm;
  if (input.clearSessionSecret) patch.session_secret = null;
  else if (input.sessionSecret) patch.session_secret = input.sessionSecret; // blank/omitted → unchanged
  if (input.regenerateIdOnPrivilegeChange !== undefined)
    patch.regenerate_id_on_privilege_change = input.regenerateIdOnPrivilegeChange;
  if (input.idleTimeoutMinutes !== undefined) patch.idle_timeout_minutes = input.idleTimeoutMinutes;
  if (input.absoluteTimeoutMinutes !== undefined) patch.absolute_timeout_minutes = input.absoluteTimeoutMinutes;

  // ── 4. Session Replication ─────────────────────────────────────────────
  if (input.replicationMode !== undefined) patch.replication_mode = input.replicationMode;
  if (input.replicationChannel !== undefined) patch.replication_channel = input.replicationChannel;
  if (input.replicationPollIntervalSeconds !== undefined)
    patch.replication_poll_interval_seconds = input.replicationPollIntervalSeconds;
  if (input.replicationNodes !== undefined) patch.replication_nodes = input.replicationNodes;

  const { data, error } = await supabase
    .from("session_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update session cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: redactRow(data as SecretRow) });
}
