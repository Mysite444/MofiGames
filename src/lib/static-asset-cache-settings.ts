// Shared between CacheStaticAssetsAdminClient and the API routes under
// src/app/api/admin/cache/static-assets/**. Pure mapper, no IO.
// Mirrors the image-cache-settings.ts / api-cache-settings.ts pattern.
// See migration 0042_static_asset_cache.sql for the table schema.
//
// "Static Asset Cache" gives each of the seven static-asset families its own
// Cache-Control policy. This is distinct from Browser Cache's versioned
// Storage buckets (content images, thumbnails, uploaded media) — those are
// user-uploaded files stamped with an upload timestamp. This section covers
// the site's *own* static assets served from /public and custom asset
// pipelines: hand-authored CSS/JS, self-hosted fonts, SVG icon sets, PWA/
// favicon assets, and game trailer / soundtrack media — most of which are
// NOT automatically content-hashed the way /_next/static build output is.
//
//   1. CSS      – stylesheet Cache-Control + CDN edge TTL
//   2. JavaScript – script Cache-Control + CDN edge TTL
//   3. Fonts    – long-lived Cache-Control + preload hints + font-display +
//                 cross-origin header (required for cross-origin @font-face)
//   4. SVG      – Cache-Control + optional sprite-sheet bundling + inline
//                 threshold (small SVGs inlined instead of cached as requests)
//   5. Icons    – favicons / PWA / app icons, with optional filename
//                 fingerprinting so updates aren't stuck behind a long TTL
//   6. Videos   – Cache-Control + HTTP Range request support for scrubbing
//   7. Audio    – Cache-Control + HTTP Range request support for seeking

// ── Types ────────────────────────────────────────────────────────────────────

export const FONT_DISPLAY_STRATEGIES = ["auto", "block", "swap", "fallback", "optional"] as const;
export type FontDisplayStrategy = (typeof FONT_DISPLAY_STRATEGIES)[number];

export const MEDIA_PRELOAD_OPTIONS = ["none", "metadata", "auto"] as const;
export type MediaPreload = (typeof MEDIA_PRELOAD_OPTIONS)[number];

/** Fields shared by every asset type. */
export interface StaticAssetTypeConfig {
  enabled: boolean;
  /** Browser Cache-Control max-age, in seconds. */
  maxAge: number;
  /** CDN/edge s-maxage, in seconds — may exceed the browser TTL so the edge
   * keeps serving cached copies while a browser has already re-validated. */
  cdnMaxAge: number;
  /** stale-while-revalidate window, in seconds. 0 disables. */
  staleWhileRevalidate: number;
  /** Adds the `immutable` Cache-Control directive. Only safe when filenames
   * are content-hashed / fingerprinted — otherwise an update would never
   * reach returning visitors within the TTL window. */
  immutable: boolean;
  /** Negotiate gzip/brotli via Accept-Encoding and send Vary: Accept-Encoding. */
  compressionEnabled: boolean;
}

export interface FontAssetConfig extends StaticAssetTypeConfig {
  /** Emit <link rel="preload" as="font"> for above-the-fold fonts. */
  preloadEnabled: boolean;
  /** CSS font-display value written into the @font-face rule. */
  fontDisplay: FontDisplayStrategy;
  /** Adds crossorigin="anonymous" / Access-Control-Allow-Origin — required
   * whenever fonts are served from a different origin than the page (e.g. a CDN). */
  crossOriginEnabled: boolean;
}

export interface SvgAssetConfig extends StaticAssetTypeConfig {
  /** Bundle icon SVGs into a single cached sprite sheet instead of one
   * request per icon. */
  spriteEnabled: boolean;
  /** SVGs at or under this size (bytes) are inlined as data: URIs instead of
   * cached as separate network requests. 0 disables inlining. */
  inlineThresholdBytes: number;
}

export interface IconAssetConfig extends StaticAssetTypeConfig {
  /** Append a content hash to favicon / app-icon filenames so an update
   * busts the cache instead of waiting out the TTL. */
  fingerprintEnabled: boolean;
}

export interface MediaAssetConfig extends StaticAssetTypeConfig {
  /** Send Accept-Ranges: bytes and honour Range requests — required for
   * seeking/scrubbing in the player instead of downloading the whole file. */
  rangeRequestsEnabled: boolean;
  /** HTML5 preload attribute hint for <video>/<audio> elements. */
  preload: MediaPreload;
}

export interface StaticAssetCacheSettings {
  /** Master switch — disables all seven asset-type policies without
   * discarding their individual configuration. */
  enabled: boolean;

  css: StaticAssetTypeConfig;
  javascript: StaticAssetTypeConfig;
  fonts: FontAssetConfig;
  svg: SvgAssetConfig;
  icons: IconAssetConfig;
  videos: MediaAssetConfig;
  audio: MediaAssetConfig;

  // ── Diagnostics ────────────────────────────────────────────────────────────
  lastPurgedAt: string | null;
  updatedAt: string;
}

export type StaticAssetKind = "css" | "javascript" | "fonts" | "svg" | "icons" | "videos" | "audio";

// ── Limits ───────────────────────────────────────────────────────────────────

export const STATIC_ASSET_TTL_LIMITS = { min: 0, max: 31536000 } as const; // 0 – 1 year
export const STATIC_ASSET_SWR_LIMITS = { min: 0, max: 2592000 } as const; // 0 – 30 days
export const SVG_INLINE_THRESHOLD_LIMITS = { min: 0, max: 65536 } as const; // 0 – 64 KB

// ── Defaults ─────────────────────────────────────────────────────────────────

const YEAR = 31536000;
const WEEK = 604800;
const DAY = 86400;
const MONTH = 2592000;

export const DEFAULT_CSS_CONFIG: StaticAssetTypeConfig = {
  enabled: true,
  maxAge: YEAR,
  cdnMaxAge: YEAR,
  staleWhileRevalidate: DAY,
  immutable: true,
  compressionEnabled: true,
};

export const DEFAULT_JS_CONFIG: StaticAssetTypeConfig = {
  enabled: true,
  maxAge: YEAR,
  cdnMaxAge: YEAR,
  staleWhileRevalidate: DAY,
  immutable: true,
  compressionEnabled: true,
};

export const DEFAULT_FONTS_CONFIG: FontAssetConfig = {
  enabled: true,
  maxAge: YEAR,
  cdnMaxAge: YEAR,
  staleWhileRevalidate: WEEK,
  immutable: true,
  compressionEnabled: true,
  preloadEnabled: true,
  fontDisplay: "swap",
  crossOriginEnabled: true,
};

export const DEFAULT_SVG_CONFIG: SvgAssetConfig = {
  enabled: true,
  maxAge: MONTH,
  cdnMaxAge: MONTH,
  staleWhileRevalidate: DAY,
  immutable: false,
  compressionEnabled: true,
  spriteEnabled: false,
  inlineThresholdBytes: 4096,
};

export const DEFAULT_ICONS_CONFIG: IconAssetConfig = {
  enabled: true,
  maxAge: WEEK,
  cdnMaxAge: WEEK,
  staleWhileRevalidate: DAY,
  immutable: false,
  compressionEnabled: true,
  fingerprintEnabled: false,
};

export const DEFAULT_VIDEOS_CONFIG: MediaAssetConfig = {
  enabled: true,
  maxAge: WEEK,
  cdnMaxAge: MONTH,
  staleWhileRevalidate: DAY,
  immutable: false,
  compressionEnabled: false, // already-compressed media; gzip/brotli buys nothing
  rangeRequestsEnabled: true,
  preload: "metadata",
};

export const DEFAULT_AUDIO_CONFIG: MediaAssetConfig = {
  enabled: true,
  maxAge: WEEK,
  cdnMaxAge: MONTH,
  staleWhileRevalidate: DAY,
  immutable: false,
  compressionEnabled: false,
  rangeRequestsEnabled: true,
  preload: "metadata",
};

export const DEFAULT_STATIC_ASSET_CACHE_SETTINGS: StaticAssetCacheSettings = {
  enabled: false,

  css: DEFAULT_CSS_CONFIG,
  javascript: DEFAULT_JS_CONFIG,
  fonts: DEFAULT_FONTS_CONFIG,
  svg: DEFAULT_SVG_CONFIG,
  icons: DEFAULT_ICONS_CONFIG,
  videos: DEFAULT_VIDEOS_CONFIG,
  audio: DEFAULT_AUDIO_CONFIG,

  lastPurgedAt: null,
  updatedAt: new Date(0).toISOString(),
};

// ── Mapper ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function mapCommon(
  row: Record<string, unknown>,
  prefix: string,
  d: StaticAssetTypeConfig,
): StaticAssetTypeConfig {
  return {
    enabled: Boolean(row[`${prefix}_enabled`] ?? d.enabled),
    maxAge: clamp(
      Number(row[`${prefix}_max_age`] ?? d.maxAge),
      STATIC_ASSET_TTL_LIMITS.min,
      STATIC_ASSET_TTL_LIMITS.max,
    ),
    cdnMaxAge: clamp(
      Number(row[`${prefix}_cdn_max_age`] ?? d.cdnMaxAge),
      STATIC_ASSET_TTL_LIMITS.min,
      STATIC_ASSET_TTL_LIMITS.max,
    ),
    staleWhileRevalidate: clamp(
      Number(row[`${prefix}_stale_while_revalidate`] ?? d.staleWhileRevalidate),
      STATIC_ASSET_SWR_LIMITS.min,
      STATIC_ASSET_SWR_LIMITS.max,
    ),
    immutable: Boolean(row[`${prefix}_immutable`] ?? d.immutable),
    compressionEnabled: Boolean(row[`${prefix}_compression_enabled`] ?? d.compressionEnabled),
  };
}

/** Maps the snake_case Supabase row to the camelCase StaticAssetCacheSettings. */
export function mapStaticAssetCacheRow(row: Record<string, unknown> | null): StaticAssetCacheSettings {
  if (!row) return DEFAULT_STATIC_ASSET_CACHE_SETTINGS;
  const d = DEFAULT_STATIC_ASSET_CACHE_SETTINGS;

  const rawFontDisplay = String(row.fonts_font_display ?? d.fonts.fontDisplay);
  const fontDisplay: FontDisplayStrategy = FONT_DISPLAY_STRATEGIES.includes(rawFontDisplay as FontDisplayStrategy)
    ? (rawFontDisplay as FontDisplayStrategy)
    : d.fonts.fontDisplay;

  const rawVideoPreload = String(row.videos_preload ?? d.videos.preload);
  const videosPreload: MediaPreload = MEDIA_PRELOAD_OPTIONS.includes(rawVideoPreload as MediaPreload)
    ? (rawVideoPreload as MediaPreload)
    : d.videos.preload;

  const rawAudioPreload = String(row.audio_preload ?? d.audio.preload);
  const audioPreload: MediaPreload = MEDIA_PRELOAD_OPTIONS.includes(rawAudioPreload as MediaPreload)
    ? (rawAudioPreload as MediaPreload)
    : d.audio.preload;

  return {
    enabled: Boolean(row.enabled ?? d.enabled),

    css: mapCommon(row, "css", d.css),
    javascript: mapCommon(row, "javascript", d.javascript),

    fonts: {
      ...mapCommon(row, "fonts", d.fonts),
      preloadEnabled: Boolean(row.fonts_preload_enabled ?? d.fonts.preloadEnabled),
      fontDisplay,
      crossOriginEnabled: Boolean(row.fonts_cross_origin_enabled ?? d.fonts.crossOriginEnabled),
    },

    svg: {
      ...mapCommon(row, "svg", d.svg),
      spriteEnabled: Boolean(row.svg_sprite_enabled ?? d.svg.spriteEnabled),
      inlineThresholdBytes: clamp(
        Number(row.svg_inline_threshold_bytes ?? d.svg.inlineThresholdBytes),
        SVG_INLINE_THRESHOLD_LIMITS.min,
        SVG_INLINE_THRESHOLD_LIMITS.max,
      ),
    },

    icons: {
      ...mapCommon(row, "icons", d.icons),
      fingerprintEnabled: Boolean(row.icons_fingerprint_enabled ?? d.icons.fingerprintEnabled),
    },

    videos: {
      ...mapCommon(row, "videos", d.videos),
      rangeRequestsEnabled: Boolean(row.videos_range_requests_enabled ?? d.videos.rangeRequestsEnabled),
      preload: videosPreload,
    },

    audio: {
      ...mapCommon(row, "audio", d.audio),
      rangeRequestsEnabled: Boolean(row.audio_range_requests_enabled ?? d.audio.rangeRequestsEnabled),
      preload: audioPreload,
    },

    lastPurgedAt: row.last_purged_at ? String(row.last_purged_at) : null,
    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}


