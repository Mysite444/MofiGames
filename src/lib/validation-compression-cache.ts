// Compression validation schemas — Admin → Cache → Compression.
// Import from here in the route handlers under
// src/app/api/admin/cache/compression/**.

import { z } from "zod";
import { BROTLI_QUALITY_LIMITS, GZIP_LEVEL_LIMITS, MIN_SIZE_LIMITS } from "./compression-cache-settings";

const mimeTypeSchema = z.string().trim().min(1).max(120);
const excludePatternSchema = z.string().trim().min(1).max(256);

export const compressionCacheSettingsInputSchema = z.object({
  enabled: z.boolean().optional(),

  brotli: z
    .object({
      enabled: z.boolean().optional(),
      quality: z.number().int().min(BROTLI_QUALITY_LIMITS.min).max(BROTLI_QUALITY_LIMITS.max).optional(),
      minSizeBytes: z.number().int().min(MIN_SIZE_LIMITS.min).max(MIN_SIZE_LIMITS.max).optional(),
      mimeTypes: z.array(mimeTypeSchema).max(50).optional(),
    })
    .optional(),

  gzip: z
    .object({
      enabled: z.boolean().optional(),
      level: z.number().int().min(GZIP_LEVEL_LIMITS.min).max(GZIP_LEVEL_LIMITS.max).optional(),
      minSizeBytes: z.number().int().min(MIN_SIZE_LIMITS.min).max(MIN_SIZE_LIMITS.max).optional(),
      mimeTypes: z.array(mimeTypeSchema).max(50).optional(),
    })
    .optional(),

  cssMinify: z
    .object({
      enabled: z.boolean().optional(),
      removeComments: z.boolean().optional(),
      combineFiles: z.boolean().optional(),
      excludePatterns: z.array(excludePatternSchema).max(50).optional(),
    })
    .optional(),

  jsMinify: z
    .object({
      enabled: z.boolean().optional(),
      removeComments: z.boolean().optional(),
      combineFiles: z.boolean().optional(),
      excludePatterns: z.array(excludePatternSchema).max(50).optional(),
    })
    .optional(),

  htmlMinify: z
    .object({
      enabled: z.boolean().optional(),
      removeComments: z.boolean().optional(),
      collapseWhitespace: z.boolean().optional(),
      minifyInlineCssJs: z.boolean().optional(),
    })
    .optional(),
});
export type CompressionCacheSettingsInput = z.infer<typeof compressionCacheSettingsInputSchema>;

/** POST /api/admin/cache/compression/test body. `path` defaults to "/" —
 * any other path must be site-relative (no external URLs, so this can
 * never be turned into an open fetch proxy). */
export const compressionTestInputSchema = z.object({
  path: z
    .string()
    .trim()
    .max(512)
    .refine((v) => v === "" || v.startsWith("/"), { message: "Path must be site-relative, starting with /." })
    .optional(),
});

/** POST /api/admin/cache/compression/minify-preview body. */
export const compressionMinifyPreviewInputSchema = z.object({
  type: z.enum(["css", "js", "html"]),
  code: z.string().max(200000), // 200 KB paste-in ceiling — this is a preview tool, not a build pipeline
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
