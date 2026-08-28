import { createClient } from "./supabase/server";
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
 * Import only from server code — it pulls in next/headers via the
 * Supabase server client. */
export async function getMetadataCacheSettingsServer(): Promise<MetadataCacheSettings> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("metadata_cache_settings").select("*").eq("id", true).maybeSingle();
    return mapMetadataCacheRow(data ?? null);
  } catch {
    return DEFAULT_METADATA_CACHE_SETTINGS;
  }
}
