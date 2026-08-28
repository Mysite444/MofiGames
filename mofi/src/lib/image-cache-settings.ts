// Shared between CacheImageAdminClient and the API routes under
// src/app/api/admin/cache/image/**. Pure mapper, no IO.
// Mirrors the api-cache-settings.ts / fragment-cache-settings.ts pattern.
// See migration 0041_image_cache.sql for the table schema.
//
// This module covers seven image-optimisation pillars:
//   1. WebP Generation        – transcode uploads to WebP at save time
//   2. AVIF Generation        – transcode uploads to AVIF (smaller, slower)
//   3. Responsive Images      – emit srcset breakpoints + <picture> helpers
//   4. Thumbnail Cache        – persist generated thumbnails to storage
//   5. Lazy Loading           – loading="lazy" + IntersectionObserver config
//   6. Image Optimisation Cache – in-process/CDN response cache for /api/image
//   7. Image Resizing Cache   – cache resized variants keyed by (src, w, h, q)

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImageFit    = "cover" | "contain" | "fill" | "inside" | "outside";
export type LazyLoadStrategy = "native" | "observer" | "both";

export const IMAGE_FIT_OPTIONS:      ImageFit[]           = ["cover", "contain", "fill", "inside", "outside"];
export const LAZY_LOAD_STRATEGIES:   LazyLoadStrategy[]   = ["native", "observer", "both"];

/** One breakpoint in the responsive srcset ladder. */
export interface SrcsetBreakpoint {
  /** Width in CSS pixels, e.g. 320, 640, 1280. */
  width: number;
  /** Optional explicit pixel-density multiplier (1, 2, 3). */
  density: 1 | 2 | 3;
}

export interface ImageCacheSettings {
  // ── Master switch ───────────────────────────────────────────────────────────
  enabled: boolean;

  // ── 1. WebP Generation ──────────────────────────────────────────────────────
  webpEnabled:         boolean;
  /** Quality 1-100. 80 is a good default — visually lossless for most images. */
  webpQuality:         number;
  /** Also keep the original format alongside the WebP transcode. */
  webpKeepOriginal:    boolean;
  /** Minimum file-size saving (0-1) required to keep the WebP; if the
   * encoded WebP is not smaller than the original × (1 - threshold) the
   * original is served instead. 0 = always use WebP. */
  webpSizeThreshold:   number;

  // ── 2. AVIF Generation ──────────────────────────────────────────────────────
  avifEnabled:         boolean;
  /** Quality 1-100. AVIF at 60 is typically equivalent to WebP at 80. */
  avifQuality:         number;
  avifKeepOriginal:    boolean;
  /** Encoding effort 0-10 (higher = smaller file, slower). 4 is default. */
  avifEffort:          number;

  // ── 3. Responsive Images ────────────────────────────────────────────────────
  responsiveEnabled:      boolean;
  /** Pixel-width breakpoints to generate for each image. */
  srcsetBreakpoints:      SrcsetBreakpoint[];
  /** Emit a <picture> element wrapping each <img> for AVIF/WebP fallback. */
  pictureElementEnabled:  boolean;
  /** sizes="" attribute hint written into generated markup.
   * e.g. "(max-width: 768px) 100vw, 50vw" */
  sizesAttribute:         string;

  // ── 4. Thumbnail Cache ───────────────────────────────────────────────────────
  thumbnailCacheEnabled:   boolean;
  /** TTL for cached thumbnails in seconds. */
  thumbnailCacheTtl:       number;
  /** Thumbnail storage driver: "disk" writes to /public/cache/thumbs,
   * "object-store" writes to the configured S3-compatible bucket. */
  thumbnailStorageDriver:  "disk" | "object-store";
  /** Max number of thumbnail variants kept per source image. Older variants
   * are evicted LRU-style when this limit is reached. */
  thumbnailMaxVariants:    number;

  // ── 5. Lazy Loading ──────────────────────────────────────────────────────────
  lazyLoadEnabled:         boolean;
  lazyLoadStrategy:        LazyLoadStrategy;
  /** IntersectionObserver rootMargin — how far before the image enters the
   * viewport to start loading. "200px 0px" pre-loads images 200 px ahead. */
  lazyLoadRootMargin:      string;
  /** IntersectionObserver threshold (0.0-1.0). */
  lazyLoadThreshold:       number;
  /** Base64 LQIP (low-quality image placeholder) shown while image loads. */
  lqipEnabled:             boolean;
  /** Blur-up placeholder colour used when LQIP is disabled. CSS colour string. */
  placeholderColor:        string;

  // ── 6. Image Optimisation Cache ──────────────────────────────────────────────
  optimisationCacheEnabled:  boolean;
  /** Cache-Control max-age for /api/image responses (seconds). */
  optimisationCacheTtl:      number;
  /** Stale-while-revalidate window (seconds). 0 disables. */
  optimisationCacheSwr:      number;
  /** Accept-header format negotiation via Vary: Accept header. */
  varyByAccept:              boolean;

  // ── 7. Image Resizing Cache ──────────────────────────────────────────────────
  resizingCacheEnabled:      boolean;
  /** TTL for resized image variants in seconds. */
  resizingCacheTtl:          number;
  /** Max in-memory entries for the resize LRU cache. */
  resizingCacheMaxEntries:   number;
  /** Default fit mode used when the caller doesn't specify one. */
  defaultFit:                ImageFit;
  /** Default output quality used when the caller doesn't specify one. */
  defaultQuality:            number;
  /** Upper bound on resize dimensions to reject abusive requests. */
  maxResizeWidth:            number;
  maxResizeHeight:           number;

  // ── Diagnostics ───────────────────────────────────────────────────────────────
  lastPurgedAt:  string | null;
  updatedAt:     string;
}

// ── Limits ────────────────────────────────────────────────────────────────────

export const IMAGE_QUALITY_LIMITS    = { min: 1,  max: 100    } as const;
export const IMAGE_EFFORT_LIMITS     = { min: 0,  max: 10     } as const;
export const IMAGE_TTL_LIMITS        = { min: 0,  max: 604800 } as const; // 0–7 days
export const IMAGE_SWR_LIMITS        = { min: 0,  max: 3600   } as const;
export const THUMBNAIL_VARIANTS_LIMITS = { min: 1, max: 200   } as const;
export const RESIZE_CACHE_MAX_LIMITS = { min: 100, max: 50000 } as const;
export const RESIZE_DIM_LIMITS       = { min: 16, max: 8192   } as const;
export const LAZY_THRESHOLD_LIMITS   = { min: 0,  max: 1      } as const;

// ── Default srcset breakpoints ─────────────────────────────────────────────────

export const DEFAULT_SRCSET_BREAKPOINTS: SrcsetBreakpoint[] = [
  { width: 320,  density: 1 },
  { width: 640,  density: 1 },
  { width: 768,  density: 1 },
  { width: 1024, density: 1 },
  { width: 1280, density: 1 },
  { width: 1920, density: 1 },
];

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_IMAGE_CACHE_SETTINGS: ImageCacheSettings = {
  enabled: false,

  // WebP
  webpEnabled:        true,
  webpQuality:        80,
  webpKeepOriginal:   true,
  webpSizeThreshold:  0.05,

  // AVIF
  avifEnabled:        false,
  avifQuality:        60,
  avifKeepOriginal:   true,
  avifEffort:         4,

  // Responsive
  responsiveEnabled:      false,
  srcsetBreakpoints:      DEFAULT_SRCSET_BREAKPOINTS,
  pictureElementEnabled:  true,
  sizesAttribute:         "(max-width: 768px) 100vw, 50vw",

  // Thumbnail Cache
  thumbnailCacheEnabled:   false,
  thumbnailCacheTtl:       86400,   // 1 day
  thumbnailStorageDriver:  "disk",
  thumbnailMaxVariants:    20,

  // Lazy Loading
  lazyLoadEnabled:         true,
  lazyLoadStrategy:        "both",
  lazyLoadRootMargin:      "200px 0px",
  lazyLoadThreshold:       0,
  lqipEnabled:             false,
  placeholderColor:        "#1a1a2e",

  // Image Optimisation Cache
  optimisationCacheEnabled: false,
  optimisationCacheTtl:     3600,   // 1 hour
  optimisationCacheSwr:     60,
  varyByAccept:             true,

  // Image Resizing Cache
  resizingCacheEnabled:     false,
  resizingCacheTtl:         86400,  // 1 day
  resizingCacheMaxEntries:  5000,
  defaultFit:               "cover",
  defaultQuality:           80,
  maxResizeWidth:           3840,
  maxResizeHeight:          3840,

  lastPurgedAt: null,
  updatedAt:    new Date(0).toISOString(),
};

// ── Mapper ────────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function mapSrcsetBreakpoints(raw: unknown): SrcsetBreakpoint[] {
  if (!Array.isArray(raw)) return DEFAULT_SRCSET_BREAKPOINTS;
  const out: SrcsetBreakpoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const width   = Number(r.width ?? 640);
    const density = ([1, 2, 3] as const).includes(Number(r.density) as 1|2|3)
      ? (Number(r.density) as 1 | 2 | 3)
      : 1;
    if (width >= 16 && width <= 8192) out.push({ width, density });
  }
  return out.length > 0 ? out : DEFAULT_SRCSET_BREAKPOINTS;
}

/** Maps the snake_case Supabase row to the camelCase ImageCacheSettings. */
export function mapImageCacheRow(row: Record<string, unknown> | null): ImageCacheSettings {
  if (!row) return DEFAULT_IMAGE_CACHE_SETTINGS;
  const d = DEFAULT_IMAGE_CACHE_SETTINGS;

  const rawFit = String(row.default_fit ?? d.defaultFit);
  const defaultFit: ImageFit = IMAGE_FIT_OPTIONS.includes(rawFit as ImageFit)
    ? (rawFit as ImageFit)
    : d.defaultFit;

  const rawDriver = String(row.thumbnail_storage_driver ?? d.thumbnailStorageDriver);
  const thumbnailStorageDriver: "disk" | "object-store" =
    rawDriver === "object-store" ? "object-store" : "disk";

  const rawStrategy = String(row.lazy_load_strategy ?? d.lazyLoadStrategy);
  const lazyLoadStrategy: LazyLoadStrategy = LAZY_LOAD_STRATEGIES.includes(rawStrategy as LazyLoadStrategy)
    ? (rawStrategy as LazyLoadStrategy)
    : d.lazyLoadStrategy;

  return {
    enabled: Boolean(row.enabled ?? d.enabled),

    // WebP
    webpEnabled:       Boolean(row.webp_enabled       ?? d.webpEnabled),
    webpQuality:       clamp(Number(row.webp_quality ?? d.webpQuality), IMAGE_QUALITY_LIMITS.min, IMAGE_QUALITY_LIMITS.max),
    webpKeepOriginal:  Boolean(row.webp_keep_original ?? d.webpKeepOriginal),
    webpSizeThreshold: clamp(Number(row.webp_size_threshold ?? d.webpSizeThreshold), 0, 1),

    // AVIF
    avifEnabled:       Boolean(row.avif_enabled       ?? d.avifEnabled),
    avifQuality:       clamp(Number(row.avif_quality  ?? d.avifQuality), IMAGE_QUALITY_LIMITS.min, IMAGE_QUALITY_LIMITS.max),
    avifKeepOriginal:  Boolean(row.avif_keep_original ?? d.avifKeepOriginal),
    avifEffort:        clamp(Number(row.avif_effort   ?? d.avifEffort), IMAGE_EFFORT_LIMITS.min, IMAGE_EFFORT_LIMITS.max),

    // Responsive
    responsiveEnabled:     Boolean(row.responsive_enabled      ?? d.responsiveEnabled),
    srcsetBreakpoints:     mapSrcsetBreakpoints(row.srcset_breakpoints),
    pictureElementEnabled: Boolean(row.picture_element_enabled ?? d.pictureElementEnabled),
    sizesAttribute:        typeof row.sizes_attribute === "string" ? row.sizes_attribute : d.sizesAttribute,

    // Thumbnail Cache
    thumbnailCacheEnabled:  Boolean(row.thumbnail_cache_enabled  ?? d.thumbnailCacheEnabled),
    thumbnailCacheTtl:      clamp(Number(row.thumbnail_cache_ttl ?? d.thumbnailCacheTtl), IMAGE_TTL_LIMITS.min, IMAGE_TTL_LIMITS.max),
    thumbnailStorageDriver,
    thumbnailMaxVariants:   clamp(Number(row.thumbnail_max_variants ?? d.thumbnailMaxVariants), THUMBNAIL_VARIANTS_LIMITS.min, THUMBNAIL_VARIANTS_LIMITS.max),

    // Lazy Loading
    lazyLoadEnabled:    Boolean(row.lazy_load_enabled    ?? d.lazyLoadEnabled),
    lazyLoadStrategy,
    lazyLoadRootMargin: typeof row.lazy_load_root_margin === "string" ? row.lazy_load_root_margin : d.lazyLoadRootMargin,
    lazyLoadThreshold:  clamp(Number(row.lazy_load_threshold ?? d.lazyLoadThreshold), LAZY_THRESHOLD_LIMITS.min, LAZY_THRESHOLD_LIMITS.max),
    lqipEnabled:        Boolean(row.lqip_enabled         ?? d.lqipEnabled),
    placeholderColor:   typeof row.placeholder_color === "string" ? row.placeholder_color : d.placeholderColor,

    // Image Optimisation Cache
    optimisationCacheEnabled: Boolean(row.optimisation_cache_enabled ?? d.optimisationCacheEnabled),
    optimisationCacheTtl:     clamp(Number(row.optimisation_cache_ttl ?? d.optimisationCacheTtl), IMAGE_TTL_LIMITS.min, IMAGE_TTL_LIMITS.max),
    optimisationCacheSwr:     clamp(Number(row.optimisation_cache_swr ?? d.optimisationCacheSwr), IMAGE_SWR_LIMITS.min, IMAGE_SWR_LIMITS.max),
    varyByAccept:             Boolean(row.vary_by_accept ?? d.varyByAccept),

    // Image Resizing Cache
    resizingCacheEnabled:    Boolean(row.resizing_cache_enabled    ?? d.resizingCacheEnabled),
    resizingCacheTtl:        clamp(Number(row.resizing_cache_ttl ?? d.resizingCacheTtl), IMAGE_TTL_LIMITS.min, IMAGE_TTL_LIMITS.max),
    resizingCacheMaxEntries: clamp(Number(row.resizing_cache_max_entries ?? d.resizingCacheMaxEntries), RESIZE_CACHE_MAX_LIMITS.min, RESIZE_CACHE_MAX_LIMITS.max),
    defaultFit,
    defaultQuality: clamp(Number(row.default_quality ?? d.defaultQuality), IMAGE_QUALITY_LIMITS.min, IMAGE_QUALITY_LIMITS.max),
    maxResizeWidth: clamp(Number(row.max_resize_width ?? d.maxResizeWidth), RESIZE_DIM_LIMITS.min, RESIZE_DIM_LIMITS.max),
    maxResizeHeight: clamp(Number(row.max_resize_height ?? d.maxResizeHeight), RESIZE_DIM_LIMITS.min, RESIZE_DIM_LIMITS.max),

    lastPurgedAt: row.last_purged_at ? String(row.last_purged_at) : null,
    updatedAt:    String(row.updated_at ?? d.updatedAt),
  };
}


