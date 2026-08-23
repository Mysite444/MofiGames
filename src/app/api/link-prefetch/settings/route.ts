import { NextResponse, type NextRequest } from "next/server";
import { publicClient, requireAdmin } from "@/lib/supabase/route-auth";
import { linkPrefetchSettingsInputSchema, firstIssueMessage } from "@/lib/validation-link-prefetch";

/** GET /api/link-prefetch/settings — deliberately unauthenticated:
 * src/components/LinkPrefetchController.tsx is a client component
 * mounted for every visitor and reads this on mount, signed in or not. */
export async function GET() {
  const supabase = await publicClient();
  const { data } = await supabase.from("link_prefetch_settings").select("*").eq("id", true).maybeSingle();
  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/link-prefetch/settings — Admin → Cache → Preloading &
 * Prefetching → Link Prefetch. Admin-only. */
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

  const parsed = linkPrefetchSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.strategy !== undefined) patch.strategy = input.strategy;
  if (input.hoverDelayMs !== undefined) patch.hover_delay_ms = input.hoverDelayMs;
  if (input.maxConcurrentPrefetches !== undefined) patch.max_concurrent_prefetches = input.maxConcurrentPrefetches;
  if (input.excludePatterns !== undefined) patch.exclude_patterns = input.excludePatterns;

  const { data, error } = await supabase
    .from("link_prefetch_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update link prefetch settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
