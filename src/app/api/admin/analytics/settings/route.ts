import { NextResponse } from "next/server";
import { requireAdmin, publicClient } from "@/lib/supabase/route-auth";
import { analyticsSettingsUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";
import { purgeFragment } from "@/lib/fragment-cache";

/** GET /api/admin/analytics/settings — read-only, no admin gate for the
 * same reason as /api/admin/seo/settings: the form needs to load before
 * we know this is an admin session, and the row is publicly readable
 * anyway (the tracking-script injector reads it on every public page).
 * PUT below is admin-gated. */
export async function GET() {
  const supabase = await publicClient();
  const { data, error } = await supabase.from("analytics_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Could not load analytics settings." }, { status: 500 });
  }
  return NextResponse.json({ settings: data });
}

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

  const parsed = analyticsSettingsUpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("analytics_settings")
    .update(parsed.data)
    .eq("id", true)
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  purgeFragment("analytics-settings");
  return NextResponse.json({ settings: data });
}
