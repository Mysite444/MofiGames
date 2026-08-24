// Link Prefetch validation schema — Admin → Cache → Preloading &
// Prefetching. Import from here in src/app/api/link-prefetch/settings/route.ts.

import { z } from "zod";
import { LINK_PREFETCH_HOVER_DELAY_LIMITS, LINK_PREFETCH_CONCURRENCY_LIMITS } from "./link-prefetch-settings";

export const linkPrefetchSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),
  strategy: z.enum(["hover", "viewport", "eager", "disabled"]).optional(),
  hoverDelayMs: z
    .number()
    .int()
    .min(LINK_PREFETCH_HOVER_DELAY_LIMITS.min)
    .max(LINK_PREFETCH_HOVER_DELAY_LIMITS.max)
    .optional(),
  maxConcurrentPrefetches: z
    .number()
    .int()
    .min(LINK_PREFETCH_CONCURRENCY_LIMITS.min)
    .max(LINK_PREFETCH_CONCURRENCY_LIMITS.max)
    .optional(),
  excludePatterns: z.array(z.string().trim().min(1).max(256)).max(50).optional(),
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
