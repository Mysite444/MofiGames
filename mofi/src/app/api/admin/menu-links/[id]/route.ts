import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { menuLinkUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { invalidateNavigationFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/admin/menu-links/:id — admin only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid link id." }, { status: 400 });
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

  const parsedBody = menuLinkUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }
  if (Object.keys(parsedBody.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("menu_links")
    .update(parsedBody.data)
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Menu link not found." }, { status: 404 });
    }
    return apiError(error);
  }

  invalidateNavigationFragments();
  return NextResponse.json({ link: data });
}

/** DELETE /api/admin/menu-links/:id — admin only. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid link id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { error } = await supabase.from("menu_links").delete().eq("id", parsedParams.data.id);
  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ ok: true });
}
