import { createPublicClient } from "./supabase/public-client";
import { getOrSetFragment } from "./fragment-cache";
import { DEFAULT_DNS_PREFETCH_SETTINGS, mapDnsPrefetchRow, type DnsPrefetchSettings } from "./dns-prefetch-settings";

/** Server-side equivalent of fetchDnsPrefetchSettings() — a relative
 * fetch() URL has no base to resolve against outside a browser, so the
 * root layout (Server Component) queries dns_prefetch_settings directly
 * instead. Fails soft to the defaults, same as cache-settings-server.ts.
 * Import only from server code — it pulls in next/headers via the
 * Supabase server client.
 *
 * Fragment-cached under "dns-prefetch-hints" (120s default TTL) — rendered
 * on every public page (see DnsPrefetchHints.tsx), previously an uncached
 * live read on each one. PUT /api/dns-prefetch/settings purges this
 * fragment on save. Deliberately a *separate* fragment/cache entry from
 * middleware.ts's own dns_prefetch_settings read — middleware runs in a
 * different execution context (no shared memory with Server Components)
 * and only needs one column (dns_prefetch_control_enabled) for a response
 * header, while this reads the full domain list for <link> tags. */
export async function getDnsPrefetchSettingsServer(): Promise<DnsPrefetchSettings> {
  return getOrSetFragment("dns-prefetch-hints", undefined, async () => {
    try {
      const supabase = createPublicClient();
      const { data } = await supabase.from("dns_prefetch_settings").select("*").eq("id", true).maybeSingle();
      return mapDnsPrefetchRow(data ?? null);
    } catch {
      return DEFAULT_DNS_PREFETCH_SETTINGS;
    }
  });
}
