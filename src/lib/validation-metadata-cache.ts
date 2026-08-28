// Metadata Cache validation schemas — Admin → Cache → Metadata Cache.
// Import from here in the route handlers under
// src/app/api/admin/cache/metadata/**.

import { z } from "zod";
import {
  CATEGORIES_TTL_LIMITS,
  CATEGORIES_MAX_ENTRIES_LIMITS,
  TAGS_TTL_LIMITS,
  TAGS_MAX_ENTRIES_LIMITS,
  DEVELOPERS_TTL_LIMITS,
  DEVELOPERS_MIN_GAMES_LIMITS,
  DEVELOPERS_MAX_RESULTS_LIMITS,
  PUBLISHERS_TTL_LIMITS,
  PUBLISHERS_MIN_GAMES_LIMITS,
  PUBLISHERS_MAX_RESULTS_LIMITS,
  GAME_METADATA_TTL_LIMITS,
  GAME_METADATA_MAX_ENTRIES_LIMITS,
  SEO_METADATA_TTL_LIMITS,
  SEO_METADATA_MAX_ENTRIES_LIMITS,
} from "./metadata-cache-settings";

export const metadataCacheSettingsInputSchema = z.object({
  // ── 1. Categories Cache ──────────────────────────────────────────────────
  categoriesEnabled: z.boolean().optional(),
  categoriesTtlSeconds: z.number().int().min(CATEGORIES_TTL_LIMITS.min).max(CATEGORIES_TTL_LIMITS.max).optional(),
  categoriesIncludeSeoFields: z.boolean().optional(),
  categoriesIncludeGameCounts: z.boolean().optional(),
  categoriesMaxEntries: z
    .number()
    .int()
    .min(CATEGORIES_MAX_ENTRIES_LIMITS.min)
    .max(CATEGORIES_MAX_ENTRIES_LIMITS.max)
    .optional(),

  // ── 2. Tags Cache ─────────────────────────────────────────────────────────
  tagsEnabled: z.boolean().optional(),
  tagsTtlSeconds: z.number().int().min(TAGS_TTL_LIMITS.min).max(TAGS_TTL_LIMITS.max).optional(),
  tagsIncludeSeoFields: z.boolean().optional(),
  tagsIncludeUsageCounts: z.boolean().optional(),
  tagsMaxEntries: z.number().int().min(TAGS_MAX_ENTRIES_LIMITS.min).max(TAGS_MAX_ENTRIES_LIMITS.max).optional(),

  // ── 3. Developers Cache ───────────────────────────────────────────────────
  developersEnabled: z.boolean().optional(),
  developersTtlSeconds: z.number().int().min(DEVELOPERS_TTL_LIMITS.min).max(DEVELOPERS_TTL_LIMITS.max).optional(),
  developersMinGames: z
    .number()
    .int()
    .min(DEVELOPERS_MIN_GAMES_LIMITS.min)
    .max(DEVELOPERS_MIN_GAMES_LIMITS.max)
    .optional(),
  developersMaxResults: z
    .number()
    .int()
    .min(DEVELOPERS_MAX_RESULTS_LIMITS.min)
    .max(DEVELOPERS_MAX_RESULTS_LIMITS.max)
    .optional(),
  developersSortBy: z.enum(["game_count", "name"]).optional(),

  // ── 4. Publishers Cache ───────────────────────────────────────────────────
  publishersEnabled: z.boolean().optional(),
  publishersTtlSeconds: z.number().int().min(PUBLISHERS_TTL_LIMITS.min).max(PUBLISHERS_TTL_LIMITS.max).optional(),
  publishersMinGames: z
    .number()
    .int()
    .min(PUBLISHERS_MIN_GAMES_LIMITS.min)
    .max(PUBLISHERS_MIN_GAMES_LIMITS.max)
    .optional(),
  publishersMaxResults: z
    .number()
    .int()
    .min(PUBLISHERS_MAX_RESULTS_LIMITS.min)
    .max(PUBLISHERS_MAX_RESULTS_LIMITS.max)
    .optional(),
  publishersSortBy: z.enum(["game_count", "name"]).optional(),

  // ── 5. Game Metadata Cache ────────────────────────────────────────────────
  gameMetadataEnabled: z.boolean().optional(),
  gameMetadataTtlSeconds: z
    .number()
    .int()
    .min(GAME_METADATA_TTL_LIMITS.min)
    .max(GAME_METADATA_TTL_LIMITS.max)
    .optional(),
  gameMetadataMaxEntries: z
    .number()
    .int()
    .min(GAME_METADATA_MAX_ENTRIES_LIMITS.min)
    .max(GAME_METADATA_MAX_ENTRIES_LIMITS.max)
    .optional(),
  gameMetadataIncludeRelatedCounts: z.boolean().optional(),
  gameMetadataBypassForAdmins: z.boolean().optional(),

  // ── 6. SEO Metadata Cache ─────────────────────────────────────────────────
  seoMetadataEnabled: z.boolean().optional(),
  seoMetadataTtlSeconds: z.number().int().min(SEO_METADATA_TTL_LIMITS.min).max(SEO_METADATA_TTL_LIMITS.max).optional(),
  seoMetadataMaxEntries: z
    .number()
    .int()
    .min(SEO_METADATA_MAX_ENTRIES_LIMITS.min)
    .max(SEO_METADATA_MAX_ENTRIES_LIMITS.max)
    .optional(),
  seoMetadataEntityTypes: z.array(z.enum(["games", "categories", "tags", "pages"])).min(1).max(4).optional(),
  seoMetadataIncludeJsonLd: z.boolean().optional(),
});

/** POST /api/admin/cache/metadata/purge body. */
export const metadataCachePurgeInputSchema = z.object({
  scope: z.enum(["all", "categories", "tags", "developers", "publishers", "games", "seo"]),
});

/** POST /api/admin/cache/metadata/warm body — populates the in-process
 * cache for one namespace from live Supabase data. `sampleSize` bounds
 * how many rows the games/seo namespaces pull on a warm pass (categories
 * and tags always warm their full table — both are small). */
export const metadataCacheWarmInputSchema = z.object({
  scope: z.enum(["categories", "tags", "developers", "publishers", "games", "seo"]),
  sampleSize: z.number().int().min(1).max(200).optional(),
});
export type MetadataCacheWarmInput = z.infer<typeof metadataCacheWarmInputSchema>;

/** POST /api/admin/cache/metadata/recompute-facets body — rebuilds
 * metadata_developer_facets or metadata_publisher_facets from the games
 * table via the matching Postgres function. */
export const metadataCacheRecomputeFacetsInputSchema = z.object({
  scope: z.enum(["developers", "publishers"]),
});

/** POST /api/admin/cache/metadata/preview body — looks up one specific
 * item through the real getOrSetMetadataCache pipeline. `entityType` is
 * only used (and required) when namespace is "seo", to pick which
 * resolver runs. */
export const metadataCachePreviewInputSchema = z.object({
  namespace: z.enum(["categories", "tags", "developers", "publishers", "games", "seo"]),
  key: z.string().trim().min(1).max(200),
  entityType: z.enum(["games", "categories", "tags"]).optional(),
});

export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Validation error.";
}
