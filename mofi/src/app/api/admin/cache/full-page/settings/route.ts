import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactPurgeKey } from "@/lib/full-page-cache-settings";
import { fullPageCacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation";

/** GET /api/admin/cache/full-page/settings — Admin → Cache → Full Page Cache.
 * Admin-only. Redacts varnish_purge_key to a boolean + preview before the
 * row reaches the browser, exactly as cdn/settings does for the Cloudflare
 * API token. Everything else is returned as-is. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("full_page_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load full page cache settings." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ settings: null });
  }

  const { varnish_purge_key, ...rest } = data as Record<string, unknown> & { varnish_purge_key?: string | null };
  const redacted = redactPurgeKey(varnish_purge_key ?? null);

  return NextResponse.json({
    settings: {
      ...rest,
      varnish_purge_key_set: redacted.varnishPurgeKeySet,
      varnish_purge_key_preview: redacted.varnishPurgeKeyPreview,
    },
  });
}

/** PUT /api/admin/cache/full-page/settings — Admin → Cache → Full Page Cache.
 * Admin-only. Partial update — only fields present in the body are written.
 * varnishPurgeKey blank/omitted = leave the stored key untouched.
 * clearPurgeKey: true = explicitly wipe it. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = fullPageCacheSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  // Provider
  if (input.provider !== undefined) patch.provider = input.provider;

  // Shared behaviour
  if (input.guestCacheEnabled !== undefined) patch.guest_cache_enabled = input.guestCacheEnabled;
  if (input.guestCacheTtlSeconds !== undefined) patch.guest_cache_ttl_seconds = input.guestCacheTtlSeconds;
  if (input.loggedInCacheEnabled !== undefined) patch.logged_in_cache_enabled = input.loggedInCacheEnabled;
  if (input.loggedInCachePaths !== undefined) patch.logged_in_cache_paths = input.loggedInCachePaths;
  if (input.loggedInCacheTtlSeconds !== undefined) patch.logged_in_cache_ttl_seconds = input.loggedInCacheTtlSeconds;
  if (input.staticHtmlEnabled !== undefined) patch.static_html_enabled = input.staticHtmlEnabled;
  if (input.staticHtmlOutputDir !== undefined) patch.static_html_output_dir = input.staticHtmlOutputDir;

  // Exclusions
  if (input.excludedPaths !== undefined) patch.excluded_paths = input.excludedPaths;
  if (input.bypassCookies !== undefined) patch.bypass_cookies = input.bypassCookies;
  if (input.bypassQueryParams !== undefined) patch.bypass_query_params = input.bypassQueryParams;

  // LiteSpeed
  if (input.lsCacheTagPrefix !== undefined) patch.ls_cache_tag_prefix = input.lsCacheTagPrefix;
  if (input.lsEsiEnabled !== undefined) patch.ls_esi_enabled = input.lsEsiEnabled;
  if (input.lsObjectCacheEnabled !== undefined) patch.ls_object_cache_enabled = input.lsObjectCacheEnabled;
  if (input.lsBrowserCacheTtlSeconds !== undefined) patch.ls_browser_cache_ttl_seconds = input.lsBrowserCacheTtlSeconds;

  // Nginx FastCGI
  if (input.nginxCachePath !== undefined) patch.nginx_cache_path = input.nginxCachePath;
  if (input.nginxCacheZoneName !== undefined) patch.nginx_cache_zone_name = input.nginxCacheZoneName;
  if (input.nginxCacheZoneSize !== undefined) patch.nginx_cache_zone_size = input.nginxCacheZoneSize;
  if (input.nginxCacheMaxSize !== undefined) patch.nginx_cache_max_size = input.nginxCacheMaxSize;
  if (input.nginxCacheKey !== undefined) patch.nginx_cache_key = input.nginxCacheKey;
  if (input.nginxCacheLock !== undefined) patch.nginx_cache_lock = input.nginxCacheLock;
  if (input.nginxCacheUseStale !== undefined) patch.nginx_cache_use_stale = input.nginxCacheUseStale;

  // Varnish
  if (input.varnishBackendHost !== undefined) patch.varnish_backend_host = input.varnishBackendHost;
  if (input.varnishBackendPort !== undefined) patch.varnish_backend_port = input.varnishBackendPort;
  if (input.varnishDefaultTtlSeconds !== undefined) patch.varnish_default_ttl_seconds = input.varnishDefaultTtlSeconds;
  if (input.varnishGraceSeconds !== undefined) patch.varnish_grace_seconds = input.varnishGraceSeconds;
  if (input.clearPurgeKey) {
    patch.varnish_purge_key = null;
  } else if (input.varnishPurgeKey) {
    patch.varnish_purge_key = input.varnishPurgeKey; // blank/omitted = unchanged
  }

  // Cloudflare APO
  if (input.cfApoEnabled !== undefined) patch.cf_apo_enabled = input.cfApoEnabled;
  if (input.cfApoBypassCookies !== undefined) patch.cf_apo_bypass_cookies = input.cfApoBypassCookies;
  if (input.cfApoBypassPaths !== undefined) patch.cf_apo_bypass_paths = input.cfApoBypassPaths;

  const { data, error } = await supabase
    .from("full_page_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update full page cache settings." }, { status: 500 });
  }

  const { varnish_purge_key, ...rest } = data as Record<string, unknown> & { varnish_purge_key?: string | null };
  const redacted = redactPurgeKey(varnish_purge_key ?? null);

  return NextResponse.json({
    settings: {
      ...rest,
      varnish_purge_key_set: redacted.varnishPurgeKeySet,
      varnish_purge_key_preview: redacted.varnishPurgeKeyPreview,
    },
  });
}
