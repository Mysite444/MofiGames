// Shared between CacheFragmentAdminClient, the API routes under
// src/app/api/admin/cache/fragment/**, and the runtime engine in
// fragment-cache.ts. Mirrors the object-cache-settings.ts /
// php-opcode-settings.ts pattern — pure mapper, no IO. See migration
// 0039_fragment_cache.sql for the table and the reasoning behind each
// field.

export interface FragmentDefinition {
  /** Stable identifier — see the warning in the migration about renaming these. */
  key: string;
  label: string;
  ttlSeconds: number;
  enabled: boolean;
}

export interface FragmentCacheSettings {
  enabled: boolean;
  defaultTtlSeconds: number;
  maxEntries: number;
  staleWhileRevalidateSeconds: number;
  bypassForAdmins: boolean;
  varyByLocale: boolean;
  fragments: FragmentDefinition[];
  lastPurgedAt: string | null;
  lastPurgeSummary: { scope: "all" | "fragment"; key: string | null; entriesRemoved: number } | null;
  updatedAt: string;
}

/** The eight fragment types this app knows how to cache, in the order
 * they should render in the admin UI. Descriptions shown alongside each
 * row live here (not in the DB) since they're static copy, not config. */
export const FRAGMENT_CATALOG: Record<string, { description: string; wired: boolean }> = {
  "trending-games": {
    description: "The plays-ranked trending rail on the homepage — recomputed from the full games table on every miss.",
    wired: true,
  },
  "featured-games": {
    description: "Admin-curated Featured Collection row on the homepage.",
    wired: true,
  },
  "related-games": {
    description: "The \"Play next\" grid on a game's page — one cache entry per category.",
    wired: true,
  },
  "navigation-menus": {
    description: "Custom pages and menu links shown in the sidebar/drawer nav (Admin → Site Settings → Menu Links & Pages).",
    wired: true,
  },
  "footer-widgets": {
    description: "Footer copyright line and identity fields sourced from Site Identity.",
    wired: true,
  },
  "sidebars": {
    description: "Sidebar widgets (Leaderboard panel, Top Picks, Play Next grid) render from data already covered by the Related Games and Game Cards fragments above — this entry is kept for parity with the catalogue and for any future widget with its own independent data source.",
    wired: false,
  },
  "game-cards": {
    description: "The full published-games and categories dataset backing every game-card grid site-wide — the highest-traffic fragment.",
    wired: true,
  },
  "homepage-sections": {
    description: "Homepage layout: section order, labels, visibility, and pinned games (Admin → Homepage).",
    wired: true,
  },
};

export const DEFAULT_FRAGMENTS: FragmentDefinition[] = [
  { key: "trending-games", label: "Trending Games", ttlSeconds: 180, enabled: true },
  { key: "featured-games", label: "Featured Games", ttlSeconds: 300, enabled: true },
  { key: "related-games", label: "Related Games", ttlSeconds: 600, enabled: true },
  { key: "navigation-menus", label: "Navigation Menus", ttlSeconds: 900, enabled: true },
  { key: "footer-widgets", label: "Footer Widgets", ttlSeconds: 1800, enabled: true },
  { key: "sidebars", label: "Sidebars", ttlSeconds: 600, enabled: true },
  { key: "game-cards", label: "Game Cards", ttlSeconds: 300, enabled: true },
  { key: "homepage-sections", label: "Homepage Sections", ttlSeconds: 300, enabled: true },
  { key: "site-identity", label: "Site Identity", ttlSeconds: 120, enabled: true },
  { key: "seo-settings", label: "SEO Settings", ttlSeconds: 120, enabled: true },
  { key: "ad-settings", label: "Ad Settings", ttlSeconds: 120, enabled: true },
  { key: "analytics-settings", label: "Analytics Settings", ttlSeconds: 120, enabled: true },
  { key: "dns-prefetch-hints", label: "DNS Prefetch Hints (layout)", ttlSeconds: 120, enabled: true },
  { key: "resource-hints", label: "Resource Hints (layout)", ttlSeconds: 120, enabled: true },
  { key: "speculative-loading", label: "Speculative Loading Rules (layout)", ttlSeconds: 120, enabled: true },
];

export const DEFAULT_FRAGMENT_CACHE_SETTINGS: FragmentCacheSettings = {
  enabled: true,
  defaultTtlSeconds: 300,
  maxEntries: 500,
  staleWhileRevalidateSeconds: 30,
  bypassForAdmins: true,
  varyByLocale: false,
  fragments: DEFAULT_FRAGMENTS,
  lastPurgedAt: null,
  lastPurgeSummary: null,
  updatedAt: new Date(0).toISOString(),
};

export const FRAGMENT_TTL_LIMITS = { min: 5, max: 86400 } as const;
export const MAX_ENTRIES_LIMITS = { min: 20, max: 20000 } as const;
export const SWR_LIMITS = { min: 0, max: 600 } as const;
export const DEFAULT_TTL_LIMITS = { min: 5, max: 86400 } as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapFragments(raw: unknown): FragmentDefinition[] {
  if (!Array.isArray(raw)) return DEFAULT_FRAGMENTS;
  const byKey = new Map<string, FragmentDefinition>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const key = typeof e.key === "string" ? e.key : null;
    if (!key) continue;
    byKey.set(key, {
      key,
      label: typeof e.label === "string" && e.label.trim() ? e.label : key,
      ttlSeconds: clamp(Number(e.ttlSeconds ?? 300), FRAGMENT_TTL_LIMITS.min, FRAGMENT_TTL_LIMITS.max),
      enabled: Boolean(e.enabled ?? true),
    });
  }
  // Preserve the canonical catalogue order; fall back to a default entry
  // for any fragment key missing from the row (e.g. a fresh install that
  // hasn't re-run the seed, or a fragment added to the code after the row
  // was first created).
  return DEFAULT_FRAGMENTS.map((d) => byKey.get(d.key) ?? d);
}

/** Row shape returned by GET /api/admin/cache/fragment/settings (and the
 * public GET /api/cache/... routes) — snake_case, as stored — mapped to
 * the camelCase FragmentCacheSettings above. */
export function mapFragmentCacheRow(row: Record<string, unknown> | null): FragmentCacheSettings {
  if (!row) return DEFAULT_FRAGMENT_CACHE_SETTINGS;
  const d = DEFAULT_FRAGMENT_CACHE_SETTINGS;

  const summaryRaw = row.last_purge_summary;
  let lastPurgeSummary: FragmentCacheSettings["lastPurgeSummary"] = null;
  if (summaryRaw && typeof summaryRaw === "object") {
    const s = summaryRaw as Record<string, unknown>;
    lastPurgeSummary = {
      scope: s.scope === "fragment" ? "fragment" : "all",
      key: typeof s.key === "string" ? s.key : null,
      entriesRemoved: Number(s.entriesRemoved ?? 0),
    };
  }

  return {
    enabled: Boolean(row.enabled ?? d.enabled),
    defaultTtlSeconds: clamp(
      Number(row.default_ttl_seconds ?? d.defaultTtlSeconds),
      DEFAULT_TTL_LIMITS.min,
      DEFAULT_TTL_LIMITS.max
    ),
    maxEntries: clamp(Number(row.max_entries ?? d.maxEntries), MAX_ENTRIES_LIMITS.min, MAX_ENTRIES_LIMITS.max),
    staleWhileRevalidateSeconds: clamp(
      Number(row.stale_while_revalidate_seconds ?? d.staleWhileRevalidateSeconds),
      SWR_LIMITS.min,
      SWR_LIMITS.max
    ),
    bypassForAdmins: Boolean(row.bypass_for_admins ?? d.bypassForAdmins),
    varyByLocale: Boolean(row.vary_by_locale ?? d.varyByLocale),
    fragments: mapFragments(row.fragments),
    lastPurgedAt: row.last_purged_at ? String(row.last_purged_at) : null,
    lastPurgeSummary,
    updatedAt: String(row.updated_at ?? d.updatedAt),
  };
}


