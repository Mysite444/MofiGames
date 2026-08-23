// PHP OPcache settings validation schemas — append these exports to
// src/lib/validation.ts (after the DB Optimisation section at the bottom).
//
// This file exists as a standalone module so the diff to validation.ts
// is trivially reviewable; import from here in the route handlers, or
// copy-paste the exports into validation.ts.

import { z } from "zod";

// ── PHP OPcache ─────────────────────────────────────────────────────────────

export const phpOpcacheSettingsInputSchema = z.object({
  // 1. OPcache
  opcacheEnabled:               z.boolean().optional(),
  opcacheMemoryConsumptionMb:   z.number().int().min(16).max(1024).optional(),
  opcacheMaxAcceleratedFiles:   z.number().int().min(200).max(1000000).optional(),
  opcacheMaxWastedPercentage:   z.number().int().min(1).max(50).optional(),
  opcacheRevalidateFreqSeconds: z.number().int().min(0).max(3600).optional(),
  opcacheSaveComments:          z.boolean().optional(),
  opcacheValidatePermission:    z.boolean().optional(),
  opcacheFileCacheEnabled:      z.boolean().optional(),
  opcacheFileCachePath:         z.string().trim().max(512).optional(),
  opcacheFileCacheOnly:         z.boolean().optional(),

  // 2. JIT
  jitEnabled:               z.boolean().optional(),
  jitMode:                  z.enum(["off", "tracing", "function"]).optional(),
  jitBufferSizeMb:          z.number().int().min(8).max(512).optional(),
  jitHotFunctionThreshold:  z.number().int().min(0).max(4096).optional(),
  jitMaxRootTraces:         z.number().int().min(64).max(32768).optional(),

  // 3. Preloading
  preloadEnabled:     z.boolean().optional(),
  preloadScriptPath:  z.string().trim().max(512).optional(),
  preloadUser:        z.string().trim().min(1).max(64).optional(),

  // 4. Interned Strings
  internedStringsBufferMb: z.number().int().min(4).max(512).optional(),
});

export const phpOpcacheStatusActionSchema = z.object({
  action: z.enum(["check", "reset"]),
});
