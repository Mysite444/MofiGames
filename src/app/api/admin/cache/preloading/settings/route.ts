import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { cachePreloadSettingsInputSchema, firstIssueMessage } from "@/lib/validation-cache-preload";

/** GET /api/admin/cache/preloading/settings — Admin → Cache →
 * Preloading & Prefetching → Cache Preloading. Admin-only: nothing here
 * is rendered to a visitor, so — unlike the three sibling pillars on
 * this page — there's no publicly-readable counterpart. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("cache_preload_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load cache preload settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

/** PUT /api/admin/cache/preloading/settings — Admin-only. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = cachePreloadSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.preloadUrls !== undefined) patch.preload_urls = input.preloadUrls;
  if (input.concurrency !== undefined) patch.concurrency = input.concurrency;
  if (input.requestTimeoutMs !== undefined) patch.request_timeout_ms = input.requestTimeoutMs;

  const { data, error } = await supabase
    .from("cache_preload_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update cache preload settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
