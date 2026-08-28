import { NextResponse } from "next/server";
import { requireAdmin, publicClient } from "@/lib/supabase/route-auth";
import { localizationSettingsUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** GET /api/admin/localization/settings — read-only, no admin gate: public
 * pages need Region Settings (timezone, date/number formats, etc.) and the
 * row itself is publicly readable (RLS: select true). PUT below is
 * admin-gated. */
export async function GET() {
  const supabase = await publicClient();
  const { data, error } = await supabase.from("localization_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Could not load localization settings." }, { status: 500 });
  }
  return NextResponse.json({ settings: data });
}

/** PUT /api/admin/localization/settings — partial update of the singleton
 * row: Region Settings, Language Switcher, Advanced (auto-detection), and
 * the optional Currency-by-Region / Regional Content Restrictions /
 * Country-Based Redirects lists (each list is replaced wholesale). */
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

  const parsed = localizationSettingsUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("localization_settings")
    .update(parsed.data)
    .eq("id", true)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ settings: data });
}
