// Shared between CacheSessionAdminClient and the API routes under
// src/app/api/admin/cache/session/**. Pure mapper, no IO. See migration
// 0043_session_cache.sql for the table and the reasoning behind the
// four-pillar split (Redis Sessions / Database Sessions / Secure Session
// Storage / Session Replication) and the separate session_store table.
//
// Sensitive note: redis_password and session_secret are stored in the
// table but never leave this app raw — route handlers redact each to a
// boolean + short preview before the row reaches the browser, matching
// object-cache-settings.ts's redactSecret / dns-cache-settings.ts's
// redactDnsApiToken.

export type SameSiteMode = "strict" | "lax" | "none";
export type EncryptionAlgorithm = "aes-256-gcm" | "aes-256-cbc";
export type ReplicationMode = "none" | "redis_pub_sub" | "database_polling";
export type SessionTestStatus = "success" | "failed";

export interface SessionCacheSettings {
  // ── 1. Redis Sessions ────────────────────────────────────────────────────
  redisSessionsEnabled: boolean;
  redisHost: string;
  redisPort: number;
  redisDatabase: number;
  redisTlsEnabled: boolean;
  redisUsername: string;
  /** Whether a password is stored. Never sent to the browser — only this
   * flag + a short preview. */
  redisPasswordSet: boolean;
  redisPasswordPreview: string | null;
  redisKeyPrefix: string;
  redisTtlSeconds: number;
  redisConnectTimeoutMs: number;
  redisLastTestedAt: string | null;
  redisLastTestStatus: SessionTestStatus | null;
  redisLastTestMessage: string | null;

  // ── 2. Database Sessions ─────────────────────────────────────────────────
  databaseSessionsEnabled: boolean;
  dbSessionTtlMinutes: number;
  maxConcurrentSessions: number;
  unlimitedConcurrentSessions: boolean;
  dbSessionsLastPurgedAt: string | null;
  dbSessionsLastPurgeCount: number;

  // ── 3. Secure Session Storage ────────────────────────────────────────────
  secureCookieEnabled: boolean;
  httpOnlyCookie: boolean;
  sameSiteMode: SameSiteMode;
  encryptPayloadAtRest: boolean;
  encryptionAlgorithm: EncryptionAlgorithm;
  /** Whether a signing/encryption secret is stored. Never sent raw. */
  sessionSecretSet: boolean;
  sessionSecretPreview: string | null;
  regenerateIdOnPrivilegeChange: boolean;
  idleTimeoutMinutes: number;
  absoluteTimeoutMinutes: number;

  // ── 4. Session Replication ───────────────────────────────────────────────
  replicationMode: ReplicationMode;
  replicationChannel: string;
  replicationPollIntervalSeconds: number;
  replicationNodes: string[];
  replicationLastCheckedAt: string | null;
  replicationLastStatus: SessionTestStatus | null;
  replicationLastMessage: string | null;

  updatedAt: string;
}

const SAME_SITE_MODES: SameSiteMode[] = ["strict", "lax", "none"];
const ENCRYPTION_ALGORITHMS: EncryptionAlgorithm[] = ["aes-256-gcm", "aes-256-cbc"];
const REPLICATION_MODES: ReplicationMode[] = ["none", "redis_pub_sub", "database_polling"];
const TEST_STATUSES: SessionTestStatus[] = ["success", "failed"];

export const REDIS_TTL_LIMITS = { min: 60, max: 2592000 } as const;
export const DB_SESSION_TTL_LIMITS = { min: 5, max: 43200 } as const;
export const MAX_CONCURRENT_SESSIONS_LIMITS = { min: 1, max: 50 } as const;
export const IDLE_TIMEOUT_LIMITS = { min: 5, max: 1440 } as const;
export const ABSOLUTE_TIMEOUT_LIMITS = { min: 30, max: 43200 } as const;
export const REPLICATION_POLL_INTERVAL_LIMITS = { min: 5, max: 600 } as const;

/** Used whenever the row can't be loaded, and as the base for a freshly
 * seeded row (migration 0043) — mirrors the column defaults there. */
export const DEFAULT_SESSION_CACHE_SETTINGS: SessionCacheSettings = {
  redisSessionsEnabled: false,
  redisHost: "127.0.0.1",
  redisPort: 6379,
  redisDatabase: 2,
  redisTlsEnabled: false,
  redisUsername: "",
  redisPasswordSet: false,
  redisPasswordPreview: null,
  redisKeyPrefix: "sess:",
  redisTtlSeconds: 86400,
  redisConnectTimeoutMs: 2000,
  redisLastTestedAt: null,
  redisLastTestStatus: null,
  redisLastTestMessage: null,

  databaseSessionsEnabled: true,
  dbSessionTtlMinutes: 1440,
  maxConcurrentSessions: 5,
  unlimitedConcurrentSessions: false,
  dbSessionsLastPurgedAt: null,
  dbSessionsLastPurgeCount: 0,

  secureCookieEnabled: true,
  httpOnlyCookie: true,
  sameSiteMode: "lax",
  encryptPayloadAtRest: false,
  encryptionAlgorithm: "aes-256-gcm",
  sessionSecretSet: false,
  sessionSecretPreview: null,
  regenerateIdOnPrivilegeChange: true,
  idleTimeoutMinutes: 30,
  absoluteTimeoutMinutes: 720,

  replicationMode: "none",
  replicationChannel: "session-events",
  replicationPollIntervalSeconds: 30,
  replicationNodes: [],
  replicationLastCheckedAt: null,
  replicationLastStatus: null,
  replicationLastMessage: null,

  updatedAt: new Date(0).toISOString(),
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Redact a stored secret the same way object-cache-settings.ts's
 * redactSecret does — only a boolean + last-4-chars preview goes to the
 * browser. Shared by both the Redis password and the session secret. */
export function redactSecret(value: string | null | undefined): { set: boolean; preview: string | null } {
  if (!value) return { set: false, preview: null };
  return { set: true, preview: value.length > 4 ? `…${value.slice(-4)}` : "…" };
}

/** Row shape returned by GET /api/admin/cache/session/settings
 * (snake_case, as stored) — already redacted server-side, so this never
 * sees a raw redis_password / session_secret, only the *_set / *_preview
 * fields the route computed. */
export function mapSessionCacheRow(row: Record<string, unknown> | null): SessionCacheSettings {
  if (!row) return DEFAULT_SESSION_CACHE_SETTINGS;
  const d = DEFAULT_SESSION_CACHE_SETTINGS;

  const sameSite = String(row.same_site_mode ?? "");
  const algorithm = String(row.encryption_algorithm ?? "");
  const replicationMode = String(row.replication_mode ?? "");
  const redisTestStatus = String(row.redis_last_test_status ?? "");
  const replicationStatus = String(row.replication_last_status ?? "");

  return {
    redisSessionsEnabled: Boolean(row.redis_sessions_enabled ?? d.redisSessionsEnabled),
    redisHost: String(row.redis_host ?? d.redisHost),
    redisPort: Number(row.redis_port ?? d.redisPort),
    redisDatabase: Number(row.redis_database ?? d.redisDatabase),
    redisTlsEnabled: Boolean(row.redis_tls_enabled ?? d.redisTlsEnabled),
    redisUsername: String(row.redis_username ?? ""),
    redisPasswordSet: Boolean(row.redis_password_set ?? false),
    redisPasswordPreview: row.redis_password_preview ? String(row.redis_password_preview) : null,
    redisKeyPrefix: String(row.redis_key_prefix ?? d.redisKeyPrefix),
    redisTtlSeconds: clamp(Number(row.redis_ttl_seconds ?? d.redisTtlSeconds), REDIS_TTL_LIMITS.min, REDIS_TTL_LIMITS.max),
    redisConnectTimeoutMs: Number(row.redis_connect_timeout_ms ?? d.redisConnectTimeoutMs),
    redisLastTestedAt: row.redis_last_tested_at ? String(row.redis_last_tested_at) : null,
    redisLastTestStatus: TEST_STATUSES.includes(redisTestStatus as SessionTestStatus)
      ? (redisTestStatus as SessionTestStatus)
      : null,
    redisLastTestMessage: row.redis_last_test_message ? String(row.redis_last_test_message) : null,

    databaseSessionsEnabled: Boolean(row.database_sessions_enabled ?? d.databaseSessionsEnabled),
    dbSessionTtlMinutes: clamp(
      Number(row.db_session_ttl_minutes ?? d.dbSessionTtlMinutes),
      DB_SESSION_TTL_LIMITS.min,
      DB_SESSION_TTL_LIMITS.max
    ),
    maxConcurrentSessions: clamp(
      Number(row.max_concurrent_sessions ?? d.maxConcurrentSessions),
      MAX_CONCURRENT_SESSIONS_LIMITS.min,
      MAX_CONCURRENT_SESSIONS_LIMITS.max
    ),
    unlimitedConcurrentSessions: Boolean(row.unlimited_concurrent_sessions ?? d.unlimitedConcurrentSessions),
    dbSessionsLastPurgedAt: row.db_sessions_last_purged_at ? String(row.db_sessions_last_purged_at) : null,
    dbSessionsLastPurgeCount: Number(row.db_sessions_last_purge_count ?? 0),

    secureCookieEnabled: Boolean(row.secure_cookie_enabled ?? d.secureCookieEnabled),
    httpOnlyCookie: Boolean(row.http_only_cookie ?? d.httpOnlyCookie),
    sameSiteMode: SAME_SITE_MODES.includes(sameSite as SameSiteMode) ? (sameSite as SameSiteMode) : d.sameSiteMode,
    encryptPayloadAtRest: Boolean(row.encrypt_payload_at_rest ?? d.encryptPayloadAtRest),
    encryptionAlgorithm: ENCRYPTION_ALGORITHMS.includes(algorithm as EncryptionAlgorithm)
      ? (algorithm as EncryptionAlgorithm)
      : d.encryptionAlgorithm,
    sessionSecretSet: Boolean(row.session_secret_set ?? false),
    sessionSecretPreview: row.session_secret_preview ? String(row.session_secret_preview) : null,
    regenerateIdOnPrivilegeChange: Boolean(row.regenerate_id_on_privilege_change ?? d.regenerateIdOnPrivilegeChange),
    idleTimeoutMinutes: clamp(
      Number(row.idle_timeout_minutes ?? d.idleTimeoutMinutes),
      IDLE_TIMEOUT_LIMITS.min,
      IDLE_TIMEOUT_LIMITS.max
    ),
    absoluteTimeoutMinutes: clamp(
      Number(row.absolute_timeout_minutes ?? d.absoluteTimeoutMinutes),
      ABSOLUTE_TIMEOUT_LIMITS.min,
      ABSOLUTE_TIMEOUT_LIMITS.max
    ),

    replicationMode: REPLICATION_MODES.includes(replicationMode as ReplicationMode)
      ? (replicationMode as ReplicationMode)
      : d.replicationMode,
    replicationChannel: String(row.replication_channel ?? d.replicationChannel),
    replicationPollIntervalSeconds: clamp(
      Number(row.replication_poll_interval_seconds ?? d.replicationPollIntervalSeconds),
      REPLICATION_POLL_INTERVAL_LIMITS.min,
      REPLICATION_POLL_INTERVAL_LIMITS.max
    ),
    replicationNodes: Array.isArray(row.replication_nodes) ? row.replication_nodes.map(String) : [],
    replicationLastCheckedAt: row.replication_last_checked_at ? String(row.replication_last_checked_at) : null,
    replicationLastStatus: TEST_STATUSES.includes(replicationStatus as SessionTestStatus)
      ? (replicationStatus as SessionTestStatus)
      : null,
    replicationLastMessage: row.replication_last_message ? String(row.replication_last_message) : null,

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}
