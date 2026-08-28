import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mapMetadataCacheRow } from "@/lib/metadata-cache-settings";
import { metadataCacheRecomputeFacetsInputSchema, firstIssueMessage } from "@/lib/validation-metadata-cache";
import { purgeMetadataCache } from "@/lib/metadata-cache";
import { apiError } from "@/lib/api-error";

/** POST /api/admin/cache/metadata/recompute-facets — Admin → Cache →
 * Metadata Cache → Developers / Publishers → "Recompute Now". Admin-only.
 * games.developer / games.publisher are free-text columns, not
 * normalized tables, so this is the only place a "list of developers"
 * exists in the app: it aggregates every published game via
 * recompute_developer_facets()/recompute_publisher_facets() (see
 * 0046_metadata_cache.sql) into metadata_developer_facets /
 * metadata_publisher_facets, honoring the min-games / max-results
 * settings currently saved, then purges the in-process cache for that
 * namespace so the next read reflects the fresh table instead of a stale
 * TTL'd copy. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = metadataCacheRecomputeFacetsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const { scope } = parsed.data;

  const { data: settingsRow, error: settingsError } = await supabase
    .from("metadata_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (settingsError || !settingsRow) {
    return NextResponse.json({ error: "Failed to load metadata cache settings." }, { status: 500 });
  }
  const settings = mapMetadataCacheRow(settingsRow);

  const isDevelopers = scope === "developers";
  if (isDevelopers ? !settings.developersEnabled : !settings.publishersEnabled) {
    return NextResponse.json(
      { error: `${isDevelopers ? "Developers" : "Publishers"} is disabled — enable it above, then recompute.` },
      { status: 400 }
    );
  }

  const rpcName = isDevelopers ? "recompute_developer_facets" : "recompute_publisher_facets";
  const { data: writtenCount, error: rpcError } = await supabase.rpc(rpcName, {
    p_min_games: isDevelopers ? settings.developersMinGames : settings.publishersMinGames,
    p_max_results: isDevelopers ? settings.developersMaxResults : settings.publishersMaxResults,
  });

  if (rpcError) {
    return apiError(rpcError, "Recompute failed.");
  }

  const count = Number(writtenCount ?? 0);
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { updated_at: now, updated_by: user.id };
  if (isDevelopers) {
    patch.developers_last_refreshed_at = now;
    patch.developers_last_refresh_count = count;
  } else {
    patch.publishers_last_refreshed_at = now;
    patch.publishers_last_refresh_count = count;
  }

  const { data: updated, error: updateError } = await supabase
    .from("metadata_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  // A freshly-recomputed facet table serving stale in-process entries
  // until their TTL expires would be a confusing "I hit recompute and
  // nothing changed" moment — purge immediately instead.
  purgeMetadataCache(scope);

  const { data: facets } = await supabase
    .from(isDevelopers ? "metadata_developer_facets" : "metadata_publisher_facets")
    .select("*")
    .order("game_count", { ascending: false });

  if (updateError) {
    return NextResponse.json(
      { result: { count }, facets: facets ?? [], settings: null, warning: "Recompute ran but failed to record the result." },
      { status: 207 }
    );
  }

  return NextResponse.json({ result: { count }, facets: facets ?? [], settings: updated });
}
