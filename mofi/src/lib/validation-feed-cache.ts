// Feed Cache validation schemas — Admin → Cache → Feed Cache.
// Import from here in the route handlers under
// src/app/api/admin/cache/feed/**.

import { z } from "zod";
import {
  FEED_MAX_ITEMS_LIMITS,
  RSS_TTL_LIMITS,
  SITEMAP_TTL_LIMITS,
  SITEMAP_SWR_LIMITS,
  JSON_FEED_TTL_LIMITS,
  ATOM_TTL_LIMITS,
} from "./feed-cache-settings";

export const feedCacheSettingsInputSchema = z.object({
  // ── Shared feed content ──────────────────────────────────────────────────
  feedIncludeBlogPosts: z.boolean().optional(),
  feedIncludeNewGames: z.boolean().optional(),
  feedMaxItems: z.number().int().min(FEED_MAX_ITEMS_LIMITS.min).max(FEED_MAX_ITEMS_LIMITS.max).optional(),
  feedTitleOverride: z.string().trim().max(120).optional(),
  feedDescription: z.string().trim().max(500).optional(),

  // ── 1. RSS Feeds ──────────────────────────────────────────────────────────
  rssEnabled: z.boolean().optional(),
  rssCacheTtlSeconds: z.number().int().min(RSS_TTL_LIMITS.min).max(RSS_TTL_LIMITS.max).optional(),

  // ── 2. XML Sitemaps ───────────────────────────────────────────────────────
  sitemapCacheTtlSeconds: z.number().int().min(SITEMAP_TTL_LIMITS.min).max(SITEMAP_TTL_LIMITS.max).optional(),
  sitemapStaleWhileRevalidateSeconds: z
    .number()
    .int()
    .min(SITEMAP_SWR_LIMITS.min)
    .max(SITEMAP_SWR_LIMITS.max)
    .optional(),

  // ── 3. JSON Feeds ─────────────────────────────────────────────────────────
  jsonFeedEnabled: z.boolean().optional(),
  jsonFeedCacheTtlSeconds: z.number().int().min(JSON_FEED_TTL_LIMITS.min).max(JSON_FEED_TTL_LIMITS.max).optional(),

  // ── 4. Atom Feeds ─────────────────────────────────────────────────────────
  atomEnabled: z.boolean().optional(),
  atomCacheTtlSeconds: z.number().int().min(ATOM_TTL_LIMITS.min).max(ATOM_TTL_LIMITS.max).optional(),
});
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
