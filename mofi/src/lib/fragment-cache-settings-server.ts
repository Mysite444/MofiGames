import { createClient } from "./supabase/server";
import {
  DEFAULT_FRAGMENT_CACHE_SETTINGS,
  mapFragmentCacheRow,
  type FragmentCacheSettings,
} from "./fragment-cache-settings";

/** Server-side fragment cache settings reader — queries fragment_cache_settings
 * directly instead of round-tripping through the admin API route (a relative
 * fetch() URL has no base to resolve against outside a browser). Needed on
 * essentially every server-rendered request (decides whether a given fragment
 * is enabled and what its TTL is). Fails soft to defaults so a broken
 * settings read degrades to "cache at the default TTL", not a full outage.
 *
 * Import only from server code — pulls in next/headers via the Supabase
 * server client. See cache-settings-server.ts for the sibling pattern. */
export async function getFragmentCacheSettingsServer(): Promise<FragmentCacheSettings> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("fragment_cache_settings").select("*").eq("id", true).maybeSingle();
    return mapFragmentCacheRow(data ?? null);
  } catch {
    return DEFAULT_FRAGMENT_CACHE_SETTINGS;
  }
}
