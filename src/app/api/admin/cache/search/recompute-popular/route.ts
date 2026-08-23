import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mapSearchCacheRow, redactSecret } from "@/lib/search-cache-settings";
import { apiError } from "@/lib/api-error";

/** POST /api/admin/cache/search/recompute-popular — Admin → Cache →
 * Search Cache → Popular Searches → "Recompute Now". Admin-only.
 * Aggregates the real search_queries log (see 0011_analytics.sql /
 * SearchBox.tsx) into search_popular_queries via the
 * recompute_popular_searches() Postgres function, honoring the window /
 * max results / min occurrences / exclude-no-results settings currently
 * saved. This is the actual cache refresh — GET .../popular only ever
 * reads what this route last wrote. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: settingsRow, error: settingsError } = await supabase
    .from("search_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (settingsError || !settingsRow) {
    return NextResponse.json({ error: "Failed to load search cache settings." }, { status: 500 });
  }
  const settings = mapSearchCacheRow(settingsRow);

  if (!settings.popularSearchesEnabled) {
    return NextResponse.json({ error: "Popular Searches is disabled — enable it above, then recompute." }, { status: 400 });
  }

  const { data: writtenCount, error: rpcError } = await supabase.rpc("recompute_popular_searches", {
    p_window_days: settings.popularSearchesWindowDays,
    p_max_results: settings.popularSearchesMaxResults,
    p_min_occurrences: settings.popularSearchesMinOccurrences,
    p_exclude_no_results: settings.popularSearchesExcludeNoResults,
  });

  if (rpcError) {
    return apiError(rpcError, "Recompute failed.");
  }

  const count = Number(writtenCount ?? 0);
  const now = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("search_cache_settings")
    .update({
      popular_searches_last_refreshed_at: now,
      popular_searches_last_refresh_count: count,
      updated_at: now,
      updated_by: user.id,
    })
    .eq("id", true)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json(
      { result: { count }, settings: null, warning: "Recompute ran but failed to record the result." },
      { status: 207 }
    );
  }

  const { data: popular } = await supabase.from("search_popular_queries").select("*").order("rank", { ascending: true });

  const { external_api_key, ...rest } = updated as Record<string, unknown> & { external_api_key?: string | null };
  const redacted = redactSecret(external_api_key ?? null);

  return NextResponse.json({
    result: { count },
    popular: popular ?? [],
    settings: { ...rest, external_api_key_set: redacted.set, external_api_key_preview: redacted.preview },
  });
}
