// Shared between CacheCompressionAdminClient and the API routes under
// src/app/api/admin/cache/compression/**. Pure mapper, no IO. Mirrors the
// static-asset-cache-settings.ts pattern. See migration
// 0051_compression_cache.sql for the table schema.
//
// "Compression" owns the encoding/shrinking of a response body itself —
// distinct from Static Asset Cache (how long CSS/JS/fonts/media are
// cached) and CDN / Edge Cache's own Brotli toggle (Cloudflare's edge
// zone setting).
//
//   1. Brotli Compression      — brotli content-encoding: quality,
//                                 minimum size floor, MIME allowlist.
//   2. Gzip Compression        — universal fallback: level, minimum
//                                 size floor, MIME allowlist.
//   3. CSS Minification        — comments/whitespace stripping, file
//                                 combining, exclude patterns.
//   4. JavaScript Minification — same shape as CSS Minification.
//   5. HTML Minification       — comment stripping, whitespace
//                                 collapsing, optional cascade into
//                                 inline <style>/<script>.

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrotliCompressionConfig {
  enabled: boolean;
  /** 0 (fastest/largest) – 11 (smallest/slowest). */
  quality: number;
  /** Responses smaller than this are sent uncompressed — the framing
   * overhead can exceed the savings below this floor. */
  minSizeBytes: number;
  mimeTypes: string[];
}

export interface GzipCompressionConfig {
  enabled: boolean;
  /** 1 (fastest/largest) – 9 (smallest/slowest). */
  level: number;
  minSizeBytes: number;
  mimeTypes: string[];
}

export interface MinifyConfig {
  enabled: boolean;
  removeComments: boolean;
  /** Bundle multiple files of this type into one before minifying. */
  combineFiles: boolean;
  /** Path/glob patterns to skip — e.g. vendor files already minified. */
  excludePatterns: string[];
  lastRunAt: string | null;
  lastOriginalBytes: number;
  lastMinifiedBytes: number;
}

export interface HtmlMinifyConfig {
  enabled: boolean;
  removeComments: boolean;
  collapseWhitespace: boolean;
  /** Cascade into the CSS/JS minifiers for inline <style>/<script>. */
  minifyInlineCssJs: boolean;
  lastRunAt: string | null;
  lastOriginalBytes: number;
  lastMinifiedBytes: number;
}

export type CompressionEncoding = "br" | "gzip" | "identity";

export interface CompressionTestProbe {
  encoding: CompressionEncoding;
  /** Content-Encoding actually returned by the server, if any. */
  contentEncodingReceived: string | null;
  /** Bytes actually transferred on the wire (Content-Length as sent). */
  transferredBytes: number | null;
  /** Bytes of the decoded body, once the client transparently inflates it. */
  decodedBytes: number | null;
  /** transferredBytes / decodedBytes, when both are known. */
  ratio: number | null;
  ok: boolean;
  message: string;
}

export interface CompressionCacheSettings {
  /** Master switch — disables all five features without discarding their
   * individual configuration. */
  enabled: boolean;

  brotli: BrotliCompressionConfig;
  gzip: GzipCompressionConfig;
  cssMinify: MinifyConfig;
  jsMinify: MinifyConfig;
  htmlMinify: HtmlMinifyConfig;

  // ── Diagnostics ────────────────────────────────────────────────────────────
  lastTestedAt: string | null;
  lastTestStatus: "success" | "failed" | null;
  lastTestMessage: string | null;
  lastTestResult: CompressionTestProbe[] | null;

  updatedAt: string;
}

// ── Limits ───────────────────────────────────────────────────────────────────

export const BROTLI_QUALITY_LIMITS = { min: 0, max: 11 } as const;
export const GZIP_LEVEL_LIMITS = { min: 1, max: 9 } as const;
export const MIN_SIZE_LIMITS = { min: 0, max: 10485760 } as const; // 0 – 10 MB

// ── Defaults ─────────────────────────────────────────────────────────────────

const COMPRESSIBLE_MIME_TYPES = [
  "text/html",
  "text/css",
  "text/plain",
  "text/xml",
  "application/javascript",
  "application/json",
  "application/xml",
  "application/rss+xml",
  "application/atom+xml",
  "image/svg+xml",
  "font/ttf",
  "font/otf",
];

export const DEFAULT_BROTLI_CONFIG: BrotliCompressionConfig = {
  enabled: true,
  quality: 11,
  minSizeBytes: 1024,
  mimeTypes: COMPRESSIBLE_MIME_TYPES,
};

export const DEFAULT_GZIP_CONFIG: GzipCompressionConfig = {
  enabled: true,
  level: 6,
  minSizeBytes: 1024,
  mimeTypes: COMPRESSIBLE_MIME_TYPES,
};

export const DEFAULT_CSS_MINIFY_CONFIG: MinifyConfig = {
  enabled: true,
  removeComments: true,
  combineFiles: false,
  excludePatterns: [],
  lastRunAt: null,
  lastOriginalBytes: 0,
  lastMinifiedBytes: 0,
};

export const DEFAULT_JS_MINIFY_CONFIG: MinifyConfig = {
  enabled: true,
  removeComments: true,
  combineFiles: false,
  excludePatterns: [],
  lastRunAt: null,
  lastOriginalBytes: 0,
  lastMinifiedBytes: 0,
};

export const DEFAULT_HTML_MINIFY_CONFIG: HtmlMinifyConfig = {
  enabled: true,
  removeComments: true,
  collapseWhitespace: true,
  minifyInlineCssJs: true,
  lastRunAt: null,
  lastOriginalBytes: 0,
  lastMinifiedBytes: 0,
};

export const DEFAULT_COMPRESSION_CACHE_SETTINGS: CompressionCacheSettings = {
  enabled: true,

  brotli: DEFAULT_BROTLI_CONFIG,
  gzip: DEFAULT_GZIP_CONFIG,
  cssMinify: DEFAULT_CSS_MINIFY_CONFIG,
  jsMinify: DEFAULT_JS_MINIFY_CONFIG,
  htmlMinify: DEFAULT_HTML_MINIFY_CONFIG,

  lastTestedAt: null,
  lastTestStatus: null,
  lastTestMessage: null,
  lastTestResult: null,

  updatedAt: new Date(0).toISOString(),
};

// ── Mapper ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function stringArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  return v.filter((x): x is string => typeof x === "string");
}

/** Maps the snake_case Supabase row to the camelCase CompressionCacheSettings. */
export function mapCompressionCacheRow(row: Record<string, unknown> | null): CompressionCacheSettings {
  if (!row) return DEFAULT_COMPRESSION_CACHE_SETTINGS;
  const d = DEFAULT_COMPRESSION_CACHE_SETTINGS;

  const rawStatus = row.last_test_status;
  const lastTestStatus: "success" | "failed" | null =
    rawStatus === "success" || rawStatus === "failed" ? rawStatus : null;

  let lastTestResult: CompressionTestProbe[] | null = null;
  if (Array.isArray(row.last_test_result)) {
    lastTestResult = (row.last_test_result as unknown[]).map((raw) => {
      const p = (raw ?? {}) as Record<string, unknown>;
      const encoding = p.encoding === "br" || p.encoding === "gzip" ? p.encoding : "identity";
      return {
        encoding: encoding as CompressionEncoding,
        contentEncodingReceived: p.contentEncodingReceived ? String(p.contentEncodingReceived) : null,
        transferredBytes: p.transferredBytes === null || p.transferredBytes === undefined ? null : Number(p.transferredBytes),
        decodedBytes: p.decodedBytes === null || p.decodedBytes === undefined ? null : Number(p.decodedBytes),
        ratio: p.ratio === null || p.ratio === undefined ? null : Number(p.ratio),
        ok: Boolean(p.ok),
        message: String(p.message ?? ""),
      };
    });
  }

  return {
    enabled: Boolean(row.enabled ?? d.enabled),

    brotli: {
      enabled: Boolean(row.brotli_enabled ?? d.brotli.enabled),
      quality: clamp(Number(row.brotli_quality ?? d.brotli.quality), BROTLI_QUALITY_LIMITS.min, BROTLI_QUALITY_LIMITS.max),
      minSizeBytes: clamp(Number(row.brotli_min_size_bytes ?? d.brotli.minSizeBytes), MIN_SIZE_LIMITS.min, MIN_SIZE_LIMITS.max),
      mimeTypes: stringArray(row.brotli_mime_types, d.brotli.mimeTypes),
    },

    gzip: {
      enabled: Boolean(row.gzip_enabled ?? d.gzip.enabled),
      level: clamp(Number(row.gzip_level ?? d.gzip.level), GZIP_LEVEL_LIMITS.min, GZIP_LEVEL_LIMITS.max),
      minSizeBytes: clamp(Number(row.gzip_min_size_bytes ?? d.gzip.minSizeBytes), MIN_SIZE_LIMITS.min, MIN_SIZE_LIMITS.max),
      mimeTypes: stringArray(row.gzip_mime_types, d.gzip.mimeTypes),
    },

    cssMinify: {
      enabled: Boolean(row.css_minify_enabled ?? d.cssMinify.enabled),
      removeComments: Boolean(row.css_minify_remove_comments ?? d.cssMinify.removeComments),
      combineFiles: Boolean(row.css_minify_combine_files ?? d.cssMinify.combineFiles),
      excludePatterns: stringArray(row.css_minify_exclude_patterns, d.cssMinify.excludePatterns),
      lastRunAt: row.css_minify_last_run_at ? String(row.css_minify_last_run_at) : null,
      lastOriginalBytes: Number(row.css_minify_last_original_bytes ?? 0),
      lastMinifiedBytes: Number(row.css_minify_last_minified_bytes ?? 0),
    },

    jsMinify: {
      enabled: Boolean(row.js_minify_enabled ?? d.jsMinify.enabled),
      removeComments: Boolean(row.js_minify_remove_comments ?? d.jsMinify.removeComments),
      combineFiles: Boolean(row.js_minify_combine_files ?? d.jsMinify.combineFiles),
      excludePatterns: stringArray(row.js_minify_exclude_patterns, d.jsMinify.excludePatterns),
      lastRunAt: row.js_minify_last_run_at ? String(row.js_minify_last_run_at) : null,
      lastOriginalBytes: Number(row.js_minify_last_original_bytes ?? 0),
      lastMinifiedBytes: Number(row.js_minify_last_minified_bytes ?? 0),
    },

    htmlMinify: {
      enabled: Boolean(row.html_minify_enabled ?? d.htmlMinify.enabled),
      removeComments: Boolean(row.html_minify_remove_comments ?? d.htmlMinify.removeComments),
      collapseWhitespace: Boolean(row.html_minify_collapse_whitespace ?? d.htmlMinify.collapseWhitespace),
      minifyInlineCssJs: Boolean(row.html_minify_inline_css_js ?? d.htmlMinify.minifyInlineCssJs),
      lastRunAt: row.html_minify_last_run_at ? String(row.html_minify_last_run_at) : null,
      lastOriginalBytes: Number(row.html_minify_last_original_bytes ?? 0),
      lastMinifiedBytes: Number(row.html_minify_last_minified_bytes ?? 0),
    },

    lastTestedAt: row.last_tested_at ? String(row.last_tested_at) : null,
    lastTestStatus,
    lastTestMessage: row.last_test_message ? String(row.last_test_message) : null,
    lastTestResult,

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}

/** Client-side fetch. Fails soft to defaults. */
export async function fetchCompressionCacheSettings(): Promise<CompressionCacheSettings> {
  try {
    const res = await fetch("/api/admin/cache/compression/settings", { cache: "no-store" });
    if (!res.ok) return DEFAULT_COMPRESSION_CACHE_SETTINGS;
    const data = await res.json();
    return mapCompressionCacheRow(data.settings ?? null);
  } catch {
    return DEFAULT_COMPRESSION_CACHE_SETTINGS;
  }
}

// ── Savings helpers ──────────────────────────────────────────────────────────

/** Percentage reduction from `original` to `result`. 0 when there's nothing
 * to compare yet, never negative in the UI (a minifier that grows output is
 * clamped to 0% shown, not a misleading negative-savings badge). */
export function savingsPercent(originalBytes: number, resultBytes: number): number {
  if (originalBytes <= 0) return 0;
  const pct = ((originalBytes - resultBytes) / originalBytes) * 100;
  return Math.max(0, Math.round(pct * 10) / 10);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ── Config snippet generator ────────────────────────────────────────────────
// Nothing in this Node/Next app is a reverse proxy — actual on-the-wire
// Brotli/Gzip is applied by whatever sits in front of it (Vercel's edge
// network, Nginx, a CDN). These snippets translate the settings above into
// config for the two most common fronts, the same "generated config for
// infrastructure this app doesn't itself run" pattern as
// generatePhpIniSnippet() in php-opcode-settings.ts.

export function generateNginxSnippet(s: CompressionCacheSettings): string {
  const lines: string[] = [
    "# ── Compression — generated by Mofigames admin panel ────────────────────",
  ];

  if (s.gzip.enabled) {
    lines.push(
      "gzip on;",
      `gzip_comp_level ${s.gzip.level};`,
      `gzip_min_length ${s.gzip.minSizeBytes};`,
      "gzip_vary on;",
      `gzip_types ${s.gzip.mimeTypes.join(" ")};`,
    );
  } else {
    lines.push("gzip off;");
  }

  lines.push("");

  if (s.brotli.enabled) {
    lines.push(
      "# Requires the ngx_brotli module.",
      "brotli on;",
      `brotli_comp_level ${s.brotli.quality};`,
      `brotli_min_length ${s.brotli.minSizeBytes};`,
      `brotli_types ${s.brotli.mimeTypes.join(" ")};`,
    );
  } else {
    lines.push("brotli off;");
  }

  return lines.join("\n");
}

export function generateVercelJsonSnippet(s: CompressionCacheSettings): string {
  // Vercel's edge network negotiates br/gzip automatically per
  // Accept-Encoding for anything it serves — there's no per-project dial
  // for quality/level. This documents the intended defaults for a
  // self-hosted `next start` deployment instead, where Next's built-in
  // `compress` option covers gzip only (Node's zlib doesn't ship brotli
  // compression in Next's compression middleware).
  return [
    "// next.config.ts — for a self-hosted `next start` deployment.",
    "// On Vercel, brotli/gzip negotiation happens at the edge automatically",
    "// and this option has no effect.",
    "const nextConfig = {",
    `  compress: ${s.gzip.enabled},`,
    "};",
  ].join("\n");
}
