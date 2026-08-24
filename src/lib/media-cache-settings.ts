// Shared between CacheMediaAdminClient and the API routes under
// src/app/api/admin/cache/media/**. Pure mapper, no IO.
// Mirrors the image-cache-settings.ts / feed-cache-settings.ts pattern.
// See migration 0048_media_cache.sql for the table schema.
//
// This module covers five media-caching pillars:
//   1. Videos          – long-form video files, HTTP range request support
//   2. Audio           – audio tracks and SFX, seekable range caching
//   3. Game Previews   – short animated previews shown on game cards
//   4. Loading Screens – assets displayed while a game initialises
//   5. Screenshots     – game screenshots for galleries and thumbnails

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MediaCacheSettings {
  // ── Master switch ───────────────────────────────────────────────────────────
  enabled: boolean;

  // ── 1. Videos ───────────────────────────────────────────────────────────────
  videosEnabled: boolean;
  /** CDN/browser max-age in seconds. */
  videosCacheTtlSeconds: number;
  /** Stale-while-revalidate window in seconds (0 = disabled). */
  videosSwrSeconds: number;
  /** Pass HTTP Range headers through to the cache so clients can seek without
   * re-downloading from the origin on every seek. */
  videosRangeRequestsEnabled: boolean;
  /** Offload video delivery to the CDN edge rather than serving from origin. */
  videosCdnOffloadEnabled: boolean;
  /** Files larger than this (MB) bypass the cache to protect memory/disk. */
  videosMaxFileSizeMb: number;
  videosLastPurgedAt: string | null;

  // ── 2. Audio ────────────────────────────────────────────────────────────────
  audioEnabled: boolean;
  audioCacheTtlSeconds: number;
  audioSwrSeconds: number;
  /** Required for Web Audio API and <audio> seek — range requests let the
   * browser jump to a byte offset without re-fetching from byte 0. */
  audioRangeRequestsEnabled: boolean;
  audioCdnOffloadEnabled: boolean;
  audioMaxFileSizeMb: number;
  audioLastPurgedAt: string | null;

  // ── 3. Game Previews ────────────────────────────────────────────────────────
  previewsEnabled: boolean;
  previewsCacheTtlSeconds: number;
  previewsSwrSeconds: number;
  previewsCdnOffloadEnabled: boolean;
  /** Start loading previews for game cards that are about to scroll into view. */
  previewsEagerLoadEnabled: boolean;
  /** Autoplay the preview clip when the user hovers over a game card. */
  previewsAutoplayOnHover: boolean;
  previewsLastPurgedAt: string | null;

  // ── 4. Loading Screens ──────────────────────────────────────────────────────
  loadingScreensEnabled: boolean;
  loadingScreensCacheTtlSeconds: number;
  loadingScreensSwrSeconds: number;
  loadingScreensCdnOffloadEnabled: boolean;
  /** Prefetch the loading screen asset when the user navigates to the game page
   * so there's no blank white flash before the game engine starts. */
  loadingScreensPrefetchEnabled: boolean;
  loadingScreensLastPurgedAt: string | null;

  // ── 5. Screenshots ──────────────────────────────────────────────────────────
  screenshotsEnabled: boolean;
  screenshotsCacheTtlSeconds: number;
  screenshotsSwrSeconds: number;
  screenshotsCdnOffloadEnabled: boolean;
  screenshotsLazyLoadEnabled: boolean;
  /** Transcode screenshots to WebP at serve time for smaller payloads. */
  screenshotsWebpConvertEnabled: boolean;
  screenshotsLastPurgedAt: string | null;

  // ── Diagnostics ─────────────────────────────────────────────────────────────
  lastPurgedAt: string | null;
  updatedAt: string;
}

// ── Limits ────────────────────────────────────────────────────────────────────

/** Min/max for video + audio TTL (5 min → 7 days). */
export const VIDEO_TTL_LIMITS    = { min: 300,    max: 604800   } as const;
export const VIDEO_SWR_LIMITS    = { min: 0,      max: 86400    } as const;
export const VIDEO_SIZE_LIMITS   = { min: 1,      max: 5000     } as const; // MB

/** Min/max for audio TTL (same window as video). */
export const AUDIO_TTL_LIMITS    = { min: 300,    max: 604800   } as const;
export const AUDIO_SWR_LIMITS    = { min: 0,      max: 86400    } as const;
export const AUDIO_SIZE_LIMITS   = { min: 1,      max: 2000     } as const; // MB

/** Game previews are short clips — a tighter but still useful TTL window. */
export const PREVIEWS_TTL_LIMITS = { min: 300,    max: 2592000  } as const; // max 30 days
export const PREVIEWS_SWR_LIMITS = { min: 0,      max: 86400    } as const;

/** Loading screens rarely change once published — allow very long caching. */
export const LOADING_TTL_LIMITS  = { min: 3600,   max: 31536000 } as const; // max 1 year
export const LOADING_SWR_LIMITS  = { min: 0,      max: 604800   } as const;

/** Screenshots: 1 hour → 30 days. */
export const SCREENSHOT_TTL_LIMITS = { min: 3600, max: 2592000  } as const;
export const SCREENSHOT_SWR_LIMITS = { min: 0,    max: 86400    } as const;

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_MEDIA_CACHE_SETTINGS: MediaCacheSettings = {
  enabled: false,

  // Videos
  videosEnabled:            true,
  videosCacheTtlSeconds:    86400,    // 1 day
  videosSwrSeconds:         3600,     // 1 hour SWR window
  videosRangeRequestsEnabled: true,
  videosCdnOffloadEnabled:  true,
  videosMaxFileSizeMb:      500,
  videosLastPurgedAt:       null,

  // Audio
  audioEnabled:             true,
  audioCacheTtlSeconds:     86400,    // 1 day
  audioSwrSeconds:          3600,
  audioRangeRequestsEnabled: true,
  audioCdnOffloadEnabled:   true,
  audioMaxFileSizeMb:       100,
  audioLastPurgedAt:        null,

  // Game Previews
  previewsEnabled:           true,
  previewsCacheTtlSeconds:   604800,  // 7 days
  previewsSwrSeconds:        86400,   // 1 day
  previewsCdnOffloadEnabled: true,
  previewsEagerLoadEnabled:  true,
  previewsAutoplayOnHover:   true,
  previewsLastPurgedAt:      null,

  // Loading Screens
  loadingScreensEnabled:            true,
  loadingScreensCacheTtlSeconds:    2592000, // 30 days
  loadingScreensSwrSeconds:         86400,
  loadingScreensCdnOffloadEnabled:  true,
  loadingScreensPrefetchEnabled:    true,
  loadingScreensLastPurgedAt:       null,

  // Screenshots
  screenshotsEnabled:             true,
  screenshotsCacheTtlSeconds:     604800,  // 7 days
  screenshotsSwrSeconds:          86400,
  screenshotsCdnOffloadEnabled:   true,
  screenshotsLazyLoadEnabled:     true,
  screenshotsWebpConvertEnabled:  false,
  screenshotsLastPurgedAt:        null,

  lastPurgedAt: null,
  updatedAt:    new Date(0).toISOString(),
};

// ── Mapper ────────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function ts(v: unknown): string | null {
  return v ? String(v) : null;
}

/** Maps the snake_case Supabase row to the camelCase MediaCacheSettings. */
export function mapMediaCacheRow(row: Record<string, unknown> | null): MediaCacheSettings {
  if (!row) return DEFAULT_MEDIA_CACHE_SETTINGS;
  const d = DEFAULT_MEDIA_CACHE_SETTINGS;

  return {
    enabled: Boolean(row.enabled ?? d.enabled),

    // Videos
    videosEnabled:              Boolean(row.videos_enabled            ?? d.videosEnabled),
    videosCacheTtlSeconds:      clamp(Number(row.videos_cache_ttl_seconds   ?? d.videosCacheTtlSeconds),   VIDEO_TTL_LIMITS.min,    VIDEO_TTL_LIMITS.max),
    videosSwrSeconds:           clamp(Number(row.videos_swr_seconds         ?? d.videosSwrSeconds),         VIDEO_SWR_LIMITS.min,    VIDEO_SWR_LIMITS.max),
    videosRangeRequestsEnabled: Boolean(row.videos_range_requests_enabled   ?? d.videosRangeRequestsEnabled),
    videosCdnOffloadEnabled:    Boolean(row.videos_cdn_offload_enabled      ?? d.videosCdnOffloadEnabled),
    videosMaxFileSizeMb:        clamp(Number(row.videos_max_file_size_mb    ?? d.videosMaxFileSizeMb),      VIDEO_SIZE_LIMITS.min,   VIDEO_SIZE_LIMITS.max),
    videosLastPurgedAt:         ts(row.videos_last_purged_at),

    // Audio
    audioEnabled:               Boolean(row.audio_enabled             ?? d.audioEnabled),
    audioCacheTtlSeconds:       clamp(Number(row.audio_cache_ttl_seconds    ?? d.audioCacheTtlSeconds),     AUDIO_TTL_LIMITS.min,    AUDIO_TTL_LIMITS.max),
    audioSwrSeconds:            clamp(Number(row.audio_swr_seconds          ?? d.audioSwrSeconds),           AUDIO_SWR_LIMITS.min,    AUDIO_SWR_LIMITS.max),
    audioRangeRequestsEnabled:  Boolean(row.audio_range_requests_enabled    ?? d.audioRangeRequestsEnabled),
    audioCdnOffloadEnabled:     Boolean(row.audio_cdn_offload_enabled       ?? d.audioCdnOffloadEnabled),
    audioMaxFileSizeMb:         clamp(Number(row.audio_max_file_size_mb     ?? d.audioMaxFileSizeMb),       AUDIO_SIZE_LIMITS.min,   AUDIO_SIZE_LIMITS.max),
    audioLastPurgedAt:          ts(row.audio_last_purged_at),

    // Game Previews
    previewsEnabled:             Boolean(row.previews_enabled           ?? d.previewsEnabled),
    previewsCacheTtlSeconds:     clamp(Number(row.previews_cache_ttl_seconds  ?? d.previewsCacheTtlSeconds),   PREVIEWS_TTL_LIMITS.min, PREVIEWS_TTL_LIMITS.max),
    previewsSwrSeconds:          clamp(Number(row.previews_swr_seconds        ?? d.previewsSwrSeconds),         PREVIEWS_SWR_LIMITS.min, PREVIEWS_SWR_LIMITS.max),
    previewsCdnOffloadEnabled:   Boolean(row.previews_cdn_offload_enabled  ?? d.previewsCdnOffloadEnabled),
    previewsEagerLoadEnabled:    Boolean(row.previews_eager_load_enabled   ?? d.previewsEagerLoadEnabled),
    previewsAutoplayOnHover:     Boolean(row.previews_autoplay_on_hover    ?? d.previewsAutoplayOnHover),
    previewsLastPurgedAt:        ts(row.previews_last_purged_at),

    // Loading Screens
    loadingScreensEnabled:            Boolean(row.loading_screens_enabled           ?? d.loadingScreensEnabled),
    loadingScreensCacheTtlSeconds:    clamp(Number(row.loading_screens_cache_ttl_seconds  ?? d.loadingScreensCacheTtlSeconds), LOADING_TTL_LIMITS.min, LOADING_TTL_LIMITS.max),
    loadingScreensSwrSeconds:         clamp(Number(row.loading_screens_swr_seconds        ?? d.loadingScreensSwrSeconds),      LOADING_SWR_LIMITS.min, LOADING_SWR_LIMITS.max),
    loadingScreensCdnOffloadEnabled:  Boolean(row.loading_screens_cdn_offload_enabled ?? d.loadingScreensCdnOffloadEnabled),
    loadingScreensPrefetchEnabled:    Boolean(row.loading_screens_prefetch_enabled    ?? d.loadingScreensPrefetchEnabled),
    loadingScreensLastPurgedAt:       ts(row.loading_screens_last_purged_at),

    // Screenshots
    screenshotsEnabled:             Boolean(row.screenshots_enabled            ?? d.screenshotsEnabled),
    screenshotsCacheTtlSeconds:     clamp(Number(row.screenshots_cache_ttl_seconds  ?? d.screenshotsCacheTtlSeconds), SCREENSHOT_TTL_LIMITS.min, SCREENSHOT_TTL_LIMITS.max),
    screenshotsSwrSeconds:          clamp(Number(row.screenshots_swr_seconds        ?? d.screenshotsSwrSeconds),      SCREENSHOT_SWR_LIMITS.min, SCREENSHOT_SWR_LIMITS.max),
    screenshotsCdnOffloadEnabled:   Boolean(row.screenshots_cdn_offload_enabled  ?? d.screenshotsCdnOffloadEnabled),
    screenshotsLazyLoadEnabled:     Boolean(row.screenshots_lazy_load_enabled    ?? d.screenshotsLazyLoadEnabled),
    screenshotsWebpConvertEnabled:  Boolean(row.screenshots_webp_convert_enabled  ?? d.screenshotsWebpConvertEnabled),
    screenshotsLastPurgedAt:        ts(row.screenshots_last_purged_at),

    lastPurgedAt: ts(row.last_purged_at),
    updatedAt:    String(row.updated_at ?? d.updatedAt),
  };
}
