import { NextResponse, type NextRequest } from "next/server";
import { publicClient, requireAdmin } from "@/lib/supabase/route-auth";
import { resourceHintSettingsInputSchema, firstIssueMessage } from "@/lib/validation-resource-hints";
import { purgeFragment } from "@/lib/fragment-cache";

/** GET /api/resource-hints/settings — deliberately unauthenticated: the
 * admin UI's live preview needs it, and it exists at all so anonymous,
 * first-visit page loads could read it the same way the root layout
 * itself does. The root layout doesn't actually call this route (a
 * relative fetch() URL has no base outside a browser) — it reads the
 * table directly via getResourceHintSettingsServer(). This endpoint is
 * for client-side callers only. */
export async function GET() {
  const supabase = await publicClient();
  const { data } = await supabase.from("resource_hint_settings").select("*").eq("id", true).maybeSingle();
  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/resource-hints/settings — Admin → Cache → Preloading &
 * Prefetching → Resource Hints. Admin-only. */
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

  const parsed = resourceHintSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.hints !== undefined) patch.hints = input.hints;

  const { data, error } = await supabase
    .from("resource_hint_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update resource hint settings." }, { status: 500 });
  }

  purgeFragment("resource-hints");
  return NextResponse.json({ settings: data });
}
