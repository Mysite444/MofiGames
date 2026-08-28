import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { categoryInputSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateGameFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

/** POST /api/admin/categories — create a category. Admin only. */
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

  const parsed = categoryInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase.from("categories").insert(parsed.data).select().single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A category with that slug already exists." }, { status: 409 });
    }
    return apiError(error);
  }

  invalidateGameFragments();
  return NextResponse.json({ category: data }, { status: 201 });
}
