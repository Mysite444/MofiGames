import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { categoriesReorderSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** POST /api/admin/categories/reorder — persist a new sort_order for every
 * category in the list. The client sends the full slug array in the new
 * display order; positions are written as index * 10 (leaves room for
 * insertions without renumbering the whole table). Admin only. */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = categoriesReorderSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { slugs } = parsed.data;

  // Batch: one update per category (Supabase JS doesn't support bulk upsert
  // with per-row values in a single query without raw SQL, so we use
  // Promise.all over the array — small at CMS scale, max ~200 categories).
  const updates = slugs.map((slug, index) =>
    supabase
      .from("categories")
      .update({ sort_order: (index + 1) * 10 })
      .eq("slug", slug)
  );

  const results = await Promise.all(updates);
  const firstError = results.find((r) => r.error)?.error;
  if (firstError) return apiError(firstError, "Failed to save category order.");

  return NextResponse.json({ ok: true, saved: slugs.length });
}
