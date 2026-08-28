// Shared between CacheFeedAdminClient and the API routes under
// src/app/api/admin/cache/feed/**, and read server-side (via
// feed-cache-settings-server.ts) by the public /feed.xml, /feed.json,
// /atom.xml, and /sitemaps/*.xml routes. Pure mapper, no IO. See
// migration 0047_feed_cache.sql for the table and the reasoning behind
// the four-pillar split (RSS Feeds / XML Sitemaps / JSON Feeds / Atom
// Feeds) and why RSS/JSON Feed/Atom share one "feed content" config.

export interface FeedCacheSettings {
  // ── Shared feed content (RSS, JSON Feed, and Atom all read this) ────────
  feedIncludeBlogPosts: boolean;
  feedIncludeNewGames: boolean;
  feedMaxItems: number;
  /** Blank = falls back to Global SEO Settings' siteName at request time. */
  feedTitleOverride: string;
  feedDescription: string;

  // ── 1. RSS Feeds (RSS 2.0, /feed.xml) ────────────────────────────────────
  rssEnabled: boolean;
  rssCacheTtlSeconds: number;
  rssLastGeneratedAt: string | null;
  rssLastItemCount: number;

  // ── 2. XML Sitemaps (cache layer over /sitemaps/*.xml) ───────────────────
  sitemapCacheTtlSeconds: number;
  sitemapStaleWhileRevalidateSeconds: number;
  sitemapLastPurgedAt: string | null;
  sitemapLastPurgeSummary: SitemapPurgeSummary | null;

  // ── 3. JSON Feeds (JSON Feed 1.1, /feed.json) ────────────────────────────
  jsonFeedEnabled: boolean;
  jsonFeedCacheTtlSeconds: number;
  jsonFeedLastGeneratedAt: string | null;
  jsonFeedLastItemCount: number;

  // ── 4. Atom Feeds (Atom 1.0, /atom.xml) ──────────────────────────────────
  atomEnabled: boolean;
  atomCacheTtlSeconds: number;
  atomLastGeneratedAt: string | null;
  atomLastItemCount: number;

  updatedAt: string;
}

export interface SitemapPurgeSummary {
  games: number;
  categories: number;
  tags: number;
  blog: number;
  pages: number;
  images: number;
}

export const FEED_MAX_ITEMS_LIMITS = { min: 1, max: 100 } as const;
export const RSS_TTL_LIMITS = { min: 60, max: 86400 } as const;
export const SITEMAP_TTL_LIMITS = { min: 60, max: 86400 } as const;
export const SITEMAP_SWR_LIMITS = { min: 0, max: 604800 } as const;
export const JSON_FEED_TTL_LIMITS = { min: 60, max: 86400 } as const;
export const ATOM_TTL_LIMITS = { min: 60, max: 86400 } as const;

export const DEFAULT_FEED_CACHE_SETTINGS: FeedCacheSettings = {
  feedIncludeBlogPosts: true,
  feedIncludeNewGames: false,
  feedMaxItems: 20,
  feedTitleOverride: "",
  feedDescription: "The latest updates, articles, and new releases.",

  rssEnabled: true,
  rssCacheTtlSeconds: 900,
  rssLastGeneratedAt: null,
  rssLastItemCount: 0,

  sitemapCacheTtlSeconds: 3600,
  sitemapStaleWhileRevalidateSeconds: 86400,
  sitemapLastPurgedAt: null,
  sitemapLastPurgeSummary: null,

  jsonFeedEnabled: true,
  jsonFeedCacheTtlSeconds: 900,
  jsonFeedLastGeneratedAt: null,
  jsonFeedLastItemCount: 0,

  atomEnabled: true,
  atomCacheTtlSeconds: 900,
  atomLastGeneratedAt: null,
  atomLastItemCount: 0,

  updatedAt: new Date(0).toISOString(),
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Row shape from feed_cache_settings (snake_case, as stored). */
export function mapFeedCacheRow(row: Record<string, unknown> | null): FeedCacheSettings {
  if (!row) return DEFAULT_FEED_CACHE_SETTINGS;
  const d = DEFAULT_FEED_CACHE_SETTINGS;

  const summaryRaw = row.sitemap_last_purge_summary;
  let sitemapLastPurgeSummary: SitemapPurgeSummary | null = null;
  if (summaryRaw && typeof summaryRaw === "object") {
    const s = summaryRaw as Record<string, unknown>;
    sitemapLastPurgeSummary = {
      games: Number(s.games ?? 0),
      categories: Number(s.categories ?? 0),
      tags: Number(s.tags ?? 0),
      blog: Number(s.blog ?? 0),
      pages: Number(s.pages ?? 0),
      images: Number(s.images ?? 0),
    };
  }

  return {
    feedIncludeBlogPosts: Boolean(row.feed_include_blog_posts ?? d.feedIncludeBlogPosts),
    feedIncludeNewGames: Boolean(row.feed_include_new_games ?? d.feedIncludeNewGames),
    feedMaxItems: clamp(Number(row.feed_max_items ?? d.feedMaxItems), FEED_MAX_ITEMS_LIMITS.min, FEED_MAX_ITEMS_LIMITS.max),
    feedTitleOverride: String(row.feed_title_override ?? d.feedTitleOverride ?? ""),
    feedDescription: String(row.feed_description ?? d.feedDescription),

    rssEnabled: Boolean(row.rss_enabled ?? d.rssEnabled),
    rssCacheTtlSeconds: clamp(
      Number(row.rss_cache_ttl_seconds ?? d.rssCacheTtlSeconds),
      RSS_TTL_LIMITS.min,
      RSS_TTL_LIMITS.max
    ),
    rssLastGeneratedAt: row.rss_last_generated_at ? String(row.rss_last_generated_at) : null,
    rssLastItemCount: Number(row.rss_last_item_count ?? 0),

    sitemapCacheTtlSeconds: clamp(
      Number(row.sitemap_cache_ttl_seconds ?? d.sitemapCacheTtlSeconds),
      SITEMAP_TTL_LIMITS.min,
      SITEMAP_TTL_LIMITS.max
    ),
    sitemapStaleWhileRevalidateSeconds: clamp(
      Number(row.sitemap_stale_while_revalidate_seconds ?? d.sitemapStaleWhileRevalidateSeconds),
      SITEMAP_SWR_LIMITS.min,
      SITEMAP_SWR_LIMITS.max
    ),
    sitemapLastPurgedAt: row.sitemap_last_purged_at ? String(row.sitemap_last_purged_at) : null,
    sitemapLastPurgeSummary,

    jsonFeedEnabled: Boolean(row.json_feed_enabled ?? d.jsonFeedEnabled),
    jsonFeedCacheTtlSeconds: clamp(
      Number(row.json_feed_cache_ttl_seconds ?? d.jsonFeedCacheTtlSeconds),
      JSON_FEED_TTL_LIMITS.min,
      JSON_FEED_TTL_LIMITS.max
    ),
    jsonFeedLastGeneratedAt: row.json_feed_last_generated_at ? String(row.json_feed_last_generated_at) : null,
    jsonFeedLastItemCount: Number(row.json_feed_last_item_count ?? 0),

    atomEnabled: Boolean(row.atom_enabled ?? d.atomEnabled),
    atomCacheTtlSeconds: clamp(
      Number(row.atom_cache_ttl_seconds ?? d.atomCacheTtlSeconds),
      ATOM_TTL_LIMITS.min,
      ATOM_TTL_LIMITS.max
    ),
    atomLastGeneratedAt: row.atom_last_generated_at ? String(row.atom_last_generated_at) : null,
    atomLastItemCount: Number(row.atom_last_item_count ?? 0),

    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}
