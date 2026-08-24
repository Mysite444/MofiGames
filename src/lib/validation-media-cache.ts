// Media Cache validation schemas — Admin → Cache → Media Cache.
// Import from here in the route handlers under
// src/app/api/admin/cache/media/**

import { z } from "zod";
import {
  VIDEO_TTL_LIMITS,
  VIDEO_SWR_LIMITS,
  VIDEO_SIZE_LIMITS,
  AUDIO_TTL_LIMITS,
  AUDIO_SWR_LIMITS,
  AUDIO_SIZE_LIMITS,
  PREVIEWS_TTL_LIMITS,
  PREVIEWS_SWR_LIMITS,
  LOADING_TTL_LIMITS,
  LOADING_SWR_LIMITS,
  SCREENSHOT_TTL_LIMITS,
  SCREENSHOT_SWR_LIMITS,
} from "./media-cache-settings";

export const mediaCacheSettingsInputSchema = z.object({
  // ── Master switch ─────────────────────────────────────────────────────────
  enabled: z.boolean().optional(),

  // ── 1. Videos ─────────────────────────────────────────────────────────────
  videosEnabled:              z.boolean().optional(),
  videosCacheTtlSeconds:      z.number().int().min(VIDEO_TTL_LIMITS.min).max(VIDEO_TTL_LIMITS.max).optional(),
  videosSwrSeconds:           z.number().int().min(VIDEO_SWR_LIMITS.min).max(VIDEO_SWR_LIMITS.max).optional(),
  videosRangeRequestsEnabled: z.boolean().optional(),
  videosCdnOffloadEnabled:    z.boolean().optional(),
  videosMaxFileSizeMb:        z.number().int().min(VIDEO_SIZE_LIMITS.min).max(VIDEO_SIZE_LIMITS.max).optional(),

  // ── 2. Audio ──────────────────────────────────────────────────────────────
  audioEnabled:               z.boolean().optional(),
  audioCacheTtlSeconds:       z.number().int().min(AUDIO_TTL_LIMITS.min).max(AUDIO_TTL_LIMITS.max).optional(),
  audioSwrSeconds:            z.number().int().min(AUDIO_SWR_LIMITS.min).max(AUDIO_SWR_LIMITS.max).optional(),
  audioRangeRequestsEnabled:  z.boolean().optional(),
  audioCdnOffloadEnabled:     z.boolean().optional(),
  audioMaxFileSizeMb:         z.number().int().min(AUDIO_SIZE_LIMITS.min).max(AUDIO_SIZE_LIMITS.max).optional(),

  // ── 3. Game Previews ──────────────────────────────────────────────────────
  previewsEnabled:            z.boolean().optional(),
  previewsCacheTtlSeconds:    z.number().int().min(PREVIEWS_TTL_LIMITS.min).max(PREVIEWS_TTL_LIMITS.max).optional(),
  previewsSwrSeconds:         z.number().int().min(PREVIEWS_SWR_LIMITS.min).max(PREVIEWS_SWR_LIMITS.max).optional(),
  previewsCdnOffloadEnabled:  z.boolean().optional(),
  previewsEagerLoadEnabled:   z.boolean().optional(),
  previewsAutoplayOnHover:    z.boolean().optional(),

  // ── 4. Loading Screens ────────────────────────────────────────────────────
  loadingScreensEnabled:           z.boolean().optional(),
  loadingScreensCacheTtlSeconds:   z.number().int().min(LOADING_TTL_LIMITS.min).max(LOADING_TTL_LIMITS.max).optional(),
  loadingScreensSwrSeconds:        z.number().int().min(LOADING_SWR_LIMITS.min).max(LOADING_SWR_LIMITS.max).optional(),
  loadingScreensCdnOffloadEnabled: z.boolean().optional(),
  loadingScreensPrefetchEnabled:   z.boolean().optional(),

  // ── 5. Screenshots ────────────────────────────────────────────────────────
  screenshotsEnabled:            z.boolean().optional(),
  screenshotsCacheTtlSeconds:    z.number().int().min(SCREENSHOT_TTL_LIMITS.min).max(SCREENSHOT_TTL_LIMITS.max).optional(),
  screenshotsSwrSeconds:         z.number().int().min(SCREENSHOT_SWR_LIMITS.min).max(SCREENSHOT_SWR_LIMITS.max).optional(),
  screenshotsCdnOffloadEnabled:  z.boolean().optional(),
  screenshotsLazyLoadEnabled:    z.boolean().optional(),
  screenshotsWebpConvertEnabled: z.boolean().optional(),
});


export const MEDIA_PURGE_SCOPES = [
  "all",
  "videos",
  "audio",
  "previews",
  "loading-screens",
  "screenshots",
] as const;

export type MediaPurgeScope = (typeof MEDIA_PURGE_SCOPES)[number];

/** POST /api/admin/cache/media/purge body */
export const mediaCachePurgeInputSchema = z.object({
  scope: z.enum(MEDIA_PURGE_SCOPES),
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
