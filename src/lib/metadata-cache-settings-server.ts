import { createPublicClient } from "./supabase/public-client";
import {
  DEFAULT_METADATA_CACHE_SETTINGS,
  mapMetadataCacheRow,
  type MetadataCacheSettings,
} from "./metadata-cache-settings";

/** Server-side equivalent of fetching /api/admin/cache/metadata/settings —
 * metadata-cache.ts needs this on essentially every server-rendered
 * request that touches a game or tag page (it decides whether a given
 * namespace is enabled and what its TTL/cap is), so it queries
 * metadata_cache_settings directly instead of round-tripping through the
 * admin API route. Fails soft to the defaults — a broken settings read
 * should degrade to "cache everything at the default TTL", not take
 * metadata caching down entirely. Mirrors
 * fragment-cache-settings-server.ts exactly.
 *
 * Uses the public (cookie-free) client — metadata_cache_settings is
 * admin-configured read-only config with no per-user data. Removing the
 * cookies() dependency eliminates a dynamic-function opt-in from the
 * game-page render path. */
export async function getMetadataCacheSettingsServer(): Promise<MetadataCacheSettings> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase.from("metadata_cache_settings").select("*").eq("id", true).maybeSingle();
    return mapMetadataCacheRow(data ?? null);
  } catch {
    return DEFAULT_METADATA_CACHE_SETTINGS;
  }
}
