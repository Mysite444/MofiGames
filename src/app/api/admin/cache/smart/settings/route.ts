import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { smartCacheSettingsInputSchema, firstIssueMessage } from "@/lib/validation-smart-cache";

/** GET /api/admin/cache/smart/settings — Admin → Cache → Smart Cache Management.
 * Admin-only. Returns the singleton settings row (id = true). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("smart_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Failed to load Smart Cache settings." }, { status: 500 });

  return NextResponse.json({ settings: data });
}

/** PUT /api/admin/cache/smart/settings — Admin-only. Partial updates
 * are supported: omit any key to leave it untouched. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = smartCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  // 1. Auto Invalidation
  if (input.autoInvalidationEnabled !== undefined) patch.auto_invalidation_enabled = input.autoInvalidationEnabled;
  if (input.invalidationRules !== undefined) patch.invalidation_rules = input.invalidationRules;
  if (input.invalidateOnPublish !== undefined) patch.invalidate_on_publish = input.invalidateOnPublish;
  if (input.invalidateOnUpdate !== undefined) patch.invalidate_on_update = input.invalidateOnUpdate;
  if (input.invalidateOnDelete !== undefined) patch.invalidate_on_delete = input.invalidateOnDelete;
  if (input.invalidationDelayMs !== undefined) patch.invalidation_delay_ms = input.invalidationDelayMs;

  // 2. Selective Purge
  if (input.selectivePurgeEnabled !== undefined) patch.selective_purge_enabled = input.selectivePurgeEnabled;

  // 3. Cache Tags
  if (input.cacheTagsEnabled !== undefined) patch.cache_tags_enabled = input.cacheTagsEnabled;
  if (input.cacheTags !== undefined) patch.cache_tags = input.cacheTags;
  if (input.tagHeaderName !== undefined) patch.tag_header_name = input.tagHeaderName;
  if (input.maxTagsPerResponse !== undefined) patch.max_tags_per_response = input.maxTagsPerResponse;

  // 4. Scheduled Warming
  if (input.scheduledWarmingEnabled !== undefined) patch.scheduled_warming_enabled = input.scheduledWarmingEnabled;
  if (input.warmingSchedule !== undefined) patch.warming_schedule = input.warmingSchedule;
  if (input.warmingUrls !== undefined) patch.warming_urls = input.warmingUrls;
  if (input.warmingConcurrency !== undefined) patch.warming_concurrency = input.warmingConcurrency;
  if (input.warmingTimeoutMs !== undefined) patch.warming_timeout_ms = input.warmingTimeoutMs;

  // 5. Background Regeneration
  if (input.backgroundRegenEnabled !== undefined) patch.background_regen_enabled = input.backgroundRegenEnabled;
  if (input.regenConcurrency !== undefined) patch.regen_concurrency = input.regenConcurrency;
  if (input.regenDelayMs !== undefined) patch.regen_delay_ms = input.regenDelayMs;
  if (input.regenPriorityUrls !== undefined) patch.regen_priority_urls = input.regenPriorityUrls;

  // 6. Request Coalescing
  if (input.requestCoalescingEnabled !== undefined) patch.request_coalescing_enabled = input.requestCoalescingEnabled;
  if (input.coalescingWindowMs !== undefined) patch.coalescing_window_ms = input.coalescingWindowMs;
  if (input.coalescingMaxWaiters !== undefined) patch.coalescing_max_waiters = input.coalescingMaxWaiters;

  // 7. Cache Locking
  if (input.cacheLockingEnabled !== undefined) patch.cache_locking_enabled = input.cacheLockingEnabled;
  if (input.lockTtlMs !== undefined) patch.lock_ttl_ms = input.lockTtlMs;
  if (input.lockTimeoutMs !== undefined) patch.lock_timeout_ms = input.lockTimeoutMs;
  if (input.lockRetryIntervalMs !== undefined) patch.lock_retry_interval_ms = input.lockRetryIntervalMs;

  // 8. Stale-While-Revalidate
  if (input.staleWhileRevalidateEnabled !== undefined) patch.stale_while_revalidate_enabled = input.staleWhileRevalidateEnabled;
  if (input.staleWhileRevalidateSeconds !== undefined) patch.stale_while_revalidate_seconds = input.staleWhileRevalidateSeconds;
  if (input.swiApplyToPaths !== undefined) patch.swi_apply_to_paths = input.swiApplyToPaths;

  // 9. Stale-If-Error
  if (input.staleIfErrorEnabled !== undefined) patch.stale_if_error_enabled = input.staleIfErrorEnabled;
  if (input.staleIfErrorSeconds !== undefined) patch.stale_if_error_seconds = input.staleIfErrorSeconds;
  if (input.staleIfErrorCodes !== undefined) patch.stale_if_error_codes = input.staleIfErrorCodes;

  const { data, error } = await supabase
    .from("smart_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    // Row doesn't exist yet (fresh migration) — upsert it
    if (error.code === "PGRST116") {
      const { data: inserted, error: insertErr } = await supabase
        .from("smart_cache_settings")
        .insert({ id: true, ...patch })
        .select("*")
        .single();
      if (insertErr) return NextResponse.json({ error: "Failed to save Smart Cache settings." }, { status: 500 });
      return NextResponse.json({ settings: inserted });
    }
    return NextResponse.json({ error: "Failed to update Smart Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
