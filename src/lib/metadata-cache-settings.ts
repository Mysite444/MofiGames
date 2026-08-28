// Shared between CacheMetadataAdminClient, the API routes under
// src/app/api/admin/cache/metadata/**, and the runtime engine in
// metadata-cache.ts. Pure mapper, no IO. See migration
// 0046_metadata_cache.sql for the table and the reasoning behind the
// six-pillar split (Categories / Tags / Developers / Publishers /
// Game Metadata / SEO Metadata).

export type DeveloperSortBy = "game_count" | "name";
export type PublisherSortBy = "game_count" | "name";
export type SeoEntityType = "games" | "categories" | "tags" | "pages";
export type MetadataPurgeScope = "all" | "categories" | "tags" | "developers" | "publishers" | "games" | "seo";

export interface MetadataPurgeSummary {
  scope: MetadataPurgeScope;
  entriesRemoved: number;
}

export interface MetadataCacheSettings {
  // ── 1. Categories Cache ────────────────────────────────────────────────
  categoriesEnabled: boolean;
  categoriesTtlSeconds: number;
  categoriesIncludeSeoFields: boolean;
  categoriesIncludeGameCounts: boolean;
  categoriesMaxEntries: number;

  // ── 2. Tags Cache ─────────────────────────────────────────────────────
  tagsEnabled: boolean;
  tagsTtlSeconds: number;
  tagsIncludeSeoFields: boolean;
  tagsIncludeUsageCounts: boolean;
  tagsMaxEntries: number;

  // ── 3. Developers Cache ───────────────────────────────────────────────
  developersEnabled: boolean;
  developersTtlSeconds: number;
  developersMinGames: number;
  developersMaxResults: number;
  developersSortBy: DeveloperSortBy;
  developersLastRefreshedAt: string | null;
  developersLastRefreshCount: number;

  // ── 4. Publishers Cache ───────────────────────────────────────────────
  publishersEnabled: boolean;
  publishersTtlSeconds: number;
  publishersMinGames: number;
  publishersMaxResults: number;
  publishersSortBy: PublisherSortBy;
  publishersLastRefreshedAt: string | null;
  publishersLastRefreshCount: number;

  // ── 5. Game Metadata Cache ────────────────────────────────────────────
  gameMetadataEnabled: boolean;
  gameMetadataTtlSeconds: number;
  gameMetadataMaxEntries: number;
  gameMetadataIncludeRelatedCounts: boolean;
  gameMetadataBypassForAdmins: boolean;

  // ── 6. SEO Metadata Cache ─────────────────────────────────────────────
  seoMetadataEnabled: boolean;
  seoMetadataTtlSeconds: number;
  seoMetadataMaxEntries: number;
  seoMetadataEntityTypes: SeoEntityType[];
  seoMetadataIncludeJsonLd: boolean;

  // ── Shared diagnostics ────────────────────────────────────────────────
  lastPurgedAt: string | null;
  lastPurgeSummary: MetadataPurgeSummary | null;

  updatedAt: string;
}

const DEVELOPER_SORTS: DeveloperSortBy[] = ["game_count", "name"];
const PUBLISHER_SORTS: PublisherSortBy[] = ["game_count", "name"];
const SEO_ENTITY_TYPES: SeoEntityType[] = ["games", "categories", "tags", "pages"];
const PURGE_SCOPES: MetadataPurgeScope[] = ["all", "categories", "tags", "developers", "publishers", "games", "seo"];

export const CATEGORIES_TTL_LIMITS = { min: 60, max: 604800 } as const;
export const CATEGORIES_MAX_ENTRIES_LIMITS = { min: 10, max: 5000 } as const;
export const TAGS_TTL_LIMITS = { min: 60, max: 604800 } as const;
export const TAGS_MAX_ENTRIES_LIMITS = { min: 10, max: 5000 } as const;
export const DEVELOPERS_TTL_LIMITS = { min: 60, max: 604800 } as const;
export const DEVELOPERS_MIN_GAMES_LIMITS = { min: 1, max: 1000 } as const;
export const DEVELOPERS_MAX_RESULTS_LIMITS = { min: 1, max: 1000 } as const;
export const PUBLISHERS_TTL_LIMITS = { min: 60, max: 604800 } as const;
export const PUBLISHERS_MIN_GAMES_LIMITS = { min: 1, max: 1000 } as const;
export const PUBLISHERS_MAX_RESULTS_LIMITS = { min: 1, max: 1000 } as const;
export const GAME_METADATA_TTL_LIMITS = { min: 30, max: 86400 } as const;
export const GAME_METADATA_MAX_ENTRIES_LIMITS = { min: 50, max: 20000 } as const;
export const SEO_METADATA_TTL_LIMITS = { min: 60, max: 86400 } as const;
export const SEO_METADATA_MAX_ENTRIES_LIMITS = { min: 50, max: 20000 } as const;

/** Static copy shown alongside each namespace in the admin UI — not
 * config, so it lives here rather than in the DB, same pattern as
 * search-cache-settings.ts's INDEX_SOURCE_CATALOG / fragment-cache-
 * settings.ts's FRAGMENT_CATALOG. `wired: true` means a real production
 * call site already routes through metadata-cache.ts for this namespace
 * (see games-server.ts / content-server.ts); `false` means the pillar is
 * fully functional and exercised for real by Warm/Preview, but nothing
 * in the public site calls it yet. */
export const METADATA_NAMESPACE_CATALOG: Record<
  string,
  { label: string; description: string; wired: boolean }
> = {
  categories: {
    label: "Categories",
    description:
      "Single-category lookups (name, colors, description, SEO fields, optional live game count). The full category list is already handled by Fragment Cache — this only covers one-off record lookups.",
    wired: false,
  },
  tags: {
    label: "Tags",
    description:
      "Single-tag lookups (name, color, SEO fields, optional usage counts). Wired into getTagBySlug() — every /tag/[slug] page and its SEO metadata goes through this cache.",
    wired: true,
  },
  developers: {
    label: "Developers",
    description:
      "games.developer is free text, not a table — this is the real computed leaderboard (distinct developer, game count, average rating), refreshed on demand.",
    wired: false,
  },
  publishers: {
    label: "Publishers",
    description: "Identical treatment to Developers, for games.publisher.",
    wired: false,
  },
  games: {
    label: "Game Metadata",
    description:
      "The full per-game record — instructions, controls, developer/publisher, ratings, every SEO/OG/Twitter field. Wired into getRealGameBySlug(), called by both generateMetadata() and the game page itself.",
    wired: true,
  },
  seo: {
    label: "SEO Metadata",
    description:
      "The resolved SEO payload buildGameMetadata() produces by merging a game's own overrides with the global SEO settings. Exercised for real by Warm/Preview against the live pipeline; not yet the code path generateMetadata() itself calls.",
    wired: false,
  },
};

export const DEFAULT_METADATA_CACHE_SETTINGS: MetadataCacheSettings = {
  categoriesEnabled: true,
  categoriesTtlSeconds: 3600,
  categoriesIncludeSeoFields: true,
  categoriesIncludeGameCounts: true,
  categoriesMaxEntries: 300,

  tagsEnabled: true,
  tagsTtlSeconds: 1800,
  tagsIncludeSeoFields: true,
  tagsIncludeUsageCounts: true,
  tagsMaxEntries: 500,

  developersEnabled: true,
  developersTtlSeconds: 1800,
  developersMinGames: 1,
  developersMaxResults: 100,
  developersSortBy: "game_count",
  developersLastRefreshedAt: null,
  developersLastRefreshCount: 0,

  publishersEnabled: true,
  publishersTtlSeconds: 1800,
  publishersMinGames: 1,
  publishersMaxResults: 100,
  publishersSortBy: "game_count",
  publishersLastRefreshedAt: null,
  publishersLastRefreshCount: 0,

  gameMetadataEnabled: true,
  gameMetadataTtlSeconds: 300,
  gameMetadataMaxEntries: 1000,
  gameMetadataIncludeRelatedCounts: true,
  gameMetadataBypassForAdmins: true,

  seoMetadataEnabled: true,
  seoMetadataTtlSeconds: 900,
  seoMetadataMaxEntries: 1000,
  seoMetadataEntityTypes: ["games", "categories", "tags"],
  seoMetadataIncludeJsonLd: true,

  lastPurgedAt: null,
  lastPurgeSummary: null,

  updatedAt: new Date(0).toISOString(),
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapEntityTypes(raw: unknown): SeoEntityType[] {
  if (!Array.isArray(raw)) return DEFAULT_METADATA_CACHE_SETTINGS.seoMetadataEntityTypes;
  const out = raw.filter((v): v is SeoEntityType => SEO_ENTITY_TYPES.includes(v as SeoEntityType));
  return out.length > 0 ? out : DEFAULT_METADATA_CACHE_SETTINGS.seoMetadataEntityTypes;
}

/** Row shape returned by GET /api/admin/cache/metadata/settings
 * (snake_case, as stored). No secrets on this table, so unlike
 * search-cache-settings.ts there's no redaction step. */
export function mapMetadataCacheRow(row: Record<string, unknown> | null): MetadataCacheSettings {
  if (!row) return DEFAULT_METADATA_CACHE_SETTINGS;
  const d = DEFAULT_METADATA_CACHE_SETTINGS;

  const developersSortBy = String(row.developers_sort_by ?? "");
  const publishersSortBy = String(row.publishers_sort_by ?? "");

  const summaryRaw = row.last_purge_summary;
  let lastPurgeSummary: MetadataPurgeSummary | null = null;
  if (summaryRaw && typeof summaryRaw === "object") {
    const s = summaryRaw as Record<string, unknown>;
    const scope = String(s.scope ?? "all");
    lastPurgeSummary = {
      scope: PURGE_SCOPES.includes(scope as MetadataPurgeScope) ? (scope as MetadataPurgeScope) : "all",
      entriesRemoved: Number(s.entriesRemoved ?? 0),
    };
  }

  return {
    categoriesEnabled: Boolean(row.categories_enabled ?? d.categoriesEnabled),
    categoriesTtlSeconds: clamp(
      Number(row.categories_ttl_seconds ?? d.categoriesTtlSeconds),
      CATEGORIES_TTL_LIMITS.min,
      CATEGORIES_TTL_LIMITS.max
    ),
    categoriesIncludeSeoFields: Boolean(row.categories_include_seo_fields ?? d.categoriesIncludeSeoFields),
    categoriesIncludeGameCounts: Boolean(row.categories_include_game_counts ?? d.categoriesIncludeGameCounts),
    categoriesMaxEntries: clamp(
      Number(row.categories_max_entries ?? d.categoriesMaxEntries),
      CATEGORIES_MAX_ENTRIES_LIMITS.min,
      CATEGORIES_MAX_ENTRIES_LIMITS.max
    ),

    tagsEnabled: Boolean(row.tags_enabled ?? d.tagsEnabled),
    tagsTtlSeconds: clamp(Number(row.tags_ttl_seconds ?? d.tagsTtlSeconds), TAGS_TTL_LIMITS.min, TAGS_TTL_LIMITS.max),
    tagsIncludeSeoFields: Boolean(row.tags_include_seo_fields ?? d.tagsIncludeSeoFields),
    tagsIncludeUsageCounts: Boolean(row.tags_include_usage_counts ?? d.tagsIncludeUsageCounts),
    tagsMaxEntries: clamp(
      Number(row.tags_max_entries ?? d.tagsMaxEntries),
      TAGS_MAX_ENTRIES_LIMITS.min,
      TAGS_MAX_ENTRIES_LIMITS.max
    ),

    developersEnabled: Boolean(row.developers_enabled ?? d.developersEnabled),
    developersTtlSeconds: clamp(
      Number(row.developers_ttl_seconds ?? d.developersTtlSeconds),
      DEVELOPERS_TTL_LIMITS.min,
      DEVELOPERS_TTL_LIMITS.max
    ),
    developersMinGames: clamp(
      Number(row.developers_min_games ?? d.developersMinGames),
      DEVELOPERS_MIN_GAMES_LIMITS.min,
      DEVELOPERS_MIN_GAMES_LIMITS.max
    ),
    developersMaxResults: clamp(
      Number(row.developers_max_results ?? d.developersMaxResults),
      DEVELOPERS_MAX_RESULTS_LIMITS.min,
      DEVELOPERS_MAX_RESULTS_LIMITS.max
    ),
    developersSortBy: DEVELOPER_SORTS.includes(developersSortBy as DeveloperSortBy)
      ? (developersSortBy as DeveloperSortBy)
      : d.developersSortBy,
    developersLastRefreshedAt: row.developers_last_refreshed_at ? String(row.developers_last_refreshed_at) : null,
    developersLastRefreshCount: Number(row.developers_last_refresh_count ?? 0),

    publishersEnabled: Boolean(row.publishers_enabled ?? d.publishersEnabled),
    publishersTtlSeconds: clamp(
      Number(row.publishers_ttl_seconds ?? d.publishersTtlSeconds),
      PUBLISHERS_TTL_LIMITS.min,
      PUBLISHERS_TTL_LIMITS.max
    ),
    publishersMinGames: clamp(
      Number(row.publishers_min_games ?? d.publishersMinGames),
      PUBLISHERS_MIN_GAMES_LIMITS.min,
      PUBLISHERS_MIN_GAMES_LIMITS.max
    ),
    publishersMaxResults: clamp(
      Number(row.publishers_max_results ?? d.publishersMaxResults),
      PUBLISHERS_MAX_RESULTS_LIMITS.min,
      PUBLISHERS_MAX_RESULTS_LIMITS.max
    ),
    publishersSortBy: PUBLISHER_SORTS.includes(publishersSortBy as PublisherSortBy)
      ? (publishersSortBy as PublisherSortBy)
      : d.publishersSortBy,
    publishersLastRefreshedAt: row.publishers_last_refreshed_at ? String(row.publishers_last_refreshed_at) : null,
    publishersLastRefreshCount: Number(row.publishers_last_refresh_count ?? 0),

    gameMetadataEnabled: Boolean(row.game_metadata_enabled ?? d.gameMetadataEnabled),
    gameMetadataTtlSeconds: clamp(
      Number(row.game_metadata_ttl_seconds ?? d.gameMetadataTtlSeconds),
      GAME_METADATA_TTL_LIMITS.min,
      GAME_METADATA_TTL_LIMITS.max
    ),
    gameMetadataMaxEntries: clamp(
      Number(row.game_metadata_max_entries ?? d.gameMetadataMaxEntries),
      GAME_METADATA_MAX_ENTRIES_LIMITS.min,
      GAME_METADATA_MAX_ENTRIES_LIMITS.max
    ),
    gameMetadataIncludeRelatedCounts: Boolean(
      row.game_metadata_include_related_counts ?? d.gameMetadataIncludeRelatedCounts
    ),
    gameMetadataBypassForAdmins: Boolean(row.game_metadata_bypass_for_admins ?? d.gameMetadataBypassForAdmins),

    seoMetadataEnabled: Boolean(row.seo_metadata_enabled ?? d.seoMetadataEnabled),
    seoMetadataTtlSeconds: clamp(
      Number(row.seo_metadata_ttl_seconds ?? d.seoMetadataTtlSeconds),
      SEO_METADATA_TTL_LIMITS.min,
      SEO_METADATA_TTL_LIMITS.max
    ),
    seoMetadataMaxEntries: clamp(
      Number(row.seo_metadata_max_entries ?? d.seoMetadataMaxEntries),
      SEO_METADATA_MAX_ENTRIES_LIMITS.min,
      SEO_METADATA_MAX_ENTRIES_LIMITS.max
    ),
    seoMetadataEntityTypes: mapEntityTypes(row.seo_metadata_entity_types),
    seoMetadataIncludeJsonLd: Boolean(row.seo_metadata_include_json_ld ?? d.seoMetadataIncludeJsonLd),

    lastPurgedAt: row.last_purged_at ? String(row.last_purged_at) : null,
    lastPurgeSummary,

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}
