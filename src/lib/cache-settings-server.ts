import { createClient } from "./supabase/server";
import { DEFAULT_CACHE_SETTINGS, mapCacheSettingsRow, type CacheSettings } from "./cache-settings";

/** Server-side equivalent of fetchCacheSettings() in cache-settings.ts —
 * a relative fetch() URL has no base to resolve against outside a
 * browser, so route handlers and Server Components (notably
 * src/app/sw.js/route.ts) query cache_settings directly instead. Fails
 * soft to the defaults, same as the client version. Import only from
 * server code — it pulls in next/headers via the Supabase server
 * client. */
export async function getCacheSettingsServer(): Promise<CacheSettings> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("cache_settings").select("*").eq("id", true).maybeSingle();
    return mapCacheSettingsRow(data ?? null);
  } catch {
    return DEFAULT_CACHE_SETTINGS;
  }
}
