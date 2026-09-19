import { cache } from "react";
import { createPublicClient } from "./supabase/public-client";
import type { AdminAdSettings } from "./supabase/admin-content";
import { getOrSetFragment } from "./fragment-cache";

// Server-only. Fetches the single `ad_settings` row (Admin → Monetization
// → Advertisement Management) — same singleton pattern as
// getSeoSettings()/getSiteIdentity(). Column names already match
// AdminAdSettings 1:1 (both are snake_case), so no field-mapping step is
// needed the way seo-settings.ts needs one for its camelCase shape.
//
// Every ad-rendering component on the public site should go through this
// (or receive its result as a prop) rather than querying `ad_settings`
// directly — one place to change if the fetch strategy (e.g. caching)
// ever needs to change.

export const DEFAULT_AD_SETTINGS: AdminAdSettings = {
  adsense_enabled: false,
  adsense_client_id: null,
  adsense_auto_ads: false,

  header_ads_enabled: false,
  header_ads_slot_id: null,
  header_ads_code: null,

  player_ads_enabled: false,
  player_ads_slot_id: null,
  player_ads_code: null,

  sidebar_ads_enabled: false,
  sidebar_ads_slot_id: null,
  sidebar_ads_code: null,

  ingame_ads_enabled: false,
  ingame_ads_slot_id: null,
  ingame_ads_code: null,
  ingame_ads_frequency: 3,

  footer_ads_enabled: false,
  footer_ads_slot_id: null,
  footer_ads_code: null,

  sticky_ads_enabled: false,
  sticky_ads_slot_id: null,
  sticky_ads_code: null,
  sticky_ads_position: "bottom",
  sticky_ads_dismissible: true,

  reward_ads_enabled: false,
  reward_ads_slot_id: null,
  reward_ads_code: null,
  reward_ads_reward_label: "Bonus unlocked",

  custom_html_ads_enabled: false,
  custom_html_ads_code: null,

  updated_at: new Date(0).toISOString(),
};

/** Falls back to DEFAULT_AD_SETTINGS whole-cloth if the row can't be read
 * (table missing, RLS hiccup, env misconfigured, etc.) so a settings
 * outage just means "no ads render" rather than a broken page.
 *
 * Fragment-cached under "ad-settings" (120s default TTL) — this row is
 * read on every public page twice per request (once by RootLayout to
 * decide adsenseReady/pass ad config as props, once independently by
 * AdsenseScript), and previously both reads hit Supabase live. The outer
 * `cache()` wrapper (React's per-request request-memoization helper,
 * same pattern already used for isCurrentUserAdmin in games-server.ts)
 * dedupes those two call sites into a single in-flight read within one
 * request even on a cold fragment-cache miss; the fragment cache then
 * handles reuse *across* requests. PUT /api/admin/ads purges this
 * fragment immediately on save via invalidateAdSettingsFragments(). */
export const getAdSettings = cache(async (): Promise<AdminAdSettings> => {
  return getOrSetFragment("ad-settings", undefined, async () => {
    try {
      const supabase = createPublicClient();
      const { data, error } = await supabase.from("ad_settings").select("*").eq("id", true).maybeSingle();
      if (error || !data) return DEFAULT_AD_SETTINGS;
      return data as AdminAdSettings;
    } catch {
      return DEFAULT_AD_SETTINGS;
    }
  });
});
