import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { updateReportCategorySchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/admin/report-categories/:id — admin-only. Edits label/
 * description/sort order, or toggles is_active (an inactive category
 * disappears from the "tag this report" pickers but existing reports
 * already tagged with it are untouched). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid category id." }, { status: 400 });
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

  const parsed = updateReportCategorySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) update.label = parsed.data.label;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.sortOrder !== undefined) update.sort_order = parsed.data.sortOrder;
  if (parsed.data.isActive !== undefined) update.is_active = parsed.data.isActive;

  const { data, error } = await supabase
    .from("report_categories")
    .update(update)
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ category: data });
}

/** DELETE /api/admin/report-categories/:id — admin-only. Reports already
 * tagged with this category keep their category_key (it just points at a
 * row that no longer exists in the list — `on delete set null` on the FK
 * actually clears it, which is the friendlier outcome). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid category id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { error } = await supabase.from("report_categories").delete().eq("id", parsedParams.data.id);
  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ ok: true });
}
