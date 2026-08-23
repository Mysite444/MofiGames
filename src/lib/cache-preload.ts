import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/seo";
import {
  sanitizePreloadUrls,
  CACHE_PRELOAD_CONCURRENCY_LIMITS,
  CACHE_PRELOAD_TIMEOUT_LIMITS,
  type CachePreloadRunResult,
  type CachePreloadRunStatus,
} from "@/lib/cache-preload-settings";

/**
 * The actual "Cache Preloading" work: fetches every admin-configured
 * path against the live site (SITE_URL) with a bounded worker pool, so
 * downstream layers — Full Page Cache, CDN / Edge Cache, Fragment Cache —
 * get a chance to populate before a real visitor is the one waiting on a
 * cold render.
 *
 * One entry point, two callers: the manual "Preload Now" button
 * (src/app/api/admin/cache/preloading/run/route.ts) and the scheduled
 * Automation → Infra → Cache Preloading job (cachePreload in
 * src/lib/automation/infra-executors.ts) — so there's a single run
 * history on cache_preload_settings regardless of which one fired it.
 *
 * Returns null when the feature is disabled (nothing to record) so
 * callers can each decide how to report that — a 400 for the manual
 * button, a no-op success for the scheduled job.
 */
export async function runCachePreload(supabase: SupabaseClient): Promise<CachePreloadRunResult | null> {
  const { data: row } = await supabase.from("cache_preload_settings").select("*").eq("id", true).maybeSingle();
  if (!row || !row.enabled) return null;

  const urls = sanitizePreloadUrls(row.preload_urls);
  const targets = urls.length ? urls : ["/"];
  const concurrency = Math.min(
    CACHE_PRELOAD_CONCURRENCY_LIMITS.max,
    Math.max(CACHE_PRELOAD_CONCURRENCY_LIMITS.min, Number(row.concurrency) || 5)
  );
  const timeoutMs = Math.min(
    CACHE_PRELOAD_TIMEOUT_LIMITS.max,
    Math.max(CACHE_PRELOAD_TIMEOUT_LIMITS.min, Number(row.request_timeout_ms) || 8000)
  );

  const started = Date.now();
  const results: CachePreloadRunResult["results"] = [];
  let cursor = 0;

  async function warmOne(path: string) {
    const target = `${SITE_URL}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(target, { signal: controller.signal, headers: { "x-cache-preload": "1" } });
      results.push({ path, ok: res.ok, httpStatus: res.status });
    } catch (err) {
      results.push({ path, ok: false, error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      clearTimeout(timer);
    }
  }

  async function worker() {
    while (cursor < targets.length) {
      const path = targets[cursor++];
      await warmOne(path);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));

  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  const status: CachePreloadRunStatus = failed === 0 ? "success" : ok === 0 ? "failed" : "partial";
  const summary: CachePreloadRunResult = { total: results.length, ok, failed, durationMs: Date.now() - started, results };

  await supabase
    .from("cache_preload_settings")
    .update({ last_run_at: new Date().toISOString(), last_run_status: status, last_run_summary: summary })
    .eq("id", true);

  return summary;
}
