import { cache } from "react";
import { createClient } from "./supabase/server";
import { getOrSetFragment } from "./fragment-cache";

export interface AnalyticsSettings {
  ga4MeasurementId: string;
  ga4PropertyId: string;
  gscSiteUrl: string;
  clarityProjectId: string;
  updatedAt: string;
}

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  ga4MeasurementId: "",
  ga4PropertyId: "",
  gscSiteUrl: "",
  clarityProjectId: "",
  updatedAt: new Date(0).toISOString(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): AnalyticsSettings {
  return {
    ga4MeasurementId: row.ga4_measurement_id ?? "",
    ga4PropertyId: row.ga4_property_id ?? "",
    gscSiteUrl: row.gsc_site_url ?? "",
    clarityProjectId: row.clarity_project_id ?? "",
    updatedAt: row.updated_at ?? new Date(0).toISOString(),
  };
}

/** The single source of truth for external analytics connections (GA4 +
 * Clarity IDs). Read on every public page (to inject tracking scripts) and
 * on the admin Integrations screen. Falls back to "nothing connected"
 * whole-cloth if the row can't be read, same pattern as getSeoSettings.
 *
 * Fragment-cached under "analytics-settings" (120s default TTL) — read on
 * every public page render, previously with no caching at all. PUT
 * /api/admin/analytics/settings purges this fragment on save. */
export const getAnalyticsSettings = cache(async (): Promise<AnalyticsSettings> => {
  return getOrSetFragment("analytics-settings", undefined, async () => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("analytics_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error || !data) return DEFAULT_ANALYTICS_SETTINGS;
      return mapRow(data);
    } catch {
      return DEFAULT_ANALYTICS_SETTINGS;
    }
  });
});
