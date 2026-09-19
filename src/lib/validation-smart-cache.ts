// Smart Cache Management validation schemas — Admin → Cache → Smart Cache.
// Import from here in the route handlers under
// src/app/api/admin/cache/smart/**

import { z } from "zod";
import {
  TAG_HEADER_NAMES,
  SMART_CACHE_WARMING_CONCURRENCY,
  SMART_CACHE_WARMING_TIMEOUT,
  SMART_CACHE_REGEN_CONCURRENCY,
  SMART_CACHE_REGEN_DELAY,
  SMART_CACHE_COALESCING_WINDOW,
  SMART_CACHE_COALESCING_WAITERS,
  SMART_CACHE_LOCK_TTL,
  SMART_CACHE_LOCK_TIMEOUT,
  SMART_CACHE_LOCK_RETRY,
  SMART_CACHE_SWR_SECONDS,
  SMART_CACHE_SIE_SECONDS,
  SMART_CACHE_MAX_TAGS,
  SMART_CACHE_INVALIDATION_DELAY,
} from "./smart-cache-settings";

const invalidationTriggerSchema = z.enum(["publish", "update", "delete", "manual"]);

const invalidationRuleSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  pattern: z.string().min(1).max(512),
  triggers: z.array(invalidationTriggerSchema).min(1),
  enabled: z.boolean(),
});

const cacheTagSchema = z.object({
  id: z.string().min(1).max(64),
  tag: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_:.\-]+$/, "Tag may only contain letters, numbers, hyphens, underscores, colons, and dots"),
  description: z.string().max(256),
  patterns: z.array(z.string().min(1).max(512)).max(50),
});

export const smartCacheSettingsInputSchema = z.object({
  // 1. Auto Invalidation
  autoInvalidationEnabled: z.boolean().optional(),
  invalidationRules: z.array(invalidationRuleSchema).max(100).optional(),
  invalidateOnPublish: z.boolean().optional(),
  invalidateOnUpdate: z.boolean().optional(),
  invalidateOnDelete: z.boolean().optional(),
  invalidationDelayMs: z
    .number()
    .int()
    .min(SMART_CACHE_INVALIDATION_DELAY.min)
    .max(SMART_CACHE_INVALIDATION_DELAY.max)
    .optional(),

  // 2. Selective Purge
  selectivePurgeEnabled: z.boolean().optional(),

  // 3. Cache Tags
  cacheTagsEnabled: z.boolean().optional(),
  cacheTags: z.array(cacheTagSchema).max(200).optional(),
  tagHeaderName: z.enum(TAG_HEADER_NAMES as [string, ...string[]]).optional(),
  maxTagsPerResponse: z
    .number()
    .int()
    .min(SMART_CACHE_MAX_TAGS.min)
    .max(SMART_CACHE_MAX_TAGS.max)
    .optional(),

  // 4. Scheduled Warming
  scheduledWarmingEnabled: z.boolean().optional(),
  warmingSchedule: z.string().min(1).max(100).optional(),
  warmingUrls: z.array(z.string().trim().min(1).max(512)).max(200).optional(),
  warmingConcurrency: z
    .number()
    .int()
    .min(SMART_CACHE_WARMING_CONCURRENCY.min)
    .max(SMART_CACHE_WARMING_CONCURRENCY.max)
    .optional(),
  warmingTimeoutMs: z
    .number()
    .int()
    .min(SMART_CACHE_WARMING_TIMEOUT.min)
    .max(SMART_CACHE_WARMING_TIMEOUT.max)
    .optional(),

  // 5. Background Regeneration
  backgroundRegenEnabled: z.boolean().optional(),
  regenConcurrency: z
    .number()
    .int()
    .min(SMART_CACHE_REGEN_CONCURRENCY.min)
    .max(SMART_CACHE_REGEN_CONCURRENCY.max)
    .optional(),
  regenDelayMs: z
    .number()
    .int()
    .min(SMART_CACHE_REGEN_DELAY.min)
    .max(SMART_CACHE_REGEN_DELAY.max)
    .optional(),
  regenPriorityUrls: z.array(z.string().trim().min(1).max(512)).max(50).optional(),

  // 6. Request Coalescing
  requestCoalescingEnabled: z.boolean().optional(),
  coalescingWindowMs: z
    .number()
    .int()
    .min(SMART_CACHE_COALESCING_WINDOW.min)
    .max(SMART_CACHE_COALESCING_WINDOW.max)
    .optional(),
  coalescingMaxWaiters: z
    .number()
    .int()
    .min(SMART_CACHE_COALESCING_WAITERS.min)
    .max(SMART_CACHE_COALESCING_WAITERS.max)
    .optional(),

  // 7. Cache Locking
  cacheLockingEnabled: z.boolean().optional(),
  lockTtlMs: z
    .number()
    .int()
    .min(SMART_CACHE_LOCK_TTL.min)
    .max(SMART_CACHE_LOCK_TTL.max)
    .optional(),
  lockTimeoutMs: z
    .number()
    .int()
    .min(SMART_CACHE_LOCK_TIMEOUT.min)
    .max(SMART_CACHE_LOCK_TIMEOUT.max)
    .optional(),
  lockRetryIntervalMs: z
    .number()
    .int()
    .min(SMART_CACHE_LOCK_RETRY.min)
    .max(SMART_CACHE_LOCK_RETRY.max)
    .optional(),

  // 8. Stale-While-Revalidate
  staleWhileRevalidateEnabled: z.boolean().optional(),
  staleWhileRevalidateSeconds: z
    .number()
    .int()
    .min(SMART_CACHE_SWR_SECONDS.min)
    .max(SMART_CACHE_SWR_SECONDS.max)
    .optional(),
  swiApplyToPaths: z.array(z.string().trim().min(1).max(512)).max(100).optional(),

  // 9. Stale-If-Error
  staleIfErrorEnabled: z.boolean().optional(),
  staleIfErrorSeconds: z
    .number()
    .int()
    .min(SMART_CACHE_SIE_SECONDS.min)
    .max(SMART_CACHE_SIE_SECONDS.max)
    .optional(),
  staleIfErrorCodes: z
    .array(z.number().int().min(400).max(599))
    .max(20)
    .optional(),
});


export const selectivePurgeInputSchema = z.object({
  patterns: z.array(z.string().trim().min(1).max(512)).min(1).max(100),
});

export const warmingRunInputSchema = z.object({
  urls: z.array(z.string().trim().min(1).max(512)).min(1).max(200).optional(),
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
