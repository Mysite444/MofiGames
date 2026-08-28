// Speculative Loading validation schema — Admin → Cache → Preloading &
// Prefetching. Import from here in
// src/app/api/speculative-loading/settings/route.ts.

import { z } from "zod";

export const speculativeLoadingSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["prefetch", "prerender"]).optional(),
  eagerness: z.enum(["conservative", "moderate", "eager", "immediate"]).optional(),
  includePatterns: z.array(z.string().trim().min(1).max(256)).max(50).optional(),
  excludePatterns: z.array(z.string().trim().min(1).max(256)).max(50).optional(),
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
