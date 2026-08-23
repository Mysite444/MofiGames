import { createClient } from "./supabase/server";
import { getOrSetFragment } from "./fragment-cache";
import { DEFAULT_RESOURCE_HINT_SETTINGS, mapResourceHintRow, type ResourceHintSettings } from "./resource-hint-settings";

/** Server-side resource hint settings reader — queries resource_hint_settings
 * directly (a relative fetch() URL has no base outside a browser). Used by
 * the root layout Server Component. Fails soft to defaults, same pattern as
 * dns-prefetch-settings-server.ts. Import only from server code.
 *
 * Fragment-cached under "resource-hints" (120s default TTL) — rendered on
 * every public page, previously an uncached live read on each one. PUT
 * /api/resource-hints/settings purges this fragment on save. */
export async function getResourceHintSettingsServer(): Promise<ResourceHintSettings> {
  return getOrSetFragment("resource-hints", undefined, async () => {
    try {
      const supabase = await createClient();
      const { data } = await supabase.from("resource_hint_settings").select("*").eq("id", true).maybeSingle();
      return mapResourceHintRow(data ?? null);
    } catch {
      return DEFAULT_RESOURCE_HINT_SETTINGS;
    }
  });
}
