import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { pageUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateNavigationFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

const paramsSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/admin/pages/:id — admin only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid page id." }, { status: 400 });
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

  const parsedBody = pageUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }
  if (Object.keys(parsedBody.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("pages")
    .update(parsedBody.data)
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A page with that slug already exists." }, { status: 409 });
    }
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Page not found." }, { status: 404 });
    }
    return apiError(error);
  }

  invalidateNavigationFragments();
  return NextResponse.json({ page: data });
}

/** DELETE /api/admin/pages/:id — admin only. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid page id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: existing } = await supabase
    .from("pages")
    .select("title, slug")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  const { error } = await supabase.from("pages").delete().eq("id", parsedParams.data.id);
  if (error) {
    return apiError(error);
  }

  await logAdminAction(supabase, user, {
    action: "page_deleted",
    targetType: "page",
    targetId: parsedParams.data.id,
    summary: existing ? `Deleted page "${existing.title}" (${existing.slug}).` : "Deleted a page.",
    metadata: existing ?? {},
  });

  invalidateNavigationFragments();
  return NextResponse.json({ ok: true });
}
