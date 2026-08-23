import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { warmingRunInputSchema, firstIssueMessage } from "@/lib/validation-smart-cache";
import { mapSmartCacheSettingsRow } from "@/lib/smart-cache-settings";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** POST /api/admin/cache/smart/warm — Admin → Cache → Smart Cache →
 * Scheduled Cache Warming. Triggers an on-demand warming run using the
 * stored URL list (or an override set in the request body). */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = warmingRunInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }

  // Load settings to get default URLs + concurrency
  const { data: row } = await supabase
    .from("smart_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  const settings = mapSmartCacheSettingsRow(row as Record<string, unknown> | null);
  const urls = parsed.data.urls ?? settings.warmingUrls;
  const concurrency = settings.warmingConcurrency;
  const timeoutMs = settings.warmingTimeoutMs;

  const startMs = Date.now();
  const results: { path: string; ok: boolean; httpStatus?: number; error?: string }[] = [];

  // Process URLs in concurrency-limited batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (path) => {
        const url = `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          const res = await fetch(url, {
            method: "GET",
            headers: { "x-cache-warm": "1", "Cache-Control": "no-cache" },
            signal: controller.signal,
          });
          clearTimeout(timer);
          results.push({ path, ok: res.ok, httpStatus: res.status });
        } catch (err) {
          results.push({ path, ok: false, error: err instanceof Error ? err.message : "fetch failed" });
        }
      })
    );
  }

  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  const durationMs = Date.now() - startMs;
  const status = failed === 0 ? "success" : ok === 0 ? "failed" : "partial";

  const summary = { total: results.length, ok, failed, durationMs, results };

  // Persist the warming result
  await supabase.from("smart_cache_settings").update({
    last_warming_at: new Date().toISOString(),
    last_warming_status: status,
    last_warming_summary: summary,
    updated_at: new Date().toISOString(),
  }).eq("id", true);

  return NextResponse.json({ status, summary });
}
