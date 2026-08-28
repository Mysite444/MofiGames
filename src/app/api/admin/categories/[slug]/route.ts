import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { categoryUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateGameFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(80) });

/** PATCH /api/admin/categories/:slug — partial update. Admin only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid category slug." }, { status: 400 });
  }

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

  const parsedBody = categoryUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }
  if (Object.keys(parsedBody.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("categories")
    .update(parsedBody.data)
    .eq("slug", parsedParams.data.slug)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A category with that slug already exists." }, { status: 409 });
    }
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }
    return apiError(error);
  }

  invalidateGameFragments();
  return NextResponse.json({ category: data });
}

/** DELETE /api/admin/categories/:slug — admin only. Blocked by the
 * database (`on delete restrict`) if any game still references this
 * category — surfaced here as a clear 409 instead of a raw FK error. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid category slug." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { error } = await supabase.from("categories").delete().eq("slug", parsedParams.data.slug);
  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Move or delete this category's games first — it still has games assigned." },
        { status: 409 }
      );
    }
    return apiError(error);
  }

  await logAdminAction(supabase, user, {
    action: "category_deleted",
    targetType: "category",
    targetId: parsedParams.data.slug,
    summary: `Deleted category "${parsedParams.data.slug}".`,
  });

  invalidateGameFragments();
  return NextResponse.json({ ok: true });
}
