// Fragment Cache settings validation schemas — standalone module so the
// diff to validation.ts is trivially reviewable, same pattern as
// validation-php-opcode.ts; import from here in the route handlers.

import { z } from "zod";

export const fragmentDefinitionInputSchema = z.object({
  key: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(80),
  ttlSeconds: z.number().int().min(5).max(86400),
  enabled: z.boolean(),
});

export const fragmentCacheSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),
  defaultTtlSeconds: z.number().int().min(5).max(86400).optional(),
  maxEntries: z.number().int().min(20).max(20000).optional(),
  staleWhileRevalidateSeconds: z.number().int().min(0).max(600).optional(),
  bypassForAdmins: z.boolean().optional(),
  varyByLocale: z.boolean().optional(),
  fragments: z.array(fragmentDefinitionInputSchema).max(64).optional(),
});

export const fragmentCachePurgeInputSchema = z.object({
  scope: z.enum(["all", "fragment"]),
  key: z.string().trim().min(1).max(64).optional(),
});
