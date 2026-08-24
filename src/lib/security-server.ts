import { createClient } from "./supabase/server";
import { DEFAULT_SECURITY_SETTINGS, mapSecuritySettingsRow, type SecuritySettings } from "./security";

/** Server-side equivalent of fetchSecuritySettings() in security.ts — a
 * relative fetch() URL has no base to resolve against outside a
 * browser, so route handlers and Server Components query
 * security_settings directly instead. Fails soft to the defaults, same
 * as the client version. Import only from server code (route handlers,
 * Server Components) — it pulls in next/headers via the Supabase server
 * client, which Next.js itself will reject from a Client Component at
 * build time. */
export async function getSecuritySettingsServer(): Promise<SecuritySettings> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("security_settings").select("*").eq("id", true).maybeSingle();
    return mapSecuritySettingsRow(data ?? null);
  } catch {
    return DEFAULT_SECURITY_SETTINGS;
  }
}
