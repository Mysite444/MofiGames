import { createClient } from "./supabase/server";
import { getOrSetFragment } from "./fragment-cache";
import {
  DEFAULT_SPECULATIVE_LOADING_SETTINGS,
  mapSpeculativeLoadingRow,
  type SpeculativeLoadingSettings,
} from "./speculative-loading-settings";

/** Server-side speculative loading settings reader — queries
 * speculative_loading_settings directly (a relative fetch() URL has no
 * base outside a browser). Used by the root layout Server Component.
 * Fails soft to defaults, same pattern as dns-prefetch-settings-server.ts.
 *
 * Fragment-cached under "speculative-loading" (120s default TTL) —
 * rendered on every public page, previously an uncached live read on each
 * one. PUT /api/speculative-loading/settings purges this fragment on
 * save. */
export async function getSpeculativeLoadingSettingsServer(): Promise<SpeculativeLoadingSettings> {
  return getOrSetFragment("speculative-loading", undefined, async () => {
    try {
      const supabase = await createClient();
      const { data } = await supabase.from("speculative_loading_settings").select("*").eq("id", true).maybeSingle();
      return mapSpeculativeLoadingRow(data ?? null);
    } catch {
      return DEFAULT_SPECULATIVE_LOADING_SETTINGS;
    }
  });
}
