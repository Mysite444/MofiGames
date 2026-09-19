// Cache Preloading validation schema — Admin → Cache → Preloading &
// Prefetching. Import from here in the route handlers under
// src/app/api/admin/cache/preloading/**.

import { z } from "zod";
import { CACHE_PRELOAD_CONCURRENCY_LIMITS, CACHE_PRELOAD_TIMEOUT_LIMITS } from "./cache-preload-settings";

export const cachePreloadSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),
  preloadUrls: z.array(z.string().trim().min(1).max(512)).max(100).optional(),
  concurrency: z
    .number()
    .int()
    .min(CACHE_PRELOAD_CONCURRENCY_LIMITS.min)
    .max(CACHE_PRELOAD_CONCURRENCY_LIMITS.max)
    .optional(),
  requestTimeoutMs: z
    .number()
    .int()
    .min(CACHE_PRELOAD_TIMEOUT_LIMITS.min)
    .max(CACHE_PRELOAD_TIMEOUT_LIMITS.max)
    .optional(),
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
