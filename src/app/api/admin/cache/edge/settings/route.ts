import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactEdgeApiToken } from "@/lib/edge-cache-settings";

/** GET /api/admin/cache/edge/settings — Admin → Cache → Edge Cache.
 * Admin-only. The api_token is stripped before the row reaches the
 * client — only api_token_set + api_token_preview are returned. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("edge_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error) return NextResponse.json({ error: "Failed to load Edge Cache settings." }, { status: 500 });

  const { api_token, ...rest } = (data ?? {}) as Record<string, unknown> & { api_token?: string | null };
  const redacted = redactEdgeApiToken(api_token ?? null);

  return NextResponse.json({
    settings: data
      ? { ...rest, api_token_set: redacted.apiTokenSet, api_token_preview: redacted.apiTokenPreview }
      : null,
  });
}

/** PUT /api/admin/cache/edge/settings — Admin → Cache → Edge Cache.
 * Omitting apiToken leaves the stored token untouched. The only way to
 * clear credentials is clearCredentials: true. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase, user } = auth.ctx;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  if (input.clearCredentials) {
    patch.zone_id = null;
    patch.api_token = null;
    patch.connected_zone_name = null;
    patch.last_synced_at = null;
    patch.last_sync_status = null;
    patch.last_sync_summary = null;
  } else {
    if (input.zoneId !== undefined) patch.zone_id = input.zoneId || null;
    if (input.apiToken) patch.api_token = input.apiToken; // blank/omitted → unchanged
  }

  // Workers Cache
  if (input.workersEnabled !== undefined) patch.workers_enabled = Boolean(input.workersEnabled);
  if (input.workersCacheTtlSeconds !== undefined)
    patch.workers_cache_ttl_seconds = Math.min(86400, Math.max(60, Number(input.workersCacheTtlSeconds) || 300));
  if (input.workersPassthroughEnabled !== undefined)
    patch.workers_passthrough_enabled = Boolean(input.workersPassthroughEnabled);
  if (Array.isArray(input.workersBypassRoutes)) patch.workers_bypass_routes = input.workersBypassRoutes.map(String);

  // ESI
  if (input.esiEnabled !== undefined) patch.esi_enabled = Boolean(input.esiEnabled);
  if (input.esiMaxAgeSeconds !== undefined)
    patch.esi_max_age_seconds = Math.min(86400, Math.max(0, Number(input.esiMaxAgeSeconds) || 300));
  if (input.esiFailOpen !== undefined) patch.esi_fail_open = Boolean(input.esiFailOpen);

  // Regional Caching
  if (input.regionalCachingEnabled !== undefined) patch.regional_caching_enabled = Boolean(input.regionalCachingEnabled);
  if (["all", "smart", "custom"].includes(String(input.regionalCachingTopology)))
    patch.regional_caching_topology = String(input.regionalCachingTopology);
  if (Array.isArray(input.restrictedRegions)) patch.restricted_regions = input.restrictedRegions.map(String);

  // Smart Edge Revalidation
  if (input.smartRevalidationEnabled !== undefined) patch.smart_revalidation_enabled = Boolean(input.smartRevalidationEnabled);
  if (input.staleWhileRevalidateSeconds !== undefined)
    patch.stale_while_revalidate_seconds = Math.min(3600, Math.max(0, Number(input.staleWhileRevalidateSeconds) || 0));
  if (input.staleIfErrorSeconds !== undefined)
    patch.stale_if_error_seconds = Math.min(86400, Math.max(0, Number(input.staleIfErrorSeconds) || 0));
  if (input.serveStaleOnError !== undefined) patch.serve_stale_on_error = Boolean(input.serveStaleOnError);

  // Tiered Cache
  if (input.tieredCacheEnabled !== undefined) patch.tiered_cache_enabled = Boolean(input.tieredCacheEnabled);
  if (["smart", "generic_global", "generic_regional"].includes(String(input.tieredCacheTopology)))
    patch.tiered_cache_topology = String(input.tieredCacheTopology);

  // Origin Shield
  if (input.originShieldEnabled !== undefined) patch.origin_shield_enabled = Boolean(input.originShieldEnabled);
  if (input.originShieldRegion) patch.origin_shield_region = String(input.originShieldRegion);

  const { data, error } = await supabase
    .from("edge_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    // If the row doesn't exist yet (table just migrated, no upsert yet), insert it.
    if (error.code === "PGRST116") {
      const { data: inserted, error: insertErr } = await supabase
        .from("edge_cache_settings")
        .insert({ id: true, ...patch })
        .select("*")
        .single();
      if (insertErr) return NextResponse.json({ error: "Failed to save Edge Cache settings." }, { status: 500 });
      const { api_token: _t, ...rest } = (inserted ?? {}) as Record<string, unknown> & { api_token?: string | null };
      const redacted = redactEdgeApiToken(_t ?? null);
      return NextResponse.json({
        settings: { ...rest, api_token_set: redacted.apiTokenSet, api_token_preview: redacted.apiTokenPreview },
      });
    }
    return NextResponse.json({ error: "Failed to update Edge Cache settings." }, { status: 500 });
  }

  const { api_token: _t, ...rest } = data as Record<string, unknown> & { api_token?: string | null };
  const redacted = redactEdgeApiToken(_t ?? null);
  return NextResponse.json({
    settings: { ...rest, api_token_set: redacted.apiTokenSet, api_token_preview: redacted.apiTokenPreview },
  });
}
