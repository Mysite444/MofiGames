// Static Asset Cache settings validation schemas.
// Import from here in the route handlers under
// src/app/api/admin/cache/static-assets/**.

import { z } from "zod";
import {
  STATIC_ASSET_TTL_LIMITS,
  STATIC_ASSET_SWR_LIMITS,
  SVG_INLINE_THRESHOLD_LIMITS,
  FONT_DISPLAY_STRATEGIES,
  MEDIA_PRELOAD_OPTIONS,
} from "./static-asset-cache-settings";

const ttl = () => z.number().int().min(STATIC_ASSET_TTL_LIMITS.min).max(STATIC_ASSET_TTL_LIMITS.max);
const swr = () => z.number().int().min(STATIC_ASSET_SWR_LIMITS.min).max(STATIC_ASSET_SWR_LIMITS.max);

/** Fields shared by every asset type — all optional so a PUT can patch a
 * single type without resending the other six. */
const commonAssetSchema = z.object({
  enabled: z.boolean().optional(),
  maxAge: ttl().optional(),
  cdnMaxAge: ttl().optional(),
  staleWhileRevalidate: swr().optional(),
  immutable: z.boolean().optional(),
  compressionEnabled: z.boolean().optional(),
});

const fontsSchema = commonAssetSchema.extend({
  preloadEnabled: z.boolean().optional(),
  fontDisplay: z.enum(FONT_DISPLAY_STRATEGIES).optional(),
  crossOriginEnabled: z.boolean().optional(),
});

const svgSchema = commonAssetSchema.extend({
  spriteEnabled: z.boolean().optional(),
  inlineThresholdBytes: z
    .number()
    .int()
    .min(SVG_INLINE_THRESHOLD_LIMITS.min)
    .max(SVG_INLINE_THRESHOLD_LIMITS.max)
    .optional(),
});

const iconsSchema = commonAssetSchema.extend({
  fingerprintEnabled: z.boolean().optional(),
});

const mediaSchema = commonAssetSchema.extend({
  rangeRequestsEnabled: z.boolean().optional(),
  preload: z.enum(MEDIA_PRELOAD_OPTIONS).optional(),
});

export const staticAssetCacheSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),

  css: commonAssetSchema.optional(),
  javascript: commonAssetSchema.optional(),
  fonts: fontsSchema.optional(),
  svg: svgSchema.optional(),
  icons: iconsSchema.optional(),
  videos: mediaSchema.optional(),
  audio: mediaSchema.optional(),
});
export type StaticAssetCacheSettingsInput = z.infer<typeof staticAssetCacheSettingsInputSchema>;

export const staticAssetCachePurgeInputSchema = z.object({
  scope: z.enum(["all", "css", "javascript", "fonts", "svg", "icons", "videos", "audio"]),
});
