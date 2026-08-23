// Image Cache settings validation schemas.
// Import from here in the route handlers under
// src/app/api/admin/cache/image/**.

import { z } from "zod";
import {
  IMAGE_QUALITY_LIMITS,
  IMAGE_EFFORT_LIMITS,
  IMAGE_TTL_LIMITS,
  IMAGE_SWR_LIMITS,
  THUMBNAIL_VARIANTS_LIMITS,
  RESIZE_CACHE_MAX_LIMITS,
  RESIZE_DIM_LIMITS,
  LAZY_THRESHOLD_LIMITS,
} from "./image-cache-settings";

const srcsetBreakpointSchema = z.object({
  width:   z.number().int().min(16).max(8192),
  density: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const imageCacheSettingsInputSchema = z.object({
  // Master
  enabled: z.boolean().optional(),

  // WebP
  webpEnabled:       z.boolean().optional(),
  webpQuality:       z.number().int().min(IMAGE_QUALITY_LIMITS.min).max(IMAGE_QUALITY_LIMITS.max).optional(),
  webpKeepOriginal:  z.boolean().optional(),
  webpSizeThreshold: z.number().min(0).max(1).optional(),

  // AVIF
  avifEnabled:       z.boolean().optional(),
  avifQuality:       z.number().int().min(IMAGE_QUALITY_LIMITS.min).max(IMAGE_QUALITY_LIMITS.max).optional(),
  avifKeepOriginal:  z.boolean().optional(),
  avifEffort:        z.number().int().min(IMAGE_EFFORT_LIMITS.min).max(IMAGE_EFFORT_LIMITS.max).optional(),

  // Responsive
  responsiveEnabled:     z.boolean().optional(),
  srcsetBreakpoints:     z.array(srcsetBreakpointSchema).min(1).max(20).optional(),
  pictureElementEnabled: z.boolean().optional(),
  sizesAttribute:        z.string().trim().max(256).optional(),

  // Thumbnail Cache
  thumbnailCacheEnabled:  z.boolean().optional(),
  thumbnailCacheTtl:      z.number().int().min(IMAGE_TTL_LIMITS.min).max(IMAGE_TTL_LIMITS.max).optional(),
  thumbnailStorageDriver: z.enum(["disk", "object-store"]).optional(),
  thumbnailMaxVariants:   z.number().int().min(THUMBNAIL_VARIANTS_LIMITS.min).max(THUMBNAIL_VARIANTS_LIMITS.max).optional(),

  // Lazy Loading
  lazyLoadEnabled:    z.boolean().optional(),
  lazyLoadStrategy:   z.enum(["native", "observer", "both"]).optional(),
  lazyLoadRootMargin: z.string().trim().max(64).optional(),
  lazyLoadThreshold:  z.number().min(LAZY_THRESHOLD_LIMITS.min).max(LAZY_THRESHOLD_LIMITS.max).optional(),
  lqipEnabled:        z.boolean().optional(),
  placeholderColor:   z.string().trim().max(32).optional(),

  // Image Optimisation Cache
  optimisationCacheEnabled: z.boolean().optional(),
  optimisationCacheTtl:     z.number().int().min(IMAGE_TTL_LIMITS.min).max(IMAGE_TTL_LIMITS.max).optional(),
  optimisationCacheSwr:     z.number().int().min(IMAGE_SWR_LIMITS.min).max(IMAGE_SWR_LIMITS.max).optional(),
  varyByAccept:             z.boolean().optional(),

  // Image Resizing Cache
  resizingCacheEnabled:    z.boolean().optional(),
  resizingCacheTtl:        z.number().int().min(IMAGE_TTL_LIMITS.min).max(IMAGE_TTL_LIMITS.max).optional(),
  resizingCacheMaxEntries: z.number().int().min(RESIZE_CACHE_MAX_LIMITS.min).max(RESIZE_CACHE_MAX_LIMITS.max).optional(),
  defaultFit:              z.enum(["cover", "contain", "fill", "inside", "outside"]).optional(),
  defaultQuality:          z.number().int().min(IMAGE_QUALITY_LIMITS.min).max(IMAGE_QUALITY_LIMITS.max).optional(),
  maxResizeWidth:          z.number().int().min(RESIZE_DIM_LIMITS.min).max(RESIZE_DIM_LIMITS.max).optional(),
  maxResizeHeight:         z.number().int().min(RESIZE_DIM_LIMITS.min).max(RESIZE_DIM_LIMITS.max).optional(),
});


export const imageCachePurgeInputSchema = z.object({
  scope: z.enum(["all", "thumbnails", "resized", "optimised"]),
});
