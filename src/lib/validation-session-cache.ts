// Session Cache validation schemas — Admin → Cache → Session Cache.
// Import from here in the route handlers under
// src/app/api/admin/cache/session/**.

import { z } from "zod";
import {
  REDIS_TTL_LIMITS,
  DB_SESSION_TTL_LIMITS,
  MAX_CONCURRENT_SESSIONS_LIMITS,
  IDLE_TIMEOUT_LIMITS,
  ABSOLUTE_TIMEOUT_LIMITS,
  REPLICATION_POLL_INTERVAL_LIMITS,
} from "./session-cache-settings";

export const sessionCacheSettingsInputSchema = z
  .object({
    // ── 1. Redis Sessions ──────────────────────────────────────────────────
    redisSessionsEnabled: z.boolean().optional(),
    redisHost: z.string().trim().min(1).max(255).optional(),
    redisPort: z.number().int().min(1).max(65535).optional(),
    redisDatabase: z.number().int().min(0).max(15).optional(),
    redisTlsEnabled: z.boolean().optional(),
    redisUsername: z.string().trim().max(255).optional(),
    redisPassword: z.string().trim().min(1).max(256).optional(), // blank/omitted = unchanged
    clearRedisPassword: z.boolean().optional(),
    redisKeyPrefix: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(/^[a-zA-Z0-9_:-]+$/, "Use letters, numbers, underscores, colons, and hyphens only")
      .optional(),
    redisTtlSeconds: z.number().int().min(REDIS_TTL_LIMITS.min).max(REDIS_TTL_LIMITS.max).optional(),
    redisConnectTimeoutMs: z.number().int().min(100).max(30000).optional(),

    // ── 2. Database Sessions ───────────────────────────────────────────────
    databaseSessionsEnabled: z.boolean().optional(),
    dbSessionTtlMinutes: z.number().int().min(DB_SESSION_TTL_LIMITS.min).max(DB_SESSION_TTL_LIMITS.max).optional(),
    maxConcurrentSessions: z
      .number()
      .int()
      .min(MAX_CONCURRENT_SESSIONS_LIMITS.min)
      .max(MAX_CONCURRENT_SESSIONS_LIMITS.max)
      .optional(),
    unlimitedConcurrentSessions: z.boolean().optional(),

    // ── 3. Secure Session Storage ──────────────────────────────────────────
    secureCookieEnabled: z.boolean().optional(),
    httpOnlyCookie: z.boolean().optional(),
    sameSiteMode: z.enum(["strict", "lax", "none"]).optional(),
    encryptPayloadAtRest: z.boolean().optional(),
    encryptionAlgorithm: z.enum(["aes-256-gcm", "aes-256-cbc"]).optional(),
    sessionSecret: z.string().trim().min(8, "Use at least 8 characters.").max(512).optional(), // blank/omitted = unchanged
    clearSessionSecret: z.boolean().optional(),
    regenerateIdOnPrivilegeChange: z.boolean().optional(),
    idleTimeoutMinutes: z.number().int().min(IDLE_TIMEOUT_LIMITS.min).max(IDLE_TIMEOUT_LIMITS.max).optional(),
    absoluteTimeoutMinutes: z
      .number()
      .int()
      .min(ABSOLUTE_TIMEOUT_LIMITS.min)
      .max(ABSOLUTE_TIMEOUT_LIMITS.max)
      .optional(),

    // ── 4. Session Replication ─────────────────────────────────────────────
    replicationMode: z.enum(["none", "redis_pub_sub", "database_polling"]).optional(),
    replicationChannel: z.string().trim().min(1).max(128).optional(),
    replicationPollIntervalSeconds: z
      .number()
      .int()
      .min(REPLICATION_POLL_INTERVAL_LIMITS.min)
      .max(REPLICATION_POLL_INTERVAL_LIMITS.max)
      .optional(),
    replicationNodes: z.array(z.string().trim().min(1).max(255)).max(50).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.idleTimeoutMinutes !== undefined &&
      data.absoluteTimeoutMinutes !== undefined &&
      data.idleTimeoutMinutes > data.absoluteTimeoutMinutes
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Idle timeout can't be greater than the absolute timeout.",
        path: ["idleTimeoutMinutes"],
      });
    }
  });

/** POST /api/admin/cache/session/encryption-preview body. `secret`/
 * `algorithm` are optional overrides so an admin can preview a
 * not-yet-saved secret before committing it with Save changes — omitted,
 * the route falls back to the currently stored secret/algorithm. */
export const sessionEncryptionPreviewInputSchema = z.object({
  sample: z.string().trim().min(1).max(500).optional(),
  secret: z.string().trim().min(8).max(512).optional(),
  algorithm: z.enum(["aes-256-gcm", "aes-256-cbc"]).optional(),
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
