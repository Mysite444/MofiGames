import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mobileHomepageSectionsReorderSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateMobileHomepageFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

/**
 * POST /api/admin/mobile-homepage/reorder
 *
 * Accepts { ids: string[] } — the full ordered list of section UUIDs.
 * Rewrites position = (index + 1) * 10 for every row so positions stay
 * uniform (10, 20, 30…) regardless of how many inserts/deletes happened
 * since the last reorder.
 *
 * Uses individual UPDATEs instead of a single upsert so RLS policies
 * (is_admin()) are checked per-row rather than bypassed by service-role
 * short-cuts. At admin scale (< 50 sections) this is fine.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = mobileHomepageSectionsReorderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const updates = parsed.data.ids.map((id: string, index: number) =>
    supabase
      .from("mobile_homepage_sections")
      .update({ position: (index + 1) * 10 })
      .eq("id", id)
  );

  const results = await Promise.all(updates);
  const firstError = results.find((r: { error: unknown }) => r.error)?.error;
  if (firstError) return apiError(firstError);

  invalidateMobileHomepageFragments();
  return NextResponse.json({ ok: true });
}
