// Resource Hints validation schema — Admin → Cache → Preloading &
// Prefetching. Import from here in src/app/api/resource-hints/settings/route.ts.

import { z } from "zod";
import { RESOURCE_HINT_AS_VALUES, RESOURCE_HINT_FETCH_PRIORITIES } from "./resource-hint-settings";

const resourceHintInputSchema = z.object({
  id: z.string().trim().min(1).max(32).optional(),
  href: z.string().trim().min(1).max(2048),
  as: z.enum(RESOURCE_HINT_AS_VALUES as [string, ...string[]]),
  type: z.string().trim().max(255).optional().default(""),
  crossorigin: z.boolean().optional().default(false),
  fetchPriority: z.enum(RESOURCE_HINT_FETCH_PRIORITIES as [string, ...string[]]).optional().default("auto"),
});

export const resourceHintSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),
  hints: z.array(resourceHintInputSchema).max(50).optional(),
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
