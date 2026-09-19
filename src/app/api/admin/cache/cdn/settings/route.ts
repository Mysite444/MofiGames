import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactApiToken } from "@/lib/cdn-cache-settings";
import { cdnCacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation";

/** GET /api/admin/cache/cdn/settings — Admin → Cache → CDN / Edge Cache.
 * Admin-only (unlike /api/cache/settings): this row can hold a live
 * Cloudflare API token, so it never gets the "publicly readable"
 * treatment cache_settings has. The token itself never leaves this
 * route — it's redacted to a boolean + short preview before the row
 * goes back to the client. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("cdn_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load CDN cache settings." }, { status: 500 });
  }

  const { api_token, ...rest } = (data ?? {}) as Record<string, unknown> & { api_token?: string | null };
  const redacted = redactApiToken(api_token ?? null);

  return NextResponse.json({
    settings: data ? { ...rest, api_token_set: redacted.apiTokenSet, api_token_preview: redacted.apiTokenPreview } : null,
  });
}

/** PUT /api/admin/cache/cdn/settings — Admin → Cache → CDN / Edge Cache.
 * Admin-only. apiToken blank/omitted leaves the stored token untouched
 * (so re-saving other toggles never accidentally wipes it); the only way
 * to actually clear zoneId/apiToken is clearCredentials: true. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = cdnCacheSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };

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

  if (input.edgeCachingEnabled !== undefined) patch.edge_caching_enabled = input.edgeCachingEnabled;
  if (input.smartCacheRulesEnabled !== undefined) patch.smart_cache_rules_enabled = input.smartCacheRulesEnabled;
  if (input.cacheEverythingEnabled !== undefined) patch.cache_everything_enabled = input.cacheEverythingEnabled;
  if (input.cacheEverythingPaths !== undefined) patch.cache_everything_paths = input.cacheEverythingPaths;
  if (input.cacheByDeviceEnabled !== undefined) patch.cache_by_device_enabled = input.cacheByDeviceEnabled;
  if (input.cacheByQueryStringMode !== undefined) patch.cache_by_query_string_mode = input.cacheByQueryStringMode;
  if (input.cacheByQueryStringParams !== undefined) patch.cache_by_query_string_params = input.cacheByQueryStringParams;
  if (input.imageCdnEnabled !== undefined) patch.image_cdn_enabled = input.imageCdnEnabled;
  if (input.brotliEnabled !== undefined) patch.brotli_enabled = input.brotliEnabled;
  if (input.http3Enabled !== undefined) patch.http3_enabled = input.http3Enabled;
  if (input.earlyHintsEnabled !== undefined) patch.early_hints_enabled = input.earlyHintsEnabled;
  if (input.edgeTtlSeconds !== undefined) patch.edge_ttl_seconds = input.edgeTtlSeconds;

  const { data, error } = await supabase
    .from("cdn_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update CDN cache settings." }, { status: 500 });
  }

  const { api_token, ...rest } = data as Record<string, unknown> & { api_token?: string | null };
  const redacted = redactApiToken(api_token ?? null);

  return NextResponse.json({
    settings: { ...rest, api_token_set: redacted.apiTokenSet, api_token_preview: redacted.apiTokenPreview },
  });
}
