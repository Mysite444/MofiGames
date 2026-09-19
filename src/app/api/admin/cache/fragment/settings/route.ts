import { NextResponse, type NextRequest } from "next/server";
import { publicClient, requireAdmin } from "@/lib/supabase/route-auth";
import { fragmentCacheSettingsInputSchema } from "@/lib/validation-fragment-cache";
import { invalidateFragmentSettingsCache } from "@/lib/fragment-cache";

/** GET /api/admin/cache/fragment/settings
 * Deliberately unauthenticated read, like /api/cache/settings — the
 * runtime engine (fragment-cache.ts) reads this row on real visitor
 * requests via getFragmentCacheSettingsServer(), long before any admin
 * session exists, and the admin dashboard needs the same data. The row
 * holds no credentials (unlike object_cache_settings), so there's
 * nothing here that needs to stay admin-only to read — only to write. */
export async function GET() {
  const supabase = await publicClient();
  const { data, error } = await supabase.from("fragment_cache_settings").select("*").eq("id", true).maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load Fragment Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/admin/cache/fragment/settings
 * Admin-only. Validates and merges a partial update into the singleton
 * row, then drops the engine's short-lived in-memory settings cache so
 * the change takes effect on the very next fragment read instead of
 * waiting out the usual 5-second window. */
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

  const parsed = fragmentCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }

  const input = parsed.data;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.defaultTtlSeconds !== undefined) patch.default_ttl_seconds = input.defaultTtlSeconds;
  if (input.maxEntries !== undefined) patch.max_entries = input.maxEntries;
  if (input.staleWhileRevalidateSeconds !== undefined)
    patch.stale_while_revalidate_seconds = input.staleWhileRevalidateSeconds;
  if (input.bypassForAdmins !== undefined) patch.bypass_for_admins = input.bypassForAdmins;
  if (input.varyByLocale !== undefined) patch.vary_by_locale = input.varyByLocale;
  if (input.fragments !== undefined) patch.fragments = input.fragments;

  const { data, error } = await supabase
    .from("fragment_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to save Fragment Cache settings." }, { status: 500 });
  }

  invalidateFragmentSettingsCache();

  return NextResponse.json({ settings: data });
}
