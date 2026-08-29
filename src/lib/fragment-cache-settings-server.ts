import { createPublicClient } from "./supabase/public-client";
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
 * Uses the public (cookie-free) client — fragment_cache_settings has a
 * "publicly readable" RLS policy (migration 0039) and carries no per-user
 * data, so a session cookie adds nothing here. Switching away from the
 * cookie-aware createClient() removes the cookies() call from the hot
 * path of every getOrSetFragment() call, which is the single most
 * frequently executed code in this codebase. */
export async function getFragmentCacheSettingsServer(): Promise<FragmentCacheSettings> {
  try {
    const supabase = createPublicClient();
    const { data } = await supabase.from("fragment_cache_settings").select("*").eq("id", true).maybeSingle();
    return mapFragmentCacheRow(data ?? null);
  } catch {
    return DEFAULT_FRAGMENT_CACHE_SETTINGS;
  }
}
