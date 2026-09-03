import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import {
  mobileHomepageSectionIdParamSchema,
  mobileHomepageSectionUpdateSchema,
  firstIssueMessage,
} from "@/lib/validation";
import { invalidateMobileHomepageFragments } from "@/lib/fragment-cache-invalidation";
import { apiError } from "@/lib/api-error";

/**
 * PATCH  /api/admin/mobile-homepage/:id  — partial update of one section
 * DELETE /api/admin/mobile-homepage/:id  — remove a section
 */

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const parsedParams = mobileHomepageSectionIdParamSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid section id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsedBody = mobileHomepageSectionUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mobile_homepage_sections")
    .update(parsedBody.data)
    .eq("id", parsedParams.data.id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Section not found." }, { status: 404 });
    }
    return apiError(error);
  }

  invalidateMobileHomepageFragments();
  return NextResponse.json({ section: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const parsedParams = mobileHomepageSectionIdParamSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid section id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase } = auth.ctx;

  const { error } = await supabase
    .from("mobile_homepage_sections")
    .delete()
    .eq("id", parsedParams.data.id);

  if (error) return apiError(error);

  invalidateMobileHomepageFragments();
  return NextResponse.json({ ok: true });
}
