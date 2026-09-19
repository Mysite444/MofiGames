// Cache Monitoring validation schemas — Admin → Cache → Monitoring.
// Import from here in the route handlers under
// src/app/api/admin/cache/monitoring/**

import { z } from "zod";
import {
  TTL_LIMITS,
  CLEANUP_INTERVAL_LIMITS,
  CLEANUP_MAX_AGE_LIMITS,
  CLEANUP_USAGE_PCT_LIMITS,
  MAX_STORAGE_MB_LIMITS,
} from "./monitoring-cache-settings";

const cacheBackendTypeSchema = z.enum(["redis", "file", "memcached"]);

const cacheLayerKeySchema = z.enum([
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
]);

const ttlSecondsSchema = z
  .number()
  .int()
  .min(TTL_LIMITS.min)
  .max(TTL_LIMITS.max);

// ── Settings PATCH schema ─────────────────────────────────────────────────────

export const monitoringCacheSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),

  cacheType: cacheBackendTypeSchema.optional(),
  redisHost: z.string().trim().max(253).optional(),
  redisPort: z.number().int().min(1).max(65535).optional(),
  redisDb: z.number().int().min(0).max(15).optional(),
  memcachedServers: z
    .array(
      z
        .string()
        .trim()
        .max(260)
        .regex(/^[^:]+:\d+$/, "Each server must be in 'host:port' format."),
    )
    .max(20)
    .optional(),
  maxStorageMb: z
    .number()
    .int()
    .min(MAX_STORAGE_MB_LIMITS.min)
    .max(MAX_STORAGE_MB_LIMITS.max)
    .optional(),

  ttl: z
    .object({
      pageTtlSeconds: ttlSecondsSchema.optional(),
      apiTtlSeconds: ttlSecondsSchema.optional(),
      objectTtlSeconds: ttlSecondsSchema.optional(),
      fragmentTtlSeconds: ttlSecondsSchema.optional(),
      imageTtlSeconds: ttlSecondsSchema.optional(),
      staticTtlSeconds: ttlSecondsSchema.optional(),
      sessionTtlSeconds: ttlSecondsSchema.optional(),
      dnsTtlSeconds: ttlSecondsSchema.optional(),
      searchTtlSeconds: ttlSecondsSchema.optional(),
      feedTtlSeconds: ttlSecondsSchema.optional(),
    })
    .optional(),

  autoCleanup: z
    .object({
      enabled: z.boolean().optional(),
      intervalHours: z
        .number()
        .int()
        .min(CLEANUP_INTERVAL_LIMITS.min)
        .max(CLEANUP_INTERVAL_LIMITS.max)
        .optional(),
      maxAgeHours: z
        .number()
        .int()
        .min(CLEANUP_MAX_AGE_LIMITS.min)
        .max(CLEANUP_MAX_AGE_LIMITS.max)
        .optional(),
      targetUsagePct: z
        .number()
        .int()
        .min(CLEANUP_USAGE_PCT_LIMITS.min)
        .max(CLEANUP_USAGE_PCT_LIMITS.max)
        .optional(),
    })
    .optional(),
});

export type MonitoringCacheSettingsInput = z.infer<
  typeof monitoringCacheSettingsInputSchema
>;

// ── Purge request schema ──────────────────────────────────────────────────────

export const cachePurgeInputSchema = z.object({
  /** "all" wipes every layer; "selected" requires scope. */
  type: z.enum(["all", "selected"]),
  /** Required when type === "selected". */
  scope: z.array(cacheLayerKeySchema).min(1).max(10).optional(),
});

export type CachePurgeInput = z.infer<typeof cachePurgeInputSchema>;

// ── Shared helper ─────────────────────────────────────────────────────────────

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
