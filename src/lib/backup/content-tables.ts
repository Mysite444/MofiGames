/**
 * The Site Content Backup table registry.
 *
 * This is the single source of truth for "what counts as content" — built
 * by actually reading every one of the ~95 tables' defining migration
 * (not by guessing from the name), because a name-based guess gets this
 * wrong in exactly the way this project's schema demonstrates:
 * `metadata_developer_facets` / `metadata_publisher_facets` sound like
 * content but are recomputed cache tables (0046_metadata_cache.sql).
 *
 * The Postgres side of this (0062_backup_migration_system.sql,
 * `admin_restore_table_rows`) has its own hardcoded copy of the same 28
 * names as a defense-in-depth allow-list — that function will never
 * write to a table that isn't in both places. If you add a table here,
 * add it there too (there's a cross-reference comment at each end).
 *
 * Anything NOT in this list is either:
 *   - infrastructure (cache/settings, security, analytics, logs, PII,
 *     automation internals) — deliberately excluded, see the rationale
 *     in each group below, or
 *   - genuinely new/unrecognized — surfaced to the admin as "needs
 *     review" by classifyTables() in schema-catalog.ts rather than
 *     silently included or silently dropped.
 */

export interface ContentTableGroup {
  id: string;
  label: string;
  description: string;
  tables: string[];
}

export const CONTENT_TABLE_GROUPS: ContentTableGroup[] = [
  {
    id: "games",
    label: "Games",
    description:
      "The games catalog itself, including the is_featured / is_trending / is_recommended flags used for homepage curation (there's no separate 'collections' table — curation lives on the game row and in Homepage & Navigation below).",
    tables: ["games"],
  },
  {
    id: "taxonomy",
    label: "Categories & Tags",
    description: "Categories, tags, and how they're attached to games and blog posts.",
    tables: ["categories", "tags", "game_tags", "post_tags"],
  },
  {
    id: "pages-blog",
    label: "Pages & Blog",
    description: "Static/editable pages and blog posts.",
    tables: ["pages", "posts"],
  },
  {
    id: "community",
    label: "Community Content",
    description:
      "Comments, comment likes, game reviews, and game ratings. These reference auth.users — see the migration report's Limitations section for what that means when restoring into a different Supabase project.",
    tables: ["comments", "comment_likes", "game_reviews", "game_ratings"],
  },
  {
    id: "homepage-nav",
    label: "Homepage & Navigation",
    description: "Homepage section curation and site navigation menus.",
    tables: ["homepage_sections", "homepage_section_games", "menu_links", "mobile_menu_games"],
  },
  {
    id: "identity-seo",
    label: "Site Identity & SEO",
    description: "Site name/logo/branding, global SEO defaults, and configured redirects.",
    tables: ["site_identity", "seo_settings", "seo_redirects"],
  },
  {
    id: "localization",
    label: "Localization",
    description: "Supported languages, currencies, UI translation strings, and default locale settings.",
    tables: ["languages", "currencies", "translations", "localization_settings"],
  },
  {
    id: "media",
    label: "Media Library",
    description:
      "Media Library records (file references/metadata). The underlying binary files live in Supabase Storage buckets, not this table — see the Complete Migration section for how storage is handled.",
    tables: ["media_assets"],
  },
  {
    id: "announcements",
    label: "Site Announcements",
    description: "The public announcement/notification feed shown on the site.",
    tables: ["notifications"],
  },
  {
    id: "import-config",
    label: "Import Automation Config",
    description:
      "Configured game-import providers/rules (feed URLs and mapping config — no credentials are stored in these tables).",
    tables: ["import_providers", "import_rules"],
  },
  {
    id: "user-content",
    label: "User-Generated Content",
    description:
      "Per-user favorites and recently-played history. Like Community Content above, these reference auth.users.",
    tables: ["favorites", "recently_played"],
  },
];

export const CONTENT_TABLES: string[] = CONTENT_TABLE_GROUPS.flatMap((g) => g.tables);

/**
 * Tables intentionally excluded from Site Content Backup, with why —
 * shown to admins in the "N tables detected, M excluded" audit view
 * rather than silently disappearing. This list is illustrative/complete
 * as of this project's current schema; classifyTables() in
 * schema-catalog.ts falls back to pattern matching for anything not
 * listed here explicitly (e.g. a table added after this file was last
 * updated), and *that* fallback is what actually decides inclusion —
 * this object is only for explaining a known table's exclusion in the UI.
 */
export const EXCLUDED_TABLE_REASONS: Record<string, string> = {
  profiles: "User account data (linked to auth.users) — not site content.",
  contact_messages: "Contains visitor PII (email, IP address) — a support inbox, not published content.",
  role_permissions: "Access-control configuration, not content.",
  user_permission_overrides: "Access-control configuration, not content.",
  automation_jobs: "Automation job definitions/schedules — operational configuration, not content.",
  automation_job_runs: "Automation run history — operational log data.",
  automation_notifications: "Internal automation alert log.",
  metadata_developer_facets: "Recomputed/derived cache table (see 0046_metadata_cache.sql) — regenerates automatically.",
  metadata_publisher_facets: "Recomputed/derived cache table (see 0046_metadata_cache.sql) — regenerates automatically.",
  search_popular_queries: "Derived analytics, regenerates automatically.",
};

/** Suffix/prefix/substring patterns used to classify tables that aren't
 * explicitly listed anywhere above — this is the "don't silently include
 * an unrecognized table" safety net. Matches are case-insensitive. */
const INFRA_PATTERNS: RegExp[] = [
  /cache/i,
  /_settings$/i,
  /^security_/i,
  /^session_/i,
  /^rate_limit/i,
  /^login_attempts/i,
  /^admin_action_log/i,
  /^api_keys/i,
  /^access_rules/i,
  /^ip_intel/i,
  /^slow_query_log/i,
  /^automation_/i,
  /^backup_/i,
  /^content_backup_/i,
  /^site_migration_/i,
  /^migration_/i,
  /^report_/i,
  /^user_reports/i,
  /^user_activity_logs/i,
  /^page_views/i,
  /^search_queries/i,
  /^game_plays/i,
  /^play_time/i,
  /^ad_/i,
  /^security_alerts/i,
];

/** True if `table` matches a known infrastructure naming pattern (cache,
 * security, analytics, logs, automation, etc.) — used by classifyTables()
 * to decide whether an unrecognized table should be silently treated as
 * infra or surfaced to the admin for review. */
export function looksLikeInfraTable(table: string): boolean {
  return INFRA_PATTERNS.some((re) => re.test(table));
}
