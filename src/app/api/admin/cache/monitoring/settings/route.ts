import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import {
  monitoringCacheSettingsInputSchema,
  type MonitoringCacheSettingsInput,
  firstIssueMessage,
} from "@/lib/validation-monitoring-cache";

/** GET /api/admin/cache/monitoring/settings
 * Admin-only. Loads the singleton cache_monitoring_settings row. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("cache_monitoring_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load Cache Monitoring settings." },
      { status: 500 },
    );
  }

  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/admin/cache/monitoring/settings
 * Admin-only. Validates and merges a partial update into the singleton
 * row. Each sub-object (ttl, autoCleanup) is optional so the client can
 * patch a single group without resending the rest. */
export async function PUT(req: NextRequest) {
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

  const parsed = monitoringCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: firstIssueMessage(parsed.error) },
      { status: 422 },
    );
  }

  const input: MonitoringCacheSettingsInput = parsed.data;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.cacheType !== undefined) patch.cache_type = input.cacheType;
  if (input.redisHost !== undefined) patch.redis_host = input.redisHost;
  if (input.redisPort !== undefined) patch.redis_port = input.redisPort;
  if (input.redisDb !== undefined) patch.redis_db = input.redisDb;
  if (input.memcachedServers !== undefined)
    patch.memcached_servers = input.memcachedServers;
  if (input.maxStorageMb !== undefined)
    patch.max_storage_mb = input.maxStorageMb;

  if (input.ttl) {
    const t = input.ttl;
    if (t.pageTtlSeconds !== undefined)
      patch.page_ttl_seconds = t.pageTtlSeconds;
    if (t.apiTtlSeconds !== undefined) patch.api_ttl_seconds = t.apiTtlSeconds;
    if (t.objectTtlSeconds !== undefined)
      patch.object_ttl_seconds = t.objectTtlSeconds;
    if (t.fragmentTtlSeconds !== undefined)
      patch.fragment_ttl_seconds = t.fragmentTtlSeconds;
    if (t.imageTtlSeconds !== undefined)
      patch.image_ttl_seconds = t.imageTtlSeconds;
    if (t.staticTtlSeconds !== undefined)
      patch.static_ttl_seconds = t.staticTtlSeconds;
    if (t.sessionTtlSeconds !== undefined)
      patch.session_ttl_seconds = t.sessionTtlSeconds;
    if (t.dnsTtlSeconds !== undefined) patch.dns_ttl_seconds = t.dnsTtlSeconds;
    if (t.searchTtlSeconds !== undefined)
      patch.search_ttl_seconds = t.searchTtlSeconds;
    if (t.feedTtlSeconds !== undefined)
      patch.feed_ttl_seconds = t.feedTtlSeconds;
  }

  if (input.autoCleanup) {
    const ac = input.autoCleanup;
    if (ac.enabled !== undefined) patch.auto_cleanup_enabled = ac.enabled;
    if (ac.intervalHours !== undefined)
      patch.auto_cleanup_interval_hours = ac.intervalHours;
    if (ac.maxAgeHours !== undefined)
      patch.auto_cleanup_max_age_hours = ac.maxAgeHours;
    if (ac.targetUsagePct !== undefined)
      patch.auto_cleanup_target_usage_pct = ac.targetUsagePct;
  }

  const { data, error } = await supabase
    .from("cache_monitoring_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to save Cache Monitoring settings." },
      { status: 500 },
    );
  }

  return NextResponse.json({ settings: data });
}
