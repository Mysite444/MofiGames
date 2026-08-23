import { NextResponse } from "next/server";
import { requireAdmin, publicClient } from "@/lib/supabase/route-auth";
import { seoSettingsUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { invalidateSeoSettingsFragments } from "@/lib/fragment-cache-invalidation";

/** GET /api/admin/seo/settings — read-only, no admin gate: the settings
 * form needs to load before we know whether *this* request is from an
 * admin session doing the initial page fetch, and the row itself is
 * publicly readable anyway (RLS: select true) since public pages read it
 * too. PUT below is the one that's admin-gated. */
export async function GET() {
  const supabase = await publicClient();
  const { data, error } = await supabase.from("seo_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Could not load SEO settings." }, { status: 500 });
  }
  return NextResponse.json({ settings: data });
}

/** PUT /api/admin/seo/settings — partial update of the singleton row.
 * Admin only. */
export async function PUT(request: Request) {
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

  const parsed = seoSettingsUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("seo_settings")
    .update(parsed.data)
    .eq("id", true)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  invalidateSeoSettingsFragments();
  return NextResponse.json({ settings: data });
}
