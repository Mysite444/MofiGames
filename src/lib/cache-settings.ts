// Shared between client (upload helpers, admin UI) and server (the /sw.js
// route, Server Components): the cache_settings row shape and a pure
// mapper, so every caller agrees on what the row means. Same singleton
// pattern as security.ts/SecuritySettings — see migration
// 0033_cache_management.sql for the table and the reasoning behind each
// duration's range.

export interface CacheSettings {
  contentImagesMaxAge: number;
  gameThumbnailsMaxAge: number;
  gameMediaMaxAge: number;
  mediaLibraryMaxAge: number;
  gameFilesMaxAge: number;
  serviceWorkerEnabled: boolean;
  serviceWorkerCacheVersion: number;
  updatedAt: string;
}

/** Used whenever the `cache_settings` row can't be loaded (network
 * hiccup, migration 0033 not yet run) — mirrors the column defaults in
 * the migration so a failed read behaves the same as a freshly-seeded
 * row. */
export const DEFAULT_CACHE_SETTINGS: CacheSettings = {
  contentImagesMaxAge: 31536000,
  gameThumbnailsMaxAge: 31536000,
  gameMediaMaxAge: 31536000,
  mediaLibraryMaxAge: 31536000,
  gameFilesMaxAge: 3600,
  serviceWorkerEnabled: false,
  serviceWorkerCacheVersion: 1,
  updatedAt: new Date(0).toISOString(),
};

/** Per-bucket ceiling used both for the settings form's inputs and to
 * clamp anything read back from the database, so a hand-edited row can
 * never push a stable-path bucket (game_files) into a long-cache range
 * that would leave stale build files served after a re-upload. */
export const CACHE_MAX_AGE_LIMITS = {
  contentImagesMaxAge: { min: 60, max: 31536000 },
  gameThumbnailsMaxAge: { min: 60, max: 31536000 },
  gameMediaMaxAge: { min: 60, max: 31536000 },
  mediaLibraryMaxAge: { min: 60, max: 31536000 },
  gameFilesMaxAge: { min: 60, max: 604800 },
} as const satisfies Record<string, { min: number; max: number }>;

function clamp(value: number, key: keyof typeof CACHE_MAX_AGE_LIMITS): number {
  const { min, max } = CACHE_MAX_AGE_LIMITS[key];
  return Math.min(max, Math.max(min, value));
}

/** Row shape returned by GET /api/cache/settings (snake_case, as
 * stored) — mapped to the camelCase CacheSettings above. */
export function mapCacheSettingsRow(row: Record<string, unknown> | null): CacheSettings {
  if (!row) return DEFAULT_CACHE_SETTINGS;
  return {
    contentImagesMaxAge: clamp(
      Number(row.content_images_max_age ?? DEFAULT_CACHE_SETTINGS.contentImagesMaxAge),
      "contentImagesMaxAge"
    ),
    gameThumbnailsMaxAge: clamp(
      Number(row.game_thumbnails_max_age ?? DEFAULT_CACHE_SETTINGS.gameThumbnailsMaxAge),
      "gameThumbnailsMaxAge"
    ),
    gameMediaMaxAge: clamp(
      Number(row.game_media_max_age ?? DEFAULT_CACHE_SETTINGS.gameMediaMaxAge),
      "gameMediaMaxAge"
    ),
    mediaLibraryMaxAge: clamp(
      Number(row.media_library_max_age ?? DEFAULT_CACHE_SETTINGS.mediaLibraryMaxAge),
      "mediaLibraryMaxAge"
    ),
    gameFilesMaxAge: clamp(
      Number(row.game_files_max_age ?? DEFAULT_CACHE_SETTINGS.gameFilesMaxAge),
      "gameFilesMaxAge"
    ),
    serviceWorkerEnabled: Boolean(row.service_worker_enabled),
    serviceWorkerCacheVersion: Number(
      row.service_worker_cache_version ?? DEFAULT_CACHE_SETTINGS.serviceWorkerCacheVersion
    ),
    updatedAt: String(row.updated_at ?? DEFAULT_CACHE_SETTINGS.updatedAt),
  };
}

/** Client-side fetch of the (publicly readable) settings row. Fails soft
 * to the defaults. Browser-only — see cache-settings-server.ts for the
 * Server Component / route handler equivalent. */
export async function fetchCacheSettings(): Promise<CacheSettings> {
  try {
    const res = await fetch("/api/cache/settings", { cache: "no-store" });
    if (!res.ok) return DEFAULT_CACHE_SETTINGS;
    const data = await res.json();
    return mapCacheSettingsRow(data.settings ?? null);
  } catch {
    return DEFAULT_CACHE_SETTINGS;
  }
}
