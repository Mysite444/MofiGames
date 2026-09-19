import { NextResponse, type NextRequest } from "next/server";
import { publicClient, requireAdmin } from "@/lib/supabase/route-auth";
import { speculativeLoadingSettingsInputSchema, firstIssueMessage } from "@/lib/validation-speculative-loading";
import { purgeFragment } from "@/lib/fragment-cache";

/** GET /api/speculative-loading/settings — deliberately unauthenticated:
 * the root layout doesn't call this route directly (a relative fetch()
 * URL has no base outside a browser — it reads the table via
 * getSpeculativeLoadingSettingsServer() instead), but the admin UI's
 * live preview does, the same split as resource-hints/settings. */
export async function GET() {
  const supabase = await publicClient();
  const { data } = await supabase.from("speculative_loading_settings").select("*").eq("id", true).maybeSingle();
  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/speculative-loading/settings — Admin → Cache → Preloading &
 * Prefetching → Speculative Loading. Admin-only. */
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

  const parsed = speculativeLoadingSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.mode !== undefined) patch.mode = input.mode;
  if (input.eagerness !== undefined) patch.eagerness = input.eagerness;
  if (input.includePatterns !== undefined) patch.include_patterns = input.includePatterns;
  if (input.excludePatterns !== undefined) patch.exclude_patterns = input.excludePatterns;

  const { data, error } = await supabase
    .from("speculative_loading_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update speculative loading settings." }, { status: 500 });
  }

  purgeFragment("speculative-loading");
  return NextResponse.json({ settings: data });
}
